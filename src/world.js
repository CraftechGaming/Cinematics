// Procedural city "Sunset Bay": roads, buildings, beach, pier, park, sky and lighting.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, CELL, ROAD_W, N, HALF, rng, clamp, lerp } from './ctx.js';

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(ctx, w, h, n, a) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

export function buildWorld(scene) {
  const R = rng(20261114);
  const colliders = G.colliders;
  const flat = (w, d, m, x, y, z) => {
    const me = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    me.rotation.x = -Math.PI / 2; me.position.set(x, y, z); me.receiveShadow = true; scene.add(me); return me;
  };
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });

  // ---------- ground layers
  flat(5000, 3000, std({ color: 0x5f9a4e }), 0, -0.12, HALF + 20 - 1500);
  const paveT = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#b9b4aa'; c.fillRect(0, 0, w, h); noise(c, w, h, 2500, 0.06);
    c.strokeStyle = 'rgba(0,0,0,.13)'; c.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, h); c.moveTo(0, i * 64); c.lineTo(w, i * 64); c.stroke(); }
  });
  paveT.repeat.set(170, 170);
  flat(HALF * 2 + 30, HALF * 2 + 30, std({ map: paveT }), 0, 0, 0);
  const sandT = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#ecd9a6'; c.fillRect(0, 0, w, h); noise(c, w, h, 6000, 0.08); });
  sandT.repeat.set(150, 6);
  flat(3000, 50, std({ map: sandT }), 0, -0.02, HALF + 38);
  const seaT = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#1b86a8'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.1})`; c.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 50, 2); }
  });
  seaT.repeat.set(60, 30);
  const sea = flat(4000, 2000, std({ map: seaT, roughness: 0.25, metalness: 0.2 }), 0, -0.3, HALF + 58 + 1000);

  // ---------- roads
  const len = HALF * 2 + ROAD_W;
  const roadT = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#4b4e57'; c.fillRect(0, 0, w, h); noise(c, w, h, 5000, 0.07);
    c.fillStyle = '#e8e8e8'; c.fillRect(7, 0, 4, h); c.fillRect(w - 11, 0, 4, h);
    c.fillStyle = '#f2c230'; c.fillRect(w / 2 - 3, 0, 6, h * 0.55);
  });
  roadT.repeat.set(1, len / ROAD_W);
  const roadM = std({ map: roadT });
  for (let k = -N; k <= N; k++) {
    flat(ROAD_W, len, roadM, k * CELL, 0.03, 0);
    flat(ROAD_W, len, roadM, 0, 0.05, k * CELL).rotation.z = Math.PI / 2;
  }
  const crossT = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#4b4e57'; c.fillRect(0, 0, w, h); noise(c, w, h, 5000, 0.07);
    c.fillStyle = '#e4e4e4';
    for (let s = 0; s < 4; s++) { c.save(); c.translate(w / 2, h / 2); c.rotate((s * Math.PI) / 2); for (let x = -100; x <= 88; x += 26) c.fillRect(x, -124, 13, 26); c.restore(); }
  });
  const pg = new THREE.PlaneGeometry(ROAD_W, ROAD_W); pg.rotateX(-Math.PI / 2);
  const patches = new THREE.InstancedMesh(pg, std({ map: crossT }), (2 * N + 1) ** 2);
  const lampPos = [], m4 = new THREE.Matrix4();
  let pi = 0;
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    patches.setMatrixAt(pi++, m4.makeTranslation(i * CELL, 0.07, j * CELL));
    lampPos.push([i * CELL + 8.5, j * CELL + 8.5], [i * CELL - 8.5, j * CELL - 8.5]);
  }
  patches.receiveShadow = true; scene.add(patches);

  // ---------- buildings
  const wallT = canvasTex(512, 512, (c, w) => {
    c.fillStyle = '#efece6'; c.fillRect(0, 0, w, w);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const g = c.createLinearGradient(0, j * 64 + 14, 0, j * 64 + 50); g.addColorStop(0, '#7fa0c0'); g.addColorStop(1, '#3c566f');
      c.fillStyle = g; c.fillRect(i * 64 + 12, j * 64 + 14, 40, 36);
      c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(i * 64 + 8, j * 64 + 52, 48, 4);
    }
  });
  const glowT = canvasTex(512, 512, (c, w) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, w);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (R() < 0.42) {
      c.fillStyle = ['#ffd98a', '#fff0c4', '#ffc46b', '#bfe0ff'][Math.floor(R() * 4)];
      c.fillRect(i * 64 + 12, j * 64 + 14, 40, 36);
    }
  });
  const palette = [0xffd0c2, 0xa9e3dc, 0xfff1cf, 0xffc79b, 0xf4f4f4, 0xb9d9f7, 0xe9c4ee, 0xd8ecb0];
  const wallMats = palette.map((c) => std({ map: wallT, color: c, emissive: 0xffffff, emissiveMap: glowT, emissiveIntensity: 0 }));
  const roofM = std({ color: 0x8b8f96 });
  function building(x, z, w, d, h, mi) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      if (f === 2 || f === 3) continue;
      const su = Math.max(1, Math.round((f < 2 ? d : w) / 2.2)) / 8, sv = Math.max(1, Math.round(h / 3.3)) / 8;
      for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
    const wm = wallMats[mi % wallMats.length];
    const me = new THREE.Mesh(g, [wm, wm, roofM, roofM, wm, wm]);
    me.position.set(x, h / 2, z); me.castShadow = me.receiveShadow = true; scene.add(me);
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
    const tall = Math.max(0, 85 - dist * 0.42);
    const S = 56, nx = R() < 0.55 ? 2 : 1, nz = R() < 0.55 ? 2 : 1;
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const lw = S / nx, ld = S / nz;
      const w = lw - 3 - R() * 5, d = ld - 3 - R() * 5;
      const h = 7 + R() * 16 + tall * (0.4 + R() * 0.8) - (cz > 200 ? 4 : 0);
      building(cx - S / 2 + lw * (ix + 0.5), cz - S / 2 + ld * (iz + 0.5), w, d, Math.max(6, h), Math.floor(R() * 8));
    }
  }

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
    d.position.set(40 + dx, 2, 30.05); scene.add(d);
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

  // ---------- park
  const grassM = std({ color: 0x58a646 });
  flat(146, 66, grassM, -80, 0.04, -40);
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
  const palmLeaves = new THREE.InstancedMesh(mergeGeometries(fronds), std({ color: 0x2f8f46, side: THREE.DoubleSide }), palms.length);
  palms.forEach(([x, z], i) => palmLeaves.setMatrixAt(i, m4.makeRotationY(i * 1.7).setPosition(x, (i % 3) * 0.3 - 0.3, z)));
  palmLeaves.castShadow = true; scene.add(palmLeaves);
  const trees = [];
  for (let i = 0; i < 46; i++) {
    const x = -150 + R() * 140, z = -70 + R() * 60;
    if (Math.hypot(x + 40, z + 40) > 9) trees.push([x, z]);
  }
  const tt = new THREE.CylinderGeometry(0.25, 0.35, 3, 6); tt.translate(0, 1.5, 0);
  const tl = new THREE.IcosahedronGeometry(2.6, 1); tl.translate(0, 4.6, 0);
  instanced(tt, std({ color: 0x6b4a2f }), trees, 0);
  const tlm = instanced(tl, std({ color: 0x3f9a45, flatShading: true }), trees, 0);
  trees.forEach(([x, z], i) => { const k = 0.8 + ((i * 37) % 10) / 20; tlm.setMatrixAt(i, m4.makeScale(k, k, k).setPosition(x, 0, z)); });

  // ---------- street lamps
  const pole = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6); pole.translate(0, 3.25, 0);
  const lampM = std({ color: 0xfff2cc, emissive: 0xffd58a, emissiveIntensity: 0 });
  const ig = (geo, m) => { const im = new THREE.InstancedMesh(geo, m, lampPos.length); lampPos.forEach(([x, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, 0, z))); scene.add(im); return im; };
  ig(pole, std({ color: 0x3a3f46 }));
  const head = new THREE.SphereGeometry(0.42, 10, 8); head.translate(0, 6.7, 0);
  ig(head, lampM);

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
      seaT.offset.x += dt * 0.004; seaT.offset.y += dt * 0.012;
      wheel.rotation.z += dt * 0.12;
      for (const w of wallMats) w.emissiveIntensity = night * 0.9;
      lampM.emissiveIntensity = night * 3; rimM.emissiveIntensity = night * 1.6;
    },
  };
}

// ------------------------------------------------------------------ sky + lights
export function buildEnv(scene) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9488, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = true;
  const sc = sun.shadow.camera; sc.left = sc.bottom = -95; sc.right = sc.top = 95; sc.near = 10; sc.far = 500;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog(0xffffff, 260, 2400);
  const skyM = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, pow(clamp(h*1.25,0.0,1.0),0.6)),1.0); }',
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 24, 12), skyM); dome.renderOrder = -2; scene.add(dome);
  const sp = new Float32Array(900 * 3), R = rng(7);
  for (let i = 0; i < 900; i++) {
    const a = R() * 6.283, e = Math.acos(R() * 0.98);
    sp.set([Math.sin(e) * Math.cos(a) * 1700, Math.cos(e) * 1700 + 20, Math.sin(e) * Math.sin(a) * 1700], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starM = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(sg, starM); stars.renderOrder = -1; scene.add(stars);
  const disc = (c, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: c, fog: false })); scene.add(m); return m; };
  const sunDisc = disc(0xfff3c4, 55), moonDisc = disc(0xdfe8ff, 32);

  const K = {
    day: { top: new THREE.Color(0x2a78d6), bot: new THREE.Color(0xb9ddf6), light: new THREE.Color(0xfff3de) },
    dusk: { top: new THREE.Color(0x3b3285), bot: new THREE.Color(0xff9a5e), light: new THREE.Color(0xffb27a) },
    night: { top: new THREE.Color(0x03050c), bot: new THREE.Color(0x151e3c), light: new THREE.Color(0x8ea6ff) },
  };
  const dir = new THREE.Vector3(), cTop = new THREE.Color(), cBot = new THREE.Color(), cLight = new THREE.Color();
  const env = {
    night: 0, sun,
    update(tod, focus, camPos, renderer) {
      const a = ((tod - 6) / 12) * Math.PI, e = Math.sin(a);
      const A = K.dusk, B = e >= 0 ? K.day : K.night, t = clamp(e >= 0 ? e / 0.38 : -e / 0.22, 0, 1);
      cTop.lerpColors(A.top, B.top, t); cBot.lerpColors(A.bot, B.bot, t); cLight.lerpColors(A.light, B.light, t);
      skyM.uniforms.top.value.copy(cTop); skyM.uniforms.bot.value.copy(cBot);
      scene.fog.color.copy(cBot);
      env.night = clamp(0.5 - e / 0.24, 0, 1);
      dir.set(Math.cos(a), e, 0.45).normalize();
      sunDisc.position.copy(camPos).addScaledVector(dir, 1650);
      moonDisc.position.copy(camPos).addScaledVector(dir, -1650);
      if (e < -0.04) dir.multiplyScalar(-1); // moonlight at night
      dir.y = Math.max(dir.y, 0.32); dir.normalize();
      sun.position.copy(focus).addScaledVector(dir, 220); sun.target.position.copy(focus);
      sun.color.copy(cLight);
      sun.intensity = e >= 0 ? lerp(1.5, 3.0, t) : lerp(1.5, 0.5, t);
      hemi.intensity = lerp(0.55, 1.7, clamp(e / 0.3 + 0.5, 0, 1));
      hemi.color.copy(cBot).lerp(cTop, 0.3).lerp(cLight.clone().set(0xffffff), 0.35);
      starM.opacity = env.night;
      dome.position.copy(camPos); stars.position.copy(camPos);
      renderer.toneMappingExposure = lerp(1.0, 0.85, env.night);
    },
    setShadowSize(px) { sun.shadow.mapSize.set(px, px); sun.shadow.map?.dispose(); sun.shadow.map = null; },
  };
  return env;
}
