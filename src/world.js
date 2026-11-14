// Procedural city "Sunset Bay": roads, buildings, beach, pier, park, sky and lighting.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { G, CELL, ROAD_W, N, HALF, rng, clamp, lerp } from './ctx.js';

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return tex(c, srgb);
}
function tex(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(ctx, w, h, n, a, size = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}
// Build a tangent-space normal map from a greyscale height canvas (tileable).
function normalFrom(draw, size, strength) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); draw(ctx, size, size);
  const src = ctx.getImageData(0, 0, size, size).data, out = ctx.createImageData(size, size), o = out.data;
  const H = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * strength / 255, dy = (H(x, y - 1) - H(x, y + 1)) * strength / 255;
    const l = 1 / Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    o[i] = (dx * l * 0.5 + 0.5) * 255; o[i + 1] = (-dy * l * 0.5 + 0.5) * 255; o[i + 2] = (l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return tex(c, false);
}

// Road surface is recessed below the sidewalks, like a real street with curbs.
export const ROAD_Y = -0.16;
export function groundY(x, z) {
  if (Math.abs(x) > HALF + 7 || Math.abs(z) > HALF + 7) return 0;
  const dx = Math.abs(x - Math.round(x / CELL) * CELL), dz = Math.abs(z - Math.round(z / CELL) * CELL);
  return dx < 7 || dz < 7 ? ROAD_Y : 0;
}

export function buildWorld(scene) {
  const R = rng(20261114);
  const colliders = G.colliders;
  const flat = (w, d, m, x, y, z) => {
    const me = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    me.rotation.x = -Math.PI / 2; me.position.set(x, y, z); me.receiveShadow = true; scene.add(me); return me;
  };
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
  const m4 = new THREE.Matrix4();
  const boxes = (list, m, cast = true) => { // list of [x, y, z, sx, sy, sz]
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, list.length);
    list.forEach(([x, y, z, sx, sy, sz], i) => im.setMatrixAt(i, m4.makeScale(sx, sy, sz).setPosition(x, y, z)));
    im.castShadow = cast; im.receiveShadow = true; scene.add(im); return im;
  };

  // ---------- ground layers
  const grassT = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#5d8a45'; c.fillRect(0, 0, w, h); noise(c, w, h, 9000, 0.1, 3); });
  grassT.repeat.set(400, 240);
  flat(5000, 3000, std({ map: grassT }), 0, -0.3, HALF + 20 - 1500);
  const paveDraw = (c, w, h, height) => {
    c.fillStyle = height ? '#b0b0b0' : '#aaa59b'; c.fillRect(0, 0, w, h); noise(c, w, h, 5000, height ? 0.12 : 0.07);
    for (let i = 0; i < 40 && !height; i++) { c.fillStyle = `rgba(60,50,40,${Math.random() * 0.06})`; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 30, 0, 7); c.fill(); }
    c.strokeStyle = height ? '#303030' : 'rgba(40,35,30,.35)'; c.lineWidth = height ? 4 : 2;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
  };
  const paveT = canvasTex(512, 512, (c, w, h) => paveDraw(c, w, h, false)), paveN = normalFrom((c, w, h) => paveDraw(c, w, h, true), 512, 2.5);
  paveT.repeat.set(14, 14); paveN.repeat.set(14, 14);
  const paveM = std({ map: paveT, normalMap: paveN, roughness: 0.82 });
  const slabs = [], B = CELL - ROAD_W;
  for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) slabs.push([(i + 0.5) * CELL, -0.2, (j + 0.5) * CELL, B, 0.4, B]);
  const rim = HALF + 11, L2 = HALF * 2 + 30;
  slabs.push([0, -0.2, rim, L2, 0.4, 8], [0, -0.2, -rim, L2, 0.4, 8], [rim, -0.2, 0, 8, 0.4, L2 - 16], [-rim, -0.2, 0, 8, 0.4, L2 - 16]);
  boxes(slabs, paveM, false);
  const sandT = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#e3cf9d'; c.fillRect(0, 0, w, h); noise(c, w, h, 9000, 0.09); });
  const sandN = normalFrom((c, w, h) => { c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); noise(c, w, h, 3000, 0.5, 5); }, 256, 1.2);
  sandT.repeat.set(300, 6); sandN.repeat.set(300, 6);
  flat(3000, 50, std({ map: sandT, normalMap: sandN, roughness: 1 }), 0, -0.02, HALF + 38);
  const seaN = normalFrom((c, w, h) => {
    const im = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w * 6.2832, v = y / h * 6.2832;
      const hgt = Math.sin(u * 3 + Math.sin(v * 2) * 1.3) + Math.sin(v * 5 + u * 2) * 0.6 + Math.sin(u * 9 - v * 7) * 0.3 + Math.sin(u * 17 + v * 13) * 0.15;
      const g = 128 + hgt * 55, i = (y * w + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = g; im.data[i + 3] = 255;
    }
    c.putImageData(im, 0, 0);
  }, 256, 3);
  seaN.repeat.set(90, 45);
  const sea = flat(4000, 2000, new THREE.MeshPhysicalMaterial({ color: 0x0d5f7a, roughness: 0.1, metalness: 0.55, normalMap: seaN, normalScale: new THREE.Vector2(0.55, 0.55) }), 0, -0.4, HALF + 58 + 1000);

  // ---------- roads
  const len = HALF * 2 + ROAD_W;
  const asphalt = (c, w, h) => {
    c.fillStyle = '#3f4147'; c.fillRect(0, 0, w, h); noise(c, w, h, 14000, 0.08);
    for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(20,20,22,${0.05 + Math.random() * 0.1})`; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 30 + Math.random() * 80, 0, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(15,15,15,.5)'; c.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { let x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 50; y += Math.random() * 40; c.lineTo(x, y); } c.stroke(); }
  };
  const roadN = normalFrom((c, w, h) => { c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); noise(c, w, h, 16000, 0.6, 2); }, 512, 1.6);
  const roadT = canvasTex(512, 512, (c, w, h) => {
    asphalt(c, w, h);
    c.fillStyle = 'rgba(235,235,230,.9)'; c.fillRect(14, 0, 8, h); c.fillRect(w - 22, 0, 8, h);
    c.fillStyle = 'rgba(240,190,40,.95)'; c.fillRect(w / 2 - 6, 0, 12, h * 0.55);
    noise(c, w, h, 3000, 0.1);
  });
  roadT.repeat.set(1, len / ROAD_W);
  const roadNr = roadN.clone(); roadNr.repeat.set(2, (len / ROAD_W) * 2); roadNr.needsUpdate = true;
  const roadM = std({ map: roadT, normalMap: roadNr, roughness: 0.78 });
  for (let k = -N; k <= N; k++) {
    flat(ROAD_W, len, roadM, k * CELL, ROAD_Y, 0);
    flat(ROAD_W, len, roadM, 0, ROAD_Y + 0.012, k * CELL).rotation.z = Math.PI / 2;
  }
  const crossT = canvasTex(512, 512, (c, w, h) => {
    asphalt(c, w, h);
    c.fillStyle = 'rgba(232,232,228,.92)';
    for (let s = 0; s < 4; s++) { c.save(); c.translate(w / 2, h / 2); c.rotate((s * Math.PI) / 2); for (let x = -200; x <= 176; x += 52) c.fillRect(x, -248, 26, 52); c.restore(); }
    noise(c, w, h, 3000, 0.1);
  });
  const pg = new THREE.PlaneGeometry(ROAD_W, ROAD_W); pg.rotateX(-Math.PI / 2);
  roadN.repeat.set(2, 2);
  const patches = new THREE.InstancedMesh(pg, std({ map: crossT, normalMap: roadN, roughness: 0.78 }), (2 * N + 1) ** 2);
  const lampPos = [];
  let pi = 0;
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    patches.setMatrixAt(pi++, m4.makeTranslation(i * CELL, ROAD_Y + 0.024, j * CELL));
    lampPos.push([i * CELL + 8.5, j * CELL + 8.5], [i * CELL - 8.5, j * CELL - 8.5]);
  }
  patches.receiveShadow = true; scene.add(patches);

  // ---------- building facades (albedo + normal + roughness/metalness + night glow)
  // Each style lists its window rectangles inside one 512px tile (8 bays x 8 floors).
  const styles = [
    { name: 'grid', rects: () => { const r = []; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) r.push([i * 64 + 13, j * 64 + 12, 38, 40]); return r; } },
    { name: 'strip', rects: () => { const r = []; for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) r.push([i * 128 + 4, j * 64 + 14, 120, 30]); return r; } },
    { name: 'curtain', rects: () => { const r = []; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) r.push([i * 64 + 3, j * 64 + 3, 58, 58]); return r; } },
  ].map((st) => {
    const rects = st.rects(), glass = st.name === 'curtain';
    const map = canvasTex(512, 512, (c, w) => {
      c.fillStyle = glass ? '#59646e' : '#e6e1d8'; c.fillRect(0, 0, w, w); noise(c, w, w, 6000, 0.05);
      if (!glass) for (let j = 0; j < 8; j++) { c.fillStyle = 'rgba(0,0,0,.07)'; c.fillRect(0, j * 64 + 60, w, 4); }
      for (const [x, y, ww, hh] of rects) {
        const g = c.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, '#b9cbdb'); g.addColorStop(1, '#8298ac');
        c.fillStyle = '#3a3f45'; c.fillRect(x - 2, y - 2, ww + 4, hh + 4); c.fillStyle = g; c.fillRect(x, y, ww, hh);
        if (!glass) { c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x - 3, y + hh + 2, ww + 6, 3); }
      }
    });
    const normalMap = normalFrom((c, w) => {
      c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, w, w);
      for (const [x, y, ww, hh] of rects) { c.fillStyle = '#ffffff'; c.fillRect(x - 3, y - 3, ww + 6, hh + 6); c.fillStyle = glass ? '#b0b0b0' : '#505050'; c.fillRect(x, y, ww, hh); }
    }, 512, 3);
    const orm = canvasTex(512, 512, (c, w) => { // G = roughness, B = metalness
      c.fillStyle = 'rgb(255,215,0)'; c.fillRect(0, 0, w, w);
      for (const [x, y, ww, hh] of rects) { c.fillStyle = `rgb(255,${12 + Math.floor(R() * 22)},240)`; c.fillRect(x, y, ww, hh); }
    }, false);
    const glow = canvasTex(512, 512, (c, w) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, w);
      for (const [x, y, ww, hh] of rects) if (R() < (glass ? 0.3 : 0.4)) {
        c.fillStyle = ['#ffd58a', '#ffe9b8', '#ffc46b', '#cfe4ff', '#fff4dc'][Math.floor(R() * 5)]; c.globalAlpha = 0.5 + R() * 0.5; c.fillRect(x, y, ww, hh);
      }
      c.globalAlpha = 1;
    });
    return { map, normalMap, orm, glow };
  });
  const wallMats = [];
  const facade = (style, color) => {
    const s = styles[style];
    const m = new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughnessMap: s.orm, metalnessMap: s.orm, roughness: 1, metalness: 1, color, emissive: 0xffffff, emissiveMap: s.glow, emissiveIntensity: 0, envMapIntensity: 1.25 });
    wallMats.push(m); return m;
  };
  const palette = [0xf2cfc0, 0xb5ddd6, 0xf5ead0, 0xf0c49e, 0xf2f1ee, 0xc3d8ee, 0xe2c8e6, 0xd9c9b0];
  const lowMats = palette.map((c, i) => facade(i % 2, c));
  const towerMats = [0xbfd4e6, 0x9fc4c0, 0xd9c7a8, 0xaab4c8, 0xe8eef2].map((c) => facade(2, c));
  const roofM = std({ color: 0x6f7378, roughness: 0.95 });
  const caps = [], plinths = [], acs = [];
  function building(x, z, w, d, h, mi, tower = false) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      if (f === 2 || f === 3) continue;
      const su = Math.max(1, Math.round((f < 2 ? d : w) / 2.4)) / 8, sv = Math.max(1, Math.round(h / 3.4)) / 8;
      for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
    const wm = tower ? towerMats[mi % towerMats.length] : lowMats[mi % lowMats.length];
    const me = new THREE.Mesh(g, [wm, wm, roofM, roofM, wm, wm]);
    me.position.set(x, h / 2, z); me.castShadow = me.receiveShadow = true; scene.add(me);
    caps.push([x, h + 0.25, z, w + 0.5, 0.7, d + 0.5]);
    plinths.push([x, 1.6, z, w + 0.24, 3.2, d + 0.24]);
    const n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) { const s = 1.2 + R() * 2; acs.push([x + (R() - 0.5) * (w - 5), h + 0.6 + s * 0.35, z + (R() - 0.5) * (d - 5), s * 1.4, s * 0.7, s]); }
    if (tower && h > 55) acs.push([x, h + 6, z, 0.25, 12, 0.25]);
    colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
    return me;
  }
  const reserved = new Set(['0,0', '-1,-1', '-2,-1', '2,2']);
  const blocks = [];
  for (let bi = -N; bi < N; bi++) for (let bj = -N; bj < N; bj++) {
    const cx = (bi + 0.5) * CELL, cz = (bj + 0.5) * CELL;
    blocks.push({ cx, cz, park: bi < 0 && bi > -3 && bj === -1 });
    if (reserved.has(`${bi},${bj}`)) continue;
    const dist = Math.hypot(cx + 40, cz + 120);
    const tall = Math.max(0, 95 - dist * 0.45);
    const S = 56, nx = R() < 0.55 ? 2 : 1, nz = R() < 0.55 ? 2 : 1;
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const lw = S / nx, ld = S / nz;
      const w = lw - 3 - R() * 5, d = ld - 3 - R() * 5;
      const h = Math.max(7, 8 + R() * 16 + tall * (0.4 + R() * 0.9) - (cz > 200 ? 4 : 0));
      building(cx - S / 2 + lw * (ix + 0.5), cz - S / 2 + ld * (iz + 0.5), w, d, h, Math.floor(R() * 8), h > 38);
    }
  }
  const finishBuildings = () => {
    boxes(caps, std({ color: 0xd8d4cc, roughness: 0.8 }));
    boxes(plinths, std({ color: 0x66717c, roughness: 0.2, metalness: 0.7, envMapIntensity: 1.5 }), false);
    boxes(acs, std({ color: 0x9a9da1, roughness: 0.6, metalness: 0.4 }));
  };

  // ---------- signs
  function sign(text, w, h, x, y, z, ry, bg, fg) {
    const t = canvasTex(512, 128, (c) => {
      c.fillStyle = bg; c.fillRect(0, 0, 512, 128); c.fillStyle = fg; c.font = 'bold 64px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 256, 68);
    });
    const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35 }));
    me.position.set(x, y, z); me.rotation.y = ry; scene.add(me);
  }

  // ---------- garage (block 0,0)
  building(40, 22, 36, 16, 7.5, 1);
  sign("MAYA'S GARAGE", 16, 2.4, 40, 6, 30.06, 0, '#12343b', '#ffd166');
  for (const dx of [-10, 0, 10]) { // roller doors
    const d = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), std({ color: 0x51606b, metalness: 0.5, roughness: 0.5 }));
    d.position.set(40 + dx, 2, 30.2); scene.add(d);
  }
  building(16, 62, 12, 14, 6, 3); building(66, 62, 10, 14, 9, 5);

  // ---------- plaza (block 2,2): tables + umbrellas
  const umb = [0xff5d73, 0xffd166, 0x3ec1d3];
  for (let i = 0; i < 6; i++) {
    const x = 186 + (i % 3) * 9, z = 206 + Math.floor(i / 3) * 9;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6), std({ color: 0xdddddd })); pole.position.set(x, 1.3, z);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2, 0.7, 10), std({ color: umb[i % 3] })); top.position.set(x, 2.7, z); top.castShadow = true;
    const tab = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 16), std({ color: 0xffffff })); tab.position.set(x, 0.85, z); tab.castShadow = true;
    scene.add(pole, top, tab); colliders.push({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6, h: 1 });
  }
  building(176, 176, 14, 14, 10, 0); building(224, 224, 14, 14, 12, 6); building(224, 176, 12, 12, 8, 2);
  sign("RICO'S SLICES", 5, 1, 200, 2.75, 197.2, 0, '#b3261e', '#fff3d6');

  finishBuildings();

  // ---------- park
  const parkT = grassT.clone(); parkT.repeat.set(10, 10); parkT.needsUpdate = true;
  const grassM = std({ map: parkT, color: 0xd9f0b0, roughness: 1 });
  flat(66, 66, grassM, -40, 0.03, -40); flat(66, 66, grassM, -120, 0.03, -40);
  const fb = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.8, 28), std({ color: 0xd9d4c7 })); fb.position.set(-40, 0.4, -40); fb.castShadow = true;
  const fw = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.1, 28), std({ color: 0x4fc3e8, roughness: 0.1, metalness: 0.3 })); fw.position.set(-40, 0.8, -40);
  const fs = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.5, 12), std({ color: 0xcfeefc, transparent: true, opacity: 0.7 })); fs.position.set(-40, 2.4, -40);
  scene.add(fb, fw, fs); colliders.push({ x0: -45, x1: -35, z0: -45, z1: -35, h: 1 });

  // ---------- vegetation (instanced)
  const instanced = (geo, m, list, scaleJit = 0.25) => {
    const im = new THREE.InstancedMesh(geo, m, list.length), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    list.forEach(([x, z], i) => {
      const k = 1 - scaleJit / 2 + R() * scaleJit; q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, R() * 6.28);
      im.setMatrixAt(i, m4.compose(p.set(x, 0, z), q, s.set(k, k, k)));
    });
    im.castShadow = true; scene.add(im); return im;
  };
  const palms = [];
  for (let x = -HALF + 8; x <= HALF - 8; x += 16) palms.push([x, HALF + 11.5]);
  for (let z = -HALF + 20; z < HALF; z += 20) if (Math.abs(((z + 4000) % CELL) - 40) < 28) palms.push([9.5, z], [-9.5, z]);
  for (let x = -HALF + 20; x < HALF; x += 20) if (Math.abs(((x + 4000) % CELL) - 40) < 28) palms.push([x, 169.5], [x, 150.5]);
  palms.push([12, 36], [68, 36], [184, 190], [216, 208], [60, HALF + 30], [-90, HALF + 34], [150, HALF + 30], [-220, HALF + 32], [250, HALF + 34]);
  const trunk = new THREE.CylinderGeometry(0.16, 0.3, 7.5, 7); trunk.translate(0, 3.75, 0);
  const fronds = [];
  for (let i = 0; i < 8; i++) {
    const f = new THREE.ConeGeometry(0.55, 4.2, 4); f.scale(1, 1, 0.18); f.translate(0, 2.1, 0);
    f.rotateZ(-1.15 - (i % 2) * 0.35); f.rotateY((i / 8) * Math.PI * 2); f.translate(0, 7.4, 0); fronds.push(f);
  }
  instanced(trunk, std({ color: 0x8a6a48 }), palms);
  const palmLeaves = new THREE.InstancedMesh(mergeGeometries(fronds), std({ color: 0x3c7f3f, side: THREE.DoubleSide, roughness: 0.9 }), palms.length);
  palms.forEach(([x, z], i) => palmLeaves.setMatrixAt(i, m4.makeRotationY(i * 1.7).setPosition(x, (i % 3) * 0.3 - 0.3, z)));
  palmLeaves.castShadow = true; scene.add(palmLeaves);
  const trees = [];
  for (let i = 0; i < 46; i++) {
    const x = -150 + R() * 140, z = -70 + R() * 60;
    if (Math.hypot(x + 40, z + 40) > 9 && Math.abs(x + 80) > 9) trees.push([x, z]);
  }
  const tt = new THREE.CylinderGeometry(0.25, 0.35, 3, 6); tt.translate(0, 1.5, 0);
  const blobs = [[0, 4.8, 0, 2.3], [1.4, 4.2, 0.4, 1.7], [-1.2, 4.3, -0.6, 1.8], [0.2, 4.1, 1.4, 1.6], [-0.3, 6.1, -0.2, 1.6], [0.4, 4.4, -1.5, 1.5]].map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + (Math.sin(p.getX(i) * 9.1) + Math.sin(p.getY(i) * 7.3) + Math.sin(p.getZ(i) * 8.7)) * 0.07; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k); }
    g.translate(x, y, z); return g;
  });
  const tl = mergeGeometries(blobs); tl.computeVertexNormals();
  instanced(tt, std({ color: 0x6b4a2f }), trees, 0);
  const tlm = instanced(tl, std({ color: 0x3f7d3a, roughness: 0.95 }), trees, 0);
  trees.forEach(([x, z], i) => { const k = 0.8 + ((i * 37) % 10) / 20; tlm.setMatrixAt(i, m4.makeScale(k, k, k).setPosition(x, 0, z)); });

  // ---------- street lamps
  const pole = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6); pole.translate(0, 3.25, 0);
  const lampM = std({ color: 0xfff2cc, emissive: 0xffd58a, emissiveIntensity: 0 });
  const ig = (geo, m) => { const im = new THREE.InstancedMesh(geo, m, lampPos.length); lampPos.forEach(([x, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, 0, z))); scene.add(im); return im; };
  ig(pole, std({ color: 0x3a3f46 }));
  const head = new THREE.SphereGeometry(0.42, 10, 8); head.translate(0, 6.7, 0);
  ig(head, lampM);
  const poolT = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 2, 64, 64, 64); g.addColorStop(0, 'rgba(255,214,150,1)'); g.addColorStop(0.4, 'rgba(255,190,110,.45)'); g.addColorStop(1, 'rgba(255,170,90,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
  const poolG = new THREE.PlaneGeometry(26, 26); poolG.rotateX(-Math.PI / 2);
  const poolM = new THREE.MeshBasicMaterial({ map: poolT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const pools = new THREE.InstancedMesh(poolG, poolM, lampPos.length); lampPos.forEach(([x, z], i) => pools.setMatrixAt(i, m4.makeTranslation(x - Math.sign(x - Math.round(x / CELL) * CELL) * 3, 0.06, z - Math.sign(z - Math.round(z / CELL) * CELL) * 3)));
  pools.renderOrder = 2; scene.add(pools);

  // ---------- pier + ferris wheel
  const woodM = std({ color: 0x9b7653 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 74), woodM); deck.position.set(0, -0.2, HALF + 91); deck.receiveShadow = true; scene.add(deck);
  const postG = new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6), posts = [];
  for (let z = HALF + 56; z <= HALF + 128; z += 4) posts.push([3.8, z], [-3.8, z]);
  const pim = new THREE.InstancedMesh(postG, woodM, posts.length); posts.forEach(([x, z], i) => pim.setMatrixAt(i, m4.makeTranslation(x, 0.6, z))); scene.add(pim);
  for (const s of [1, -1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 72), woodM); rail.position.set(3.8 * s, 1.15, HALF + 92); scene.add(rail); }
  const wheel = new THREE.Group(); wheel.position.set(60, 17.5, HALF + 36);
  const rimM = std({ color: 0xffffff, emissive: 0xff6fb5, emissiveIntensity: 0 });
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(14, 0.3, 8, 48), rimM), new THREE.Mesh(new THREE.TorusGeometry(11, 0.15, 6, 40), rimM));
  const gondolaC = [0xff5d73, 0xffd166, 0x3ec1d3, 0x9b5de5];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 14, 5), rimM); sp.position.set(Math.cos(a) * 7, Math.sin(a) * 7, 0); sp.rotation.z = a + Math.PI / 2; wheel.add(sp);
    const go = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), std({ color: gondolaC[i % 4] })); go.position.set(Math.cos(a) * 14, Math.sin(a) * 14, 0); go.castShadow = true; wheel.add(go);
  }
  scene.add(wheel);
  for (const s of [1, -1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 19, 8), std({ color: 0xe8e8ee })); leg.position.set(60 + s * 4.5, 8.8, HALF + 36); leg.rotation.z = s * 0.25; leg.castShadow = true; scene.add(leg);
  }
  colliders.push({ x0: 52, x1: 68, z0: HALF + 34, z1: HALF + 38, h: 20 });

  // ---------- distant hills
  const hillM = std({ color: 0x4f8f4a, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = Math.PI + (i / 25) * Math.PI, d = 560 + R() * 320, r = 110 + R() * 150;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(r, 50 + R() * 110, 7), hillM);
    hill.position.set(Math.cos(a) * d * 1.25, 20, Math.sin(a) * d); scene.add(hill);
  }

  return {
    blocks, wallMats, lampM, rimM,
    update(dt, night) {
      seaN.offset.x += dt * 0.006; seaN.offset.y += dt * 0.014; poolM.opacity = night * 0.3; pools.visible = night > 0.02;
      wheel.rotation.z += dt * 0.12;
      for (const w of wallMats) w.emissiveIntensity = night * 1.0;
      lampM.emissiveIntensity = night * 3.5; rimM.emissiveIntensity = night * 2.5;
    },
  };
}

// ------------------------------------------------------------------ sky + lights
// Physically based atmosphere (Preetham sky). The same sky is baked into an environment
// map, so glass, car paint and water reflect the real colour of the sky at every hour.
export function buildEnv(scene, renderer) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.3); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = true;
  const sc = sun.shadow.camera; sc.left = sc.bottom = -110; sc.right = sc.top = 110; sc.near = 10; sc.far = 600;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.06; sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  scene.fog = new THREE.FogExp2(0xffffff, 0.00055);

  const sky = new Sky(); sky.scale.setScalar(3500); sky.material.fog = false; sky.renderOrder = -3; scene.add(sky);
  const U = sky.material.uniforms;
  const envScene = new THREE.Scene(), sky2 = new Sky(); sky2.material = sky.material; sky2.scale.setScalar(900); envScene.add(sky2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, envTod = -99;

  const sp = new Float32Array(1400 * 3), R = rng(7);
  for (let i = 0; i < 1400; i++) {
    const a = R() * 6.283, e = Math.acos(R() * 0.98);
    sp.set([Math.sin(e) * Math.cos(a) * 3000, Math.cos(e) * 3000 + 20, Math.sin(e) * Math.sin(a) * 3000], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starM = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Points(sg, starM); stars.renderOrder = -1; scene.add(stars);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(45, 24, 16), new THREE.MeshBasicMaterial({ color: 0xe6ecff, fog: false })); scene.add(moon);

  const K = {
    day: { fog: new THREE.Color(0x8fb2d4), light: new THREE.Color(0xfff1dc) },
    dusk: { fog: new THREE.Color(0xd9966c), light: new THREE.Color(0xffa565) },
    night: { fog: new THREE.Color(0x05070e), light: new THREE.Color(0x9fb4ff) },
  };
  const dir = new THREE.Vector3(), sunDir = new THREE.Vector3(), cFog = new THREE.Color(), cLight = new THREE.Color();
  const env = {
    night: 0, sun,
    update(tod, focus, camPos) {
      const a = ((tod - 6) / 12) * Math.PI, e = Math.sin(a);
      const A = K.dusk, B = e >= 0 ? K.day : K.night, t = clamp(e >= 0 ? e / 0.4 : -e / 0.2, 0, 1);
      cFog.lerpColors(A.fog, B.fog, t); cLight.lerpColors(A.light, B.light, t);
      env.night = clamp(0.2 - e / 0.2, 0, 1);
      sunDir.set(Math.cos(a), e, 0.45).normalize();
      U.sunPosition.value.copy(sunDir);
      U.turbidity.value = lerp(7, 3.2, t); U.rayleigh.value = e >= 0 ? lerp(3.2, 1.3, t) : lerp(3.2, 0.25, t);
      U.mieCoefficient.value = 0.004; U.mieDirectionalG.value = 0.82;
      scene.fog.color.copy(cFog); scene.fog.density = lerp(0.0006, 0.00032, e >= 0 ? t : 0);
      // refresh image-based lighting when the sky has changed enough
      if (Math.abs(tod - envTod) > 0.08) {
        envTod = tod; const old = envRT;
        envRT = pmrem.fromScene(envScene, 0, 0.1, 2000); scene.environment = envRT.texture; old?.dispose();
      }
      scene.environmentIntensity = e >= 0 ? lerp(0.8, 0.5, t) : 0.8 + env.night * 0.6;
      dir.copy(sunDir);
      moon.position.copy(camPos).addScaledVector(dir, -3200); moon.visible = e < 0.1;
      if (e < -0.04) dir.multiplyScalar(-1); // moonlight at night
      dir.y = Math.max(dir.y, 0.28); dir.normalize();
      sun.position.copy(focus).addScaledVector(dir, 260); sun.target.position.copy(focus);
      sun.color.copy(cLight);
      sun.intensity = e >= 0 ? lerp(2.0, 3.9, t) * clamp(e / 0.06, 0.15, 1) : lerp(0.3, 0.5, t);
      hemi.intensity = lerp(0.12, 0.55, env.night); hemi.color.copy(cFog).lerp(cLight, 0.4);
      starM.opacity = env.night;
      sky.position.copy(camPos); stars.position.copy(camPos);
      renderer.toneMappingExposure = lerp(0.5, 0.75, env.night);
    },
    setShadowSize(px) { sun.shadow.mapSize.set(px, px); sun.shadow.map?.dispose(); sun.shadow.map = null; },
  };
  return env;
}
