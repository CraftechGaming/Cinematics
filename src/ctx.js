// Shared game context + small math helpers.
export const CELL = 80, ROAD_W = 14, N = 4, HALF = CELL * N; // city spans -320..320
export const RES = { '720p': [1280, 720], '1080p': [1920, 1080], '2160p': [3840, 2160] };

export const G = {
  state: 'menu',            // menu | play | dialogue | cutscene | replay | photo | pause
  time: 0, tod: 16.6,         // tod = time of day in hours
  money: 0, mission: 0, stars: [], unlocked: { pebble: true },
  settings: { res: '1080p', quality: 'high', auto: true, music: 0.5, sfx: 0.7 },
  colliders: [], vehicles: [], peds: [], npcs: {},
  player: null, camera: null, scene: null, renderer: null,
  active: null,             // active mission
  camSnap: true,
};

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export function angLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Push a circle out of all world colliders (axis-aligned boxes). Returns true on contact.
export function collideCircle(o, r) {
  let hit = false;
  for (const c of G.colliders) {
    const cx = clamp(o.x, c.x0, c.x1), cz = clamp(o.z, c.z0, c.z1);
    let dx = o.x - cx, dz = o.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      o.x = cx + (dx / d) * r; o.z = cz + (dz / d) * r;
    } else { // centre is inside the box: leave through the nearest face
      const l = o.x - c.x0, rr = c.x1 - o.x, t = o.z - c.z0, b = c.z1 - o.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) o.x = c.x0 - r; else if (m === rr) o.x = c.x1 + r;
      else if (m === t) o.z = c.z0 - r; else o.z = c.z1 + r;
    }
  }
  return hit;
}

export function save() {
  try {
    localStorage.setItem('sunsetbay.save', JSON.stringify({
      money: G.money, mission: G.mission, stars: G.stars, unlocked: G.unlocked, tod: G.tod,
    }));
    localStorage.setItem('sunsetbay.settings', JSON.stringify(G.settings));
  } catch { /* storage unavailable: play without saving */ }
}
export function loadSettings() {
  try { Object.assign(G.settings, JSON.parse(localStorage.getItem('sunsetbay.settings') || '{}')); } catch { /* defaults */ }
  if (!RES[G.settings.res]) G.settings.res = '1080p';
}
export function loadSave() {
  try { return JSON.parse(localStorage.getItem('sunsetbay.save') || 'null'); } catch { return null; }
}
