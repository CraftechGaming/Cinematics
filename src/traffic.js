// Ambient life: AI traffic that follows the road grid and pedestrians that stroll the sidewalks.
import { G, CELL, HALF, rng, lerp, clamp, damp, angLerp } from './ctx.js';
import { makeVehicle, makeHuman, poseHuman, syncVehicle } from './entities.js';
import { sfx } from './audio.js';

const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // heading = atan2(dx, dz)
const R = rng(99);
const pick = (a) => a[Math.floor(R() * a.length)];
const CAR_COLORS = [0xffffff, 0x2b2d42, 0xd90429, 0x4895ef, 0xf9c74f, 0x90be6d, 0xf28482, 0x9d4edd, 0xc0c0c8];
const SKIN = [0xf1c9a5, 0xd9a273, 0xa8703f, 0x7a4b2a, 0xffdcb8], HAIR = [0x1b1b1b, 0x4a2c17, 0xc98f3d, 0x7d7d7d, 0xa13d2d];
const CLOTH = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xf8f9fa, 0x9b5de5, 0xff924c, 0x264653];

export function spawnTraffic(scene, count) {
  for (let i = 0; i < count; i++) {
    const v = makeVehicle(R() < 0.2 ? 'van' : R() < 0.55 ? 'sedan' : R() < 0.5 ? 'pebble' : 'dune', pick(CAR_COLORS));
    const d = Math.floor(R() * 4), line = Math.round((R() * 2 - 1) * 4) * CELL, along = (R() * 2 - 1) * (HALF - 20);
    v.ai = { d, cruise: 9 + R() * 5, lastNode: null, wait: 0 };
    const [dx, dz] = DIRS[d];
    if (dx) { v.x = along; v.z = line + dx * 3.5; } else { v.z = along; v.x = line - dz * 3.5; }
    v.h = v.va = Math.atan2(dx, dz); v.v = v.ai.cruise;
    scene.add(v.group); G.vehicles.push(v);
  }
}

function obstacleAhead(v, dx, dz, ox, oz) {
  const rx = ox - v.x, rz = oz - v.z, ahead = rx * dx + rz * dz, side = Math.abs(rx * -dz + rz * dx);
  return ahead > 0 && side < 2.6 ? ahead : Infinity;
}

export function updateTraffic(dt) {
  const p = G.player;
  for (const v of G.vehicles) {
    if (!v.ai) continue;
    const ai = v.ai, [dx, dz] = DIRS[ai.d];
    // look ahead for anything in our lane
    let gap = Infinity;
    for (const o of G.vehicles) if (o !== v) gap = Math.min(gap, obstacleAhead(v, dx, dz, o.x, o.z));
    if (!p.car) gap = Math.min(gap, obstacleAhead(v, dx, dz, p.x, p.z) + 2);
    let target = gap < 8 ? 0 : gap < 18 ? ai.cruise * 0.4 : ai.cruise;
    if (ai.wait > 0) { ai.wait -= dt; target = 0; }
    v.v = lerp(v.v, target, damp(target < v.v ? 4 : 1.2, dt));
    // intersections: pick a new direction when crossing a node centre
    const along = dx ? v.x : v.z, node = Math.round(along / CELL) * CELL;
    const nx = dx ? node : Math.round(v.x / CELL) * CELL, nz = dx ? Math.round(v.z / CELL) * CELL : node;
    const key = nx + ',' + nz;
    if (Math.abs(along - node) < 1.2 && ai.lastNode !== key) {
      ai.lastNode = key;
      const opts = [ai.d, ai.d, (ai.d + 1) % 4, (ai.d + 3) % 4].filter((d) => Math.abs(nx + DIRS[d][0] * CELL) <= HALF && Math.abs(nz + DIRS[d][1] * CELL) <= HALF);
      ai.d = opts.length ? pick(opts) : (ai.d + 2) % 4;
    }
    const [ex, ez] = DIRS[ai.d];
    v.x += ex * v.v * dt; v.z += ez * v.v * dt;
    // ease onto the lane line of the current road (right-hand traffic)
    if (ex) v.z = lerp(v.z, Math.round(v.z / CELL) * CELL + ex * 3.5, damp(2.5, dt));
    else v.x = lerp(v.x, Math.round(v.x / CELL) * CELL - ez * 3.5, damp(2.5, dt));
    v.h = angLerp(v.h, Math.atan2(ex, ez), damp(4, dt)); v.va = v.h;
    v.steer = 0;
    const far = Math.abs(v.x - p.x) + Math.abs(v.z - p.z) > 420;
    v.group.visible = !far;
    if (!far) syncVehicle(v, dt);
  }
}

// ---------------------------------------------------------------- pedestrians
const LINES = [
  'Lovely evening for a drive, huh?', 'Have you tried the pizza at Rico\'s? Best in the Bay.',
  'I heard someone hid gold stars all over town.', 'The Ferris wheel lights up at night. You should see it!',
  'Careful on the coast road — the view is distracting.', 'Welcome to Sunset Bay, friend!',
  'Maya can fix anything with four wheels.', 'Zoe films every race. She says she\'s a "director".',
  'Press R after a cool stunt. Trust me.', 'I walk this block every day. Good for the heart!',
  'The pier is the best spot to watch the sunset.', 'Nice shoes! Are you new around here?',
];

export function spawnPeds(scene, blocks, count) {
  for (let i = 0; i < count; i++) {
    const b = pick(blocks);
    const h = makeHuman({ skin: pick(SKIN), hair: pick(HAIR), shirt: pick(CLOTH), pants: pick([0x2b2d42, 0x3d405b, 0x6c757d, 0xe9d8a6, 0x1d3557]), scale: 0.88 + R() * 0.12 });
    scene.add(h.group);
    G.peds.push({ h, b, s: R() * 244, dir: R() < 0.5 ? 1 : -1, speed: 1.2 + R() * 0.7, phase: R() * 6, x: 0, z: 0, ry: 0, dodge: 0, stop: false, line: LINES[i % LINES.length], amp: 0.5 });
  }
}

// position on the sidewalk loop around a block (perimeter 4 * 61 = 244)
function loopPos(b, s, inset) {
  const a = 30.5 - inset, side = Math.floor(s / 61) % 4, t = (s % 61) / 61 * 2 - 1;
  const [x, z, ry] = [[t * a, -a, Math.PI / 2], [a, t * a, 0], [-t * a, a, -Math.PI / 2], [-a, -t * a, Math.PI]][side];
  return [b.cx + x, b.cz + z, ry];
}

export function updatePeds(dt) {
  const p = G.player, car = p.car;
  for (const d of G.peds) {
    const far = Math.abs(d.x - p.x) + Math.abs(d.z - p.z) > 260;
    if (!d.stop) d.s = (d.s + d.dir * d.speed * dt + 244) % 244;
    if (car && Math.abs(car.v) > 3 && Math.hypot(car.x - d.x, car.z - d.z) < 6) { if (d.dodge <= 0) sfx('horn'); d.dodge = 1.4; }
    d.dodge = Math.max(0, d.dodge - dt);
    const [x, z, ry] = loopPos(d.b, d.s, clamp(d.dodge * 3, 0, 1) * 3.2);
    d.x = lerp(d.x, x, far ? 1 : damp(8, dt)); d.z = lerp(d.z, z, far ? 1 : damp(8, dt));
    if (d.stop) d.ry = angLerp(d.ry, Math.atan2(p.x - d.x, p.z - d.z), damp(8, dt));
    else d.ry = angLerp(d.ry, d.dir > 0 ? ry : ry + Math.PI, damp(6, dt));
    d.phase += dt * d.speed * 4.2;
    d.h.group.visible = !far;
    if (far) continue;
    d.h.group.position.set(d.x, 0, d.z); d.h.group.rotation.y = d.ry;
    d.amp = lerp(d.amp, d.stop ? 0 : 0.5, damp(8, dt));
    poseHuman(d.h, d.phase, d.amp, d.dodge > 0 ? 'startle' : d.talk ? 'talk' : 'move', G.time + d.phase);
  }
}
