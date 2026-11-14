// Procedural characters (with a jointed rig for animation) and cars.
import * as THREE from 'three';
import { lerp, clamp, damp, angLerp } from './ctx.js';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });

// ---------------------------------------------------------------- humans
let HG = null;
function humanGeo() {
  if (HG) return HG;
  const torso = new THREE.CapsuleGeometry(0.17, 0.3, 4, 12); torso.scale(1.15, 1, 0.75);
  HG = {
    hips: new THREE.BoxGeometry(0.34, 0.2, 0.2), torso,
    head: new THREE.SphereGeometry(0.125, 16, 12),
    hair: new THREE.SphereGeometry(0.137, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52).rotateX(-0.55),
    eye: new THREE.SphereGeometry(0.017, 6, 6),
    uArm: new THREE.CapsuleGeometry(0.05, 0.2, 3, 8), lArm: new THREE.CapsuleGeometry(0.043, 0.2, 3, 8),
    hand: new THREE.SphereGeometry(0.055, 8, 8),
    uLeg: new THREE.CapsuleGeometry(0.078, 0.3, 3, 8), lLeg: new THREE.CapsuleGeometry(0.064, 0.3, 3, 8),
    foot: new THREE.BoxGeometry(0.11, 0.08, 0.26),
  };
  return HG;
}

export function makeHuman(o) {
  const geo = humanGeo(), g = new THREE.Group();
  const skin = mat(o.skin), shirt = mat(o.shirt), pants = mat(o.pants), hair = mat(o.hair), shoe = mat(0x2a2a2e), eye = mat(0x15151a);
  const mesh = (ge, m, parent, x = 0, y = 0, z = 0) => {
    const me = new THREE.Mesh(ge, m); me.position.set(x, y, z); me.castShadow = true; parent.add(me); return me;
  };
  const pivot = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  const root = pivot(g, 0, 0, 0);
  const hips = pivot(root, 0, 0.95, 0); mesh(geo.hips, pants, hips);
  const torso = pivot(hips, 0, 0.05, 0); mesh(geo.torso, shirt, torso, 0, 0.3, 0);
  const head = pivot(torso, 0, 0.66, 0);
  mesh(geo.head, skin, head, 0, 0.1, 0); mesh(geo.hair, hair, head, 0, 0.105, -0.008);
  mesh(geo.eye, eye, head, 0.045, 0.11, 0.115); mesh(geo.eye, eye, head, -0.045, 0.11, 0.115);
  const P = { root, hips, torso, head };
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    const arm = pivot(torso, 0.26 * s, 0.52, 0); mesh(geo.uArm, shirt, arm, 0, -0.14, 0);
    const elbow = pivot(arm, 0, -0.29, 0); mesh(geo.lArm, skin, elbow, 0, -0.13, 0); mesh(geo.hand, skin, elbow, 0, -0.28, 0);
    const leg = pivot(hips, 0.1 * s, -0.03, 0); mesh(geo.uLeg, pants, leg, 0, -0.22, 0);
    const knee = pivot(leg, 0, -0.45, 0); mesh(geo.lLeg, pants, knee, 0, -0.2, 0); mesh(geo.foot, shoe, knee, 0, -0.43, 0.05);
    P['arm' + n] = arm; P['elbow' + n] = elbow; P['leg' + n] = leg; P['knee' + n] = knee;
  }
  g.scale.setScalar(o.scale || 0.95);
  return { group: g, parts: P };
}

// mode: 'move' (idle/walk/run blended by amp), 'talk', 'startle', 'air'
export function poseHuman(h, phase, amp, mode, t) {
  const P = h.parts, s = Math.sin(phase), c = Math.cos(phase);
  P.legL.rotation.x = s * 0.8 * amp; P.legR.rotation.x = -s * 0.8 * amp;
  P.kneeL.rotation.x = Math.max(0, -c) * 1.3 * amp; P.kneeR.rotation.x = Math.max(0, c) * 1.3 * amp;
  P.armL.rotation.set(-s * 0.7 * amp, 0, 0.06); P.armR.rotation.set(s * 0.7 * amp, 0, -0.06);
  P.elbowL.rotation.x = P.elbowR.rotation.x = -0.15 - amp * 0.9;
  P.root.position.y = Math.abs(c) * 0.05 * amp;
  P.torso.rotation.set(0.12 * amp + Math.sin(t * 1.6) * 0.012, s * 0.08 * amp, 0);
  P.torso.scale.setScalar(1 + Math.sin(t * 1.6) * 0.008 * (1 - amp));
  P.head.rotation.set(0, 0, 0);
  if (mode === 'talk') {
    P.armR.rotation.x = -0.9 + Math.sin(t * 5) * 0.25; P.elbowR.rotation.x = -1.3 + Math.sin(t * 7) * 0.2;
    P.head.rotation.x = Math.sin(t * 6) * 0.05; P.head.rotation.y = Math.sin(t * 2.3) * 0.08;
  } else if (mode === 'startle') {
    P.armL.rotation.set(-2.7, 0, 0.5); P.armR.rotation.set(-2.7, 0, -0.5);
    P.elbowL.rotation.x = P.elbowR.rotation.x = -0.3;
  } else if (mode === 'air') {
    P.legL.rotation.x = -0.6; P.legR.rotation.x = 0.3; P.kneeL.rotation.x = 1.0; P.kneeR.rotation.x = 0.6;
    P.armL.rotation.set(-0.4, 0, 0.9); P.armR.rotation.set(-0.4, 0, -0.9);
  } else if (mode === 'wave') {
    P.armR.rotation.set(-2.9, 0, -0.3 + Math.sin(t * 9) * 0.35); P.elbowR.rotation.x = -0.3;
  }
}

// ---------------------------------------------------------------- cars
export const SPECS = {
  pebble: { name: 'Pebble', style: 'compact', L: 3.7, W: 1.7, r: 0.33, top: 31, acc: 10, turn: 2.5, color: 0xffc233 },
  dune: { name: 'Dune', style: 'pickup', L: 5.0, W: 1.95, r: 0.42, top: 36, acc: 11, turn: 2.2, color: 0x2fa89e },
  comet: { name: 'Comet', style: 'sport', L: 4.5, W: 1.95, r: 0.36, top: 50, acc: 17, turn: 2.4, color: 0xff3366 },
  sedan: { name: 'Sedan', style: 'sedan', L: 4.5, W: 1.85, r: 0.35, top: 30, acc: 8, turn: 2.2, color: 0xffffff },
  van: { name: 'Van', style: 'van', L: 5.2, W: 2.05, r: 0.38, top: 26, acc: 6, turn: 2.0, color: 0xffffff },
};

function profiles(style, a) {
  switch (style) {
    case 'compact': return { body: [[-a, 0.3], [a, 0.3], [a, 0.72], [a - 0.3, 0.88], [-a + 0.1, 0.92], [-a, 0.72]], cab: [[-a + 0.2, 0.9], [a - 0.9, 0.88], [a - 1.5, 1.44], [-a + 0.45, 1.44]] };
    case 'sedan': return { body: [[-a, 0.3], [a, 0.3], [a, 0.68], [a - 0.35, 0.82], [-a + 0.15, 0.86], [-a, 0.7]], cab: [[-a + 0.85, 0.84], [a - 1.2, 0.82], [a - 1.95, 1.36], [-a + 1.4, 1.36]] };
    case 'sport': return { body: [[-a, 0.24], [a, 0.24], [a, 0.5], [a - 0.6, 0.66], [-a + 0.1, 0.8], [-a, 0.6]], cab: [[-a + 0.85, 0.76], [a - 1.3, 0.7], [a - 2.2, 1.13], [-a + 1.5, 1.13]] };
    case 'pickup': return { body: [[-a, 0.42], [a, 0.42], [a, 0.9], [a - 0.35, 1.04], [-a, 1.04]], cab: [[-a + 1.95, 1.02], [a - 1.25, 1.02], [a - 1.85, 1.62], [-a + 2.05, 1.62]] };
    default: return { body: [[-a, 0.36], [a, 0.36], [a, 1.0], [a - 0.75, 1.95], [-a, 1.95]], cab: [[a - 1.6, 1.15], [a - 0.2, 1.15], [a - 0.72, 1.82], [a - 1.6, 1.82]] };
  }
}
function extrude(pts, width, bevel) {
  const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const depth = width - bevel * 2;
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2); // profile X -> car forward (+Z)
  return g;
}

const carGeo = {}, paints = {};
const glassM = mat(0x1d2f40, { roughness: 0.08, metalness: 0.25 });
const tireM = mat(0x17171a, { roughness: 0.95 }), hubM = mat(0xc9ccd2, { metalness: 0.2, roughness: 0.3 });
export const headM = mat(0xfff6dd, { emissive: 0xfff0c0, emissiveIntensity: 0.3 });
export const tailM = mat(0xaa1111, { emissive: 0xff2020, emissiveIntensity: 0.4 });
const darkM = mat(0x202226);

export function makeVehicle(type, color) {
  const S = SPECS[type], a = S.L / 2;
  if (!carGeo[S.style]) {
    const p = profiles(S.style, a), van = S.style === 'van';
    const topY = Math.max(...p.cab.map((q) => q[1])), topPts = p.cab.filter((q) => q[1] === topY).map((q) => q[0]);
    const wheel = new THREE.CylinderGeometry(S.r, S.r, 0.26, 18); wheel.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(S.r * 0.55, S.r * 0.55, 0.28, 10); hub.rotateZ(Math.PI / 2);
    carGeo[S.style] = {
      body: extrude(p.body, S.W, 0.07), cab: extrude(p.cab, S.W * (van ? 1.02 : 0.86), 0.05),
      roof: new THREE.BoxGeometry(S.W * 0.84, 0.05, Math.abs(topPts[0] - topPts[1]) + 0.1),
      roofY: topY + 0.02, roofZ: (topPts[0] + topPts[1]) / 2, wheel, hub,
      lamp: new THREE.BoxGeometry(0.36, 0.14, 0.08), noseY: S.style === 'sport' ? 0.42 : S.style === 'pickup' ? 0.75 : S.style === 'van' ? 0.7 : 0.58,
    };
  }
  const gm = carGeo[S.style];
  const col = color ?? S.color;
  const paint = paints[col] || (paints[col] = mat(col, { roughness: 0.32, metalness: 0.08 }));
  const group = new THREE.Group(), tilt = new THREE.Group(); group.add(tilt);
  const add = (g, m, x, y, z, parent = tilt) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; parent.add(me); return me; };
  add(gm.body, paint, 0, 0, 0).receiveShadow = true;
  add(gm.cab, glassM, 0, 0, 0);
  if (S.style !== 'van') add(gm.roof, paint, 0, gm.roofY, gm.roofZ);
  for (const s of [1, -1]) {
    add(gm.lamp, headM, s * (S.W / 2 - 0.35), gm.noseY, a + 0.03);
    add(gm.lamp, tailM, s * (S.W / 2 - 0.35), gm.noseY + 0.08, -a - 0.03);
  }
  if (S.style === 'sport') {
    add(new THREE.BoxGeometry(S.W * 0.9, 0.05, 0.35), paint, 0, 1.0, -a + 0.2);
    for (const s of [1, -1]) add(new THREE.BoxGeometry(0.06, 0.22, 0.2), darkM, s * 0.6, 0.88, -a + 0.2);
  }
  const wheels = [], steerPivots = [];
  for (const fz of [1, -1]) for (const s of [1, -1]) {
    const piv = new THREE.Group(); piv.position.set(s * (S.W / 2 - 0.12), S.r, fz * (a - 0.78)); group.add(piv);
    const w = add(gm.wheel, tireM, 0, 0, 0, piv); add(gm.hub, hubM, 0, 0, 0, w);
    wheels.push(w); if (fz > 0) steerPivots.push(piv);
  }
  return { type, spec: S, group, tilt, wheels, steerPivots, x: 0, z: 0, h: 0, va: 0, v: 0, steer: 0, owned: false, ai: null };
}

export function driveVehicle(v, dt, thr, st, hb) {
  const S = v.spec;
  if (thr > 0) v.v += (v.v < 0 ? 28 : S.acc * thr * (1 - v.v / S.top)) * dt;
  else if (thr < 0) v.v = v.v > 0.5 ? v.v - 34 * dt : Math.max(-10, v.v - 9 * dt);
  else v.v -= v.v * 0.45 * dt + Math.sign(v.v) * Math.min(Math.abs(v.v), 1.2 * dt);
  if (hb) v.v -= v.v * 1.6 * dt;
  v.steer = lerp(v.steer, st, damp(7, dt));
  const sp = Math.abs(v.v), rate = (S.turn * (hb ? 1.6 : 1)) / (1 + sp / 26);
  v.h -= v.steer * rate * clamp(v.v / 5, -1, 1) * dt;
  v.va = angLerp(v.va, v.h, damp(hb ? 1.5 : 7, dt));
  v.x += Math.sin(v.va) * v.v * dt; v.z += Math.cos(v.va) * v.v * dt;
}

export function syncVehicle(v, dt) {
  v.group.position.set(v.x, 0, v.z); v.group.rotation.y = v.h;
  const spin = (v.v * dt) / v.spec.r;
  for (const w of v.wheels) w.rotation.x += spin;
  for (const p of v.steerPivots) p.rotation.y = -v.steer * 0.5;
  v.tilt.rotation.z = lerp(v.tilt.rotation.z, clamp(v.steer * v.v * 0.004, -0.07, 0.07), damp(6, dt));
}
