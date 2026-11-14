// Sunset Bay — bootstrap, main loop, player controller, camera and menus.
import * as THREE from 'three';
import { G, RES, HALF, lerp, clamp, damp, angLerp, collideCircle, save, loadSave, loadSettings } from './ctx.js';
import { initInput, keys, hit, consume, mouse, axis, endFrame } from './input.js';
import { buildWorld, buildEnv, groundY } from './world.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeHuman, poseHuman, driveVehicle, syncVehicle, headM, tailM } from './entities.js';
import { spawnTraffic, spawnPeds, updateTraffic, updatePeds } from './traffic.js';
import { updateDialogue, dialogueCamera, updateCutscene } from './scenes.js';
import { initStory, updateStory, talkTo, newGame, placeAtGarage, applyUnlocks } from './story.js';
import { recordFrame, startReplay, updateReplay, startPhoto, updatePhoto, capturePhoto } from './director.js';
import { $, setPrompt, updateHud, setBadge, showHud, fade, banner } from './ui.js';
import { initAudio, applyVolume, engine, sfx } from './audio.js';

// ---------------------------------------------------------------- renderer + resolution
const canvas = $('c'), stage = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 4000);
Object.assign(G, { scene, camera, renderer, look: new THREE.Vector3() });

loadSettings();
const world = buildWorld(scene), env = buildEnv(scene, renderer);
// HDR pipeline: multisampled float target -> bloom -> filmic tone mapping
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1280, 720, { type: THREE.HalfFloatType, samples: 4 }));
const bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.3, 0.7, 1.0);
composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(new OutputPass());

// The game always renders at the exact chosen resolution (1280x720, 1920x1080 or 3840x2160)
// into a 16:9 stage that is scaled to fit the window.
function applyResolution() {
  const [w, h] = RES[G.settings.res];
  renderer.setSize(w, h, false);
  composer.renderTarget1.samples = composer.renderTarget2.samples = h > 1080 ? 2 : 4;
  composer.setSize(w, h);
  env.setShadowSize({ '720p': 1024, '1080p': 2048, '2160p': 4096 }[G.settings.res]);
  for (const b of document.querySelectorAll('#res button')) b.classList.toggle('sel', b.dataset.res === G.settings.res);
  $('resnote').textContent = `Rendering at ${w} × ${h}. ${G.settings.res === '2160p' ? '4K needs a strong graphics card — drop to 1080p if it feels slow.' : ''}`;
}
function fitStage() {
  const s = Math.min(document.body.clientWidth / 16, document.body.clientHeight / 9);
  stage.style.width = s * 16 + 'px'; stage.style.height = s * 9 + 'px'; stage.style.fontSize = (s * 9) / 100 + 'px';
}
addEventListener('resize', fitStage); fitStage(); applyResolution();

// ---------------------------------------------------------------- actors
const player = G.player = { x: 40, y: 0, z: 39, vy: 0, ry: Math.PI, speed: 0, phase: 0, amp: 0, car: null, human: makeHuman({ skin: 0xe0ac7e, hair: 0x2b1d14, shirt: 0xff5d73, pants: 0x264b77 }) };
scene.add(player.human.group);
initStory(scene);
spawnTraffic(scene, 26); spawnPeds(scene, world.blocks, 34);
applyUnlocks();
const headlight = new THREE.SpotLight(0xfff0cc, 0, 80, 0.55, 0.6, 1.4); scene.add(headlight, headlight.target);

// ---------------------------------------------------------------- player
const cam = G.cam = { yaw: 0, pitch: 0.3, idle: 0, shake: 0 };
function nearest(list, x, z, max, ok) {
  let best = null, bd = max;
  for (const o of list) { if (ok && !ok(o)) continue; const d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; best = o; } }
  return best;
}
function bounds(o) {
  o.x = clamp(o.x, -HALF - 22, HALF + 22); o.z = Math.max(o.z, -HALF - 22);
  o.z = Math.min(o.z, Math.abs(o.x) < 3.3 ? HALF + 126 : o.z > HALF + 55.5 && Math.abs(o.x) < 4.5 ? o.z : HALF + 54);
  if (o.z > HALF + 54 && Math.abs(o.x) < 4.5) o.x = clamp(o.x, -3.3, 3.3);
}

function updateOnFoot(dt) {
  const p = player, a = axis();
  const mx = -Math.sin(cam.yaw) * a.y + Math.cos(cam.yaw) * a.x, mz = -Math.cos(cam.yaw) * a.y - Math.sin(cam.yaw) * a.x;
  const len = Math.hypot(mx, mz), run = keys.has('ShiftLeft') || keys.has('ShiftRight') || len > 0.9 && a.x % 1 !== 0;
  p.speed = lerp(p.speed, len > 0.1 ? (run ? 8.5 : 4.2) * Math.min(1, len) : 0, damp(10, dt));
  if (len > 0.1) {
    p.ry = angLerp(p.ry, Math.atan2(mx, mz), damp(12, dt));
    p.x += (mx / len) * p.speed * dt; p.z += (mz / len) * p.speed * dt;
  }
  if (hit('Space') && p.y <= 0) p.vy = 5.6;
  p.vy -= 15 * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y === 0) p.vy = 0;
  collideCircle(p, 0.4);
  for (const v of G.vehicles) { // cars are solid
    if (!v.group.visible) continue;
    const dx = p.x - v.x, dz = p.z - v.z, d = Math.hypot(dx, dz), r = v.spec.L * 0.42;
    if (d < r && d > 0.01) { p.x = v.x + (dx / d) * r; p.z = v.z + (dz / d) * r; }
  }
  for (const n of Object.values(G.npcs)) { const dx = p.x - n.x, dz = p.z - n.z, d = Math.hypot(dx, dz); if (d < 0.7 && d > 0.01) { p.x = n.x + (dx / d) * 0.7; p.z = n.z + (dz / d) * 0.7; } }
  bounds(p);
  p.phase += dt * p.speed * 1.75; p.amp = clamp(p.speed / 8.5, 0, 1);
}

function updateDriving(dt) {
  const v = player.car, a = axis();
  const before = v.v;
  driveVehicle(v, dt, a.y, a.x, keys.has('Space'));
  const o = { x: v.x, z: v.z };
  if (collideCircle(o, 1.5)) {
    if (Math.abs(before) > 6) { sfx('bump'); cam.shake = Math.min(0.5, Math.abs(before) * 0.02); }
    v.v *= 0.55 ** (dt * 60 > 1 ? 1 : dt * 60); v.x = o.x; v.z = o.z;
  }
  for (const t of G.vehicles) { // bump other cars apart (no damage in this town)
    if (t === v || !t.group.visible) continue;
    const dx = v.x - t.x, dz = v.z - t.z, d = Math.hypot(dx, dz), r = 3.1;
    if (d < r && d > 0.01) {
      v.x = t.x + (dx / d) * r; v.z = t.z + (dz / d) * r;
      if (Math.abs(v.v) > 4) { sfx('bump'); cam.shake = 0.25; if (t.ai) { t.ai.wait = 1.5; sfx('horn'); } }
      v.v *= 0.6;
    }
  }
  bounds(v);
  player.x = v.x; player.z = v.z; player.y = 0; player.ry = v.h;
}

function interact() {
  const p = player;
  if (p.car) {
    const slow = Math.abs(p.car.v) < 4;
    setPrompt(slow && Math.abs(p.car.v) < 1 && !G.active ? '<b>F</b> — Get out' : '');
    if (hit('KeyF') && slow) {
      const v = p.car; p.car = null; v.v = 0; sfx('door');
      p.x = v.x + Math.cos(v.h) * 1.9; p.z = v.z - Math.sin(v.h) * 1.9; p.ry = v.h; p.speed = 0;
      collideCircle(p, 0.4); p.human.group.visible = true; G.camSnap = true;
    }
    return;
  }
  const n = nearest([...Object.values(G.npcs), ...G.peds], p.x, p.z, 2.6);
  const v = nearest(G.vehicles, p.x, p.z, 3.6, (o) => o.owned);
  if (n) {
    setPrompt(`<b>E</b> — Talk to ${n.name || 'local'}`);
    if (hit('KeyE')) { consume('KeyE'); consume('KeyF'); setPrompt(''); talkTo(n); }
  } else if (v) {
    setPrompt(`<b>F</b> — Drive the ${v.spec.name}`);
    if (hit('KeyF')) { p.car = v; p.human.group.visible = false; sfx('door'); cam.yaw = v.h + Math.PI; G.camSnap = true; setPrompt(''); }
  } else setPrompt('');
}

// ---------------------------------------------------------------- camera
const want = new THREE.Vector3(), tgt = new THREE.Vector3();
function updateCamera(dt) {
  const p = player, v = p.car;
  if (mouse.dx || mouse.dy) cam.idle = 0; else cam.idle += dt;
  cam.yaw -= mouse.dx * 0.0026; cam.pitch = clamp(cam.pitch + mouse.dy * 0.0022, 0.03, 1.25);
  if (v && cam.idle > 1 && Math.abs(v.v) > 2) {
    cam.yaw = angLerp(cam.yaw, v.h + (v.v < -1 ? 0 : Math.PI), damp(3, dt)); cam.pitch = lerp(cam.pitch, 0.24, damp(2, dt));
  }
  const sp = v ? Math.abs(v.v) : 0;
  tgt.set(p.x, v ? 1.3 + (v.gy || 0) : 1.45 + p.y + (p.gy || 0), p.z);
  let dist = v ? 8 + sp * 0.06 : 4.2;
  const cp = Math.cos(cam.pitch), ox = Math.sin(cam.yaw) * cp, oy = Math.sin(cam.pitch), oz = Math.cos(cam.yaw) * cp;
  // pull the camera in if a building is in the way
  for (let k = 1; k > 0.15; k -= 0.1) {
    const x = tgt.x + ox * dist * k, y = tgt.y + oy * dist * k, z = tgt.z + oz * dist * k;
    if (!G.colliders.some((c) => x > c.x0 - 0.4 && x < c.x1 + 0.4 && z > c.z0 - 0.4 && z < c.z1 + 0.4 && y < c.h + 0.4)) { dist *= k; break; }
  }
  want.set(tgt.x + ox * dist, tgt.y + oy * dist, tgt.z + oz * dist);
  const k = G.camSnap ? 1 : damp(v ? 9 : 14, dt); G.camSnap = false;
  camera.position.lerp(want, k); G.look.lerp(tgt, k === 1 ? 1 : damp(16, dt));
  if (cam.shake > 0.001) { camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake; cam.shake *= 0.86; }
  camera.lookAt(G.look);
  camera.fov = lerp(camera.fov, 55 + sp * 0.35, damp(4, dt)); camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- menus
const screens = ['menu', 'pause', 'settings', 'controls'];
let subFrom = null;
function show(id) { for (const s of screens) $(s).classList.toggle('on', s === id); }
function setState(s) {
  G.state = s; show(s === 'menu' || s === 'pause' ? s : null);
  showHud(s === 'play');
}
function startPlay(fresh) {
  initAudio(); sfx('ui'); show(null); showHud(true);
  if (fresh) newGame();
  else { const d = loadSave(); if (d) Object.assign(G, d); placeAtGarage(); applyUnlocks(); G.state = 'play'; }
  if (!('ontouchstart' in window)) canvas.requestPointerLock?.()?.catch?.(() => {});
}
$('b-new').onclick = () => startPlay(true);
$('b-continue').onclick = () => startPlay(false);
$('b-resume').onclick = () => { sfx('ui'); setState('play'); canvas.requestPointerLock?.()?.catch?.(() => {}); };
$('b-quit').onclick = () => { save(); setState('menu'); refreshMenu(); };
for (const b of document.querySelectorAll('[data-open]')) b.onclick = () => { initAudio(); sfx('ui'); subFrom = G.state; show(b.dataset.open); };
for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => { sfx('ui'); save(); show(subFrom); };
for (const b of document.querySelectorAll('#res button')) b.onclick = () => { G.settings.res = b.dataset.res; applyResolution(); sfx('ui'); };
$('s-music').value = G.settings.music; $('s-sfx').value = G.settings.sfx;
$('s-music').oninput = (e) => { G.settings.music = +e.target.value; applyVolume(); };
$('s-sfx').oninput = (e) => { G.settings.sfx = +e.target.value; applyVolume(); };
function refreshMenu() { $('b-continue').style.display = loadSave() ? '' : 'none'; }
document.addEventListener('lockchange', (e) => { if (!e.detail && G.state === 'play' && !G.noAutoPause) setState('pause'); });
addEventListener('blur', () => { if (G.state === 'play') setState('pause'); });

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let frame = 0, fpsT = performance.now(), fpsN = 0, muted = false;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05), st = G.state;
  G.time += dt; frame++;
  const sim = st === 'play' || st === 'dialogue' || st === 'cutscene' || st === 'menu';

  if (hit('KeyM')) { muted = !muted; const m = G.settings.music; G.settings.music = muted ? 0 : (G.savedMusic ?? 0.5); if (muted) G.savedMusic = m; applyVolume(); }
  if (st === 'play') {
    if (hit('Escape')) { document.exitPointerLock?.(); setState('pause'); }
    else if (hit('KeyR')) { if (!startReplay()) banner('', 'Keep playing a little — nothing to replay yet', 1500); }
    else if (hit('KeyP')) startPhoto(camera);
    else {
      if (player.car) updateDriving(dt); else updateOnFoot(dt);
      interact();
    }
  } else if (st === 'pause' && hit('Escape') && $('pause').classList.contains('on')) $('b-resume').onclick();

  if (sim) {
    G.tod = (G.tod + dt / 40) % 24; // one in-game hour every 40 seconds
    updateTraffic(dt); updatePeds(dt);
    for (const v of G.vehicles) if (!v.ai && v.group.visible) { if (v !== player.car) v.v = lerp(v.v, 0, damp(3, dt)); syncVehicle(v, dt); }
    const p = player;
    p.gy = lerp(p.gy ?? 0, groundY(p.x, p.z), damp(16, dt));
    p.human.group.position.set(p.x, p.y + p.gy, p.z); p.human.group.rotation.y = p.ry;
    if (st !== 'play') { p.speed = lerp(p.speed, 0, damp(10, dt)); p.amp = clamp(p.speed / 8.5, 0, 1); }
    if (st === 'dialogue' && G.dlg?.npc) p.ry = angLerp(p.ry, Math.atan2(G.dlg.npc.x - p.x, G.dlg.npc.z - p.z), damp(8, dt));
    poseHuman(p.human, p.phase, p.amp, p.y > 0.05 ? 'air' : st === 'dialogue' && G.playerTalk ? 'talk' : 'move', G.time);
    updateStory(dt);
  }

  if (st === 'play') { updateCamera(dt); recordFrame(dt); updateHud(frame); }
  else if (st === 'dialogue') { updateDialogue(dt); if (G.state === 'dialogue' && !dialogueCamera(camera, dt)) updateCamera(dt); }
  else if (st === 'cutscene') updateCutscene(dt, camera);
  else if (st === 'replay') updateReplay(dt, camera);
  else if (st === 'photo') updatePhoto(dt, camera);
  else if (st === 'menu') {
    const a = G.time * 0.06;
    camera.position.set(40 + Math.sin(a) * 150, 46, 150 + Math.cos(a) * 150); G.look.set(20, 12, 120); camera.lookAt(G.look);
    camera.fov = 50; camera.updateProjectionMatrix();
  }
  showHud(G.state === 'play');

  // environment
  const focus = G.state === 'play' || G.state === 'replay' ? tgt.set(player.x, 0, player.z) : G.look;
  env.update(G.tod, focus, camera.position);
  world.update(sim || st === 'replay' ? dt : 0, env.night);
  headM.emissiveIntensity = 0.4 + env.night * 4; tailM.emissiveIntensity = 0.4 + env.night * 2.5;
  const c = player.car;
  headlight.intensity = c && env.night > 0.3 ? 900 * env.night : 0;
  if (c) { headlight.position.set(c.x + Math.sin(c.h) * 2, 0.9, c.z + Math.cos(c.h) * 2); headlight.target.position.set(c.x + Math.sin(c.h) * 22, 0, c.z + Math.cos(c.h) * 22); }
  engine(c ? c.v : 0, !!c && (G.state === 'play' || G.state === 'replay'));

  bloom.strength = 0.16 + env.night * 0.16;
  composer.render();
  if (G.wantPhoto) { G.wantPhoto = false; capturePhoto(renderer); }

  fpsN++; const now = performance.now(); if (now - fpsT >= 500) { setBadge(Math.round((fpsN * 1000) / (now - fpsT))); fpsN = 0; fpsT = now; }
  endFrame();
}

initInput(canvas);
refreshMenu(); setState('menu');
$('loading').style.display = 'none';
window.__game = G; // handy for debugging / automated tests
tick();
