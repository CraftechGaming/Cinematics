// HUD, banners, subtitles and minimap.
import { G, CELL, HALF, N, ROAD_W } from './ctx.js';

export const $ = (id) => document.getElementById(id);
const el = {};
for (const id of ['hud', 'money', 'clock', 'badge', 'objective', 'timer', 'prompt', 'speedo', 'kmh', 'carname', 'minimap', 'bars', 'subtitle', 'skip', 'banner', 'fade']) el[id] = $(id);
const set = (e, t) => { if (e._t !== t) { e._t = t; e.innerHTML = t; } };

export const setPrompt = (t) => set(el.prompt, t || '');
export const setObjective = (t) => set(el.objective, t || '');
export function setTimer(s) {
  set(el.timer, s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
  el.timer.classList.toggle('low', s != null && s < 15);
}
export const setBars = (on) => { el.bars.classList.toggle('on', on); };
export const setSkip = (on) => el.skip.classList.toggle('on', on);
export const subtitle = (who, text) => set(el.subtitle, text ? (who ? `<b>${who}</b>` : '') + text : '');
export const fade = (on) => el.fade.classList.toggle('on', on);
export const showHud = (on) => el.hud.classList.toggle('on', on);
export const fmtTime = (tod) => `${String(Math.floor(tod) % 24).padStart(2, '0')}:${String(Math.floor((tod % 1) * 60)).padStart(2, '0')}`;

let bannerT = 0;
export function banner(title, sub, ms = 4000, bad = false) {
  el.banner.querySelector('h1').textContent = title; el.banner.querySelector('p').textContent = sub || '';
  el.banner.classList.toggle('bad', bad); el.banner.classList.add('on');
  clearTimeout(bannerT); bannerT = setTimeout(() => el.banner.classList.remove('on'), ms);
}

export function updateHud(frame) {
  const p = G.player;
  set(el.money, '$' + G.money + (G.stars.length ? ` <span style="color:#ffd166;font-size:.6em">★${G.stars.length}/12</span>` : ''));
  set(el.clock, fmtTime(G.tod));
  el.speedo.style.display = p.car ? 'block' : 'none';
  if (p.car) { set(el.kmh, String(Math.round(Math.abs(p.car.v) * 3.6))); set(el.carname, p.car.spec.name); }
  if (frame % 3 === 0) drawMinimap();
}
export function setBadge(fps) { set(el.badge, `${G.settings.res} · ${fps} fps`); }

const mm = el.minimap.getContext('2d');
function drawMinimap() {
  const p = G.player, W = 220, c = W / 2, s = 0.62; // px per metre
  const X = (x) => c + (x - p.x) * s, Z = (z) => c + (z - p.z) * s;
  mm.fillStyle = '#5f9a4e'; mm.fillRect(0, 0, W, W);
  mm.fillStyle = '#e6d39f'; mm.fillRect(0, Z(HALF + 13), W, 45 * s);
  mm.fillStyle = '#2390b5'; mm.fillRect(0, Z(HALF + 56), W, W);
  mm.fillStyle = '#9b7653'; mm.fillRect(X(-4), Z(HALF + 54), 8 * s, 74 * s);
  mm.fillStyle = '#3a3d46'; mm.fillRect(X(-HALF - 7), Z(-HALF - 7), (HALF * 2 + 14) * s, (HALF * 2 + 14) * s);
  const b = CELL - ROAD_W;
  for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
    const x = X(i * CELL + 7), z = Z(j * CELL + 7);
    if (x > W || z > W || x < -b * s || z < -b * s) continue;
    mm.fillStyle = j === -1 && (i === -1 || i === -2) ? '#58a646' : '#b9b4aa'; mm.fillRect(x, z, b * s, b * s);
  }
  const dot = (x, z, col, r, clampEdge) => {
    let dx = (x - p.x) * s, dz = (z - p.z) * s; const d = Math.hypot(dx, dz);
    if (d > c - 8) { if (!clampEdge) return; dx *= (c - 8) / d; dz *= (c - 8) / d; }
    mm.fillStyle = col; mm.beginPath(); mm.arc(c + dx, c + dz, r, 0, 7); mm.fill();
    mm.strokeStyle = '#000'; mm.lineWidth = 1; mm.stroke();
  };
  for (const v of G.vehicles) if (v.owned && v !== p.car) dot(v.x, v.z, '#4cc9f0', 4, false);
  for (const st of G.starObjs || []) if (st.visible) dot(st.position.x, st.position.z, '#fff3b0', 2.5, false);
  if (G.questNpc) dot(G.questNpc.x, G.questNpc.z, '#ffd166', 6, true);
  if (G.active?.cp) dot(G.active.cp.x, G.active.cp.z, '#ff5d73', 6.5, true);
  const h = p.car ? p.car.h : p.ry;
  mm.save(); mm.translate(c, c); mm.rotate(Math.PI - h);
  mm.fillStyle = '#fff'; mm.strokeStyle = '#111'; mm.lineWidth = 2;
  mm.beginPath(); mm.moveTo(0, -9); mm.lineTo(6, 7); mm.lineTo(0, 3); mm.lineTo(-6, 7); mm.closePath(); mm.fill(); mm.stroke();
  mm.restore();
}
