// DIRECTOR MODE — the game's signature feature.
//  * Instant Replay: the last 15 seconds are always being recorded; press R to rewatch them
//    as a movie, shot by automatic cinematic cameras.
//  * Photo Mode: freeze time, fly a free camera, pick a filter and save a picture at the
//    current render resolution (up to 3840x2160).
import * as THREE from 'three';
import { G, lerp, clamp, angLerp, RES } from './ctx.js';
import { hit, keys, mouse, axis } from './input.js';
import { poseHuman, syncVehicle } from './entities.js';
import { setBars, showHud, fmtTime, $ } from './ui.js';
import { sfx } from './audio.js';

const HZ = 30, MAX = HZ * 15;
const frames = [];
let acc = 0;

export function recordFrame(dt) {
  acc += dt; if (acc < 1 / HZ) return; acc = 0;
  const p = G.player, V = G.vehicles, D = G.peds;
  const f = { p: [p.x, p.y, p.z, p.ry, p.phase, p.amp, p.car ? G.vehicles.indexOf(p.car) : -1], v: new Float32Array(V.length * 4), d: new Float32Array(D.length * 4), tod: G.tod };
  V.forEach((v, i) => f.v.set([v.x, v.z, v.h, v.v], i * 4));
  D.forEach((d, i) => f.d.set([d.x, d.z, d.ry, d.phase], i * 4));
  frames.push(f); if (frames.length > MAX) frames.shift();
}
export const clearReplay = () => { frames.length = 0; };

function applyFrame(t, dt) {
  const i = clamp(Math.floor(t), 0, frames.length - 1), a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)], k = t - i;
  const p = G.player;
  p.x = lerp(a.p[0], b.p[0], k); p.y = lerp(a.p[1], b.p[1], k); p.z = lerp(a.p[2], b.p[2], k); p.ry = angLerp(a.p[3], b.p[3], k);
  p.phase = lerp(a.p[4], b.p[4], k); p.amp = a.p[5];
  p.car = a.p[6] >= 0 ? G.vehicles[a.p[6]] : null;
  p.human.group.visible = !p.car;
  p.human.group.position.set(p.x, p.y + (p.gy || 0), p.z); p.human.group.rotation.y = p.ry;
  poseHuman(p.human, p.phase, p.amp, p.y > 0.05 ? 'air' : 'move', t / HZ);
  G.vehicles.forEach((v, j) => {
    v.x = lerp(a.v[j * 4], b.v[j * 4], k); v.z = lerp(a.v[j * 4 + 1], b.v[j * 4 + 1], k);
    v.h = angLerp(a.v[j * 4 + 2], b.v[j * 4 + 2], k); v.v = a.v[j * 4 + 3];
    syncVehicle(v, dt);
  });
  G.peds.forEach((d, j) => {
    d.x = lerp(a.d[j * 4], b.d[j * 4], k); d.z = lerp(a.d[j * 4 + 1], b.d[j * 4 + 1], k); d.ry = angLerp(a.d[j * 4 + 2], b.d[j * 4 + 2], k);
    d.h.group.position.set(d.x, 0, d.z); d.h.group.rotation.y = d.ry;
    poseHuman(d.h, lerp(a.d[j * 4 + 3], b.d[j * 4 + 3], k), 0.5, 'move', t / HZ);
  });
  G.tod = a.tod;
}

// ---------------------------------------------------------------- replay
const CAMS = ['Chase', 'Roadside', 'Drone', 'Orbit', 'Wheel'];
const rp = { t: 0, speed: 1, paused: false, cam: 0, cut: 0, anchor: new THREE.Vector3(), saved: null };
const tgt = new THREE.Vector3(), want = new THREE.Vector3();

export function startReplay() {
  if (frames.length < HZ) return false;
  const p = G.player;
  rp.saved = { car: p.car, vv: G.vehicles.map((v) => v.v) };
  rp.t = 0; rp.speed = 1; rp.paused = false; rp.cam = 0; rp.cut = 0; rp.first = true;
  G.state = 'replay'; setBars(true); showHud(false); $('replayui').classList.add('on');
  return true;
}
function stopReplay() {
  applyFrame(frames.length - 1, 0);
  G.player.car = rp.saved.car; G.vehicles.forEach((v, i) => { v.v = rp.saved.vv[i]; });
  G.player.human.group.visible = !G.player.car;
  setBars(false); showHud(true); $('replayui').classList.remove('on');
  G.state = 'play'; G.camSnap = true;
}
function cutTo(i, heading) {
  rp.cam = i % CAMS.length; rp.cut = 2.6 + Math.random() * 1.6; rp.first = true;
  const f = 14 + Math.random() * 14, s = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3);
  rp.anchor.set(tgt.x + Math.sin(heading) * f + Math.cos(heading) * s, 1.2 + Math.random() * 2.5, tgt.z + Math.cos(heading) * f - Math.sin(heading) * s);
  $('replaycam').textContent = `CAM ${rp.cam + 1} · ${CAMS[rp.cam]}`;
}
export function updateReplay(dt, cam) {
  if (hit('KeyR', 'Escape', 'Enter')) return stopReplay();
  if (hit('Space')) rp.paused = !rp.paused;
  if (hit('Tab')) rp.speed = rp.speed === 1 ? 0.3 : 1;
  const scrub = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  const step = rp.paused ? scrub * 2 * dt : dt * rp.speed + scrub * 2 * dt;
  rp.t = clamp(rp.t + step * HZ, 0, frames.length - 1);
  applyFrame(rp.t, step);
  const p = G.player, c = p.car, h = c ? c.h : p.ry, big = c ? 1 : 0.55;
  tgt.set(c ? c.x : p.x, c ? 0.9 : 1.2 + p.y, c ? c.z : p.z);
  rp.cut -= Math.abs(step);
  if (rp.cut <= 0 || hit('KeyC')) cutTo(rp.cut <= 0 && !rp.first ? Math.floor(Math.random() * CAMS.length) : rp.cam + 1, h);
  let fov = 45;
  const m = rp.cam, time = rp.t / HZ;
  if (m === 0) want.set(tgt.x - Math.sin(h) * 7.5 * big, 1.1 + big * 0.5, tgt.z - Math.cos(h) * 7.5 * big);
  else if (m === 1) { want.copy(rp.anchor); fov = 26; }
  else if (m === 2) { want.set(tgt.x - Math.sin(h) * 10, 26, tgt.z - Math.cos(h) * 10); fov = 50; }
  else if (m === 3) want.set(tgt.x + Math.sin(time * 0.7) * 9 * big, 2.2, tgt.z + Math.cos(time * 0.7) * 9 * big);
  else { want.set(tgt.x + Math.cos(h) * 2.6 * big + Math.sin(h) * 2.5 * big, 0.6, tgt.z - Math.sin(h) * 2.6 * big + Math.cos(h) * 2.5 * big); fov = 60; }
  const k = rp.first ? 1 : 1 - Math.exp(-6 * Math.max(dt, 0.001)); rp.first = false;
  cam.position.lerp(want, m === 1 ? 1 : k); G.look.lerp(tgt, m === 1 ? 0.2 : k); cam.lookAt(G.look);
  cam.fov = fov; cam.updateProjectionMatrix();
  $('replaybar').style.width = (rp.t / (frames.length - 1)) * 100 + '%';
  if (rp.t >= frames.length - 1 && !rp.paused && !scrub) stopReplay();
}

// ---------------------------------------------------------------- photo mode
const FILTERS = [['None', 'none'], ['Vivid', 'saturate(1.6) contrast(1.08)'], ['Warm', 'sepia(.35) saturate(1.35)'], ['Noir', 'grayscale(1) contrast(1.25)'], ['Retro', 'sepia(.6) hue-rotate(-18deg) contrast(.95) brightness(1.05)'], ['Dream', 'saturate(1.3) brightness(1.1) blur(0.6px)']];
const ph = { yaw: 0, pitch: 0, fov: 50, filter: 0, from: 'play' };
const fwd = new THREE.Vector3(), canvasEl = $('c'), ui = $('photoui');

export function startPhoto(cam) {
  ph.from = G.state; G.state = 'photo';
  cam.getWorldDirection(fwd); ph.yaw = Math.atan2(-fwd.x, -fwd.z); ph.pitch = Math.asin(clamp(fwd.y, -1, 1)); ph.fov = cam.fov;
  showHud(false); ui.classList.add('on'); ui.classList.remove('hide'); refresh();
}
function stopPhoto() {
  canvasEl.style.filter = 'none'; ui.classList.remove('on'); showHud(true);
  G.state = 'play'; G.camSnap = true;
}
function refresh() {
  $('pfilter').textContent = FILTERS[ph.filter][0]; $('pfov').textContent = Math.round(ph.fov) + '°'; $('ptime').textContent = fmtTime(G.tod);
  canvasEl.style.filter = FILTERS[ph.filter][1];
}
export function updatePhoto(dt, cam) {
  if (hit('KeyP', 'Escape')) return stopPhoto();
  if (hit('KeyF')) ph.filter = (ph.filter + 1) % FILTERS.length;
  if (hit('KeyH')) ui.classList.toggle('hide');
  if (hit('Enter')) G.wantPhoto = true;
  ph.fov = clamp(ph.fov + mouse.wheel * 4, 12, 95);
  G.tod = (G.tod + ((keys.has('BracketRight') ? 1 : 0) - (keys.has('BracketLeft') ? 1 : 0)) * dt * 3 + 24) % 24;
  ph.yaw -= mouse.dx * 0.0025; ph.pitch = clamp(ph.pitch - mouse.dy * 0.0025, -1.4, 1.4);
  const a = axis(), sp = (keys.has('ShiftLeft') ? 40 : 10) * dt, cp = Math.cos(ph.pitch);
  fwd.set(-Math.sin(ph.yaw) * cp, Math.sin(ph.pitch), -Math.cos(ph.yaw) * cp);
  cam.position.addScaledVector(fwd, a.y * sp);
  cam.position.x += Math.cos(ph.yaw) * a.x * sp; cam.position.z -= Math.sin(ph.yaw) * a.x * sp;
  cam.position.y = clamp(cam.position.y + ((keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0)) * sp, 0.4, 400);
  G.look.copy(cam.position).add(fwd); cam.lookAt(G.look);
  cam.fov = ph.fov; cam.updateProjectionMatrix(); refresh();
}
$('psnap').onclick = () => { G.wantPhoto = true; };
$('pexit').onclick = () => stopPhoto();

// Called right after a render so the WebGL buffer still holds the frame.
export function capturePhoto(renderer) {
  const [w, h] = RES[G.settings.res];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.filter = FILTERS[ph.filter][1]; ctx.drawImage(renderer.domElement, 0, 0, w, h);
  c.toBlob((blob) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `sunset-bay-${G.settings.res}-${Date.now()}.png`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
  sfx('shutter');
  $('fade').style.transition = 'none'; $('fade').style.background = '#fff'; $('fade').classList.add('on');
  setTimeout(() => { $('fade').style.transition = ''; $('fade').classList.remove('on'); setTimeout(() => { $('fade').style.background = ''; }, 600); }, 60);
}
