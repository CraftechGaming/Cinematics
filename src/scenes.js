// Dialogue boxes (typewriter + choices) and scripted camera cutscenes.
import * as THREE from 'three';
import { G, lerp } from './ctx.js';
import { hit, consume } from './input.js';
import { setBars, subtitle, setSkip, $ } from './ui.js';
import { sfx } from './audio.js';

// ---------------------------------------------------------------- dialogue
const box = $('dialogue'), whoEl = box.querySelector('.who'), textEl = box.querySelector('.text'), choicesEl = box.querySelector('.choices'), hintEl = box.querySelector('.hint');
let dlg = null;

// lines: [{ who, text, choices?: [{ t, lines }] }]
export function startDialogue(lines, opts = {}) {
  dlg = { queue: [...lines], npc: opts.npc || null, onEnd: opts.onEnd, line: null, chars: 0, blip: 0 };
  G.state = 'dialogue'; G.dlg = dlg; setBars(true); box.classList.add('on');
  if (dlg.npc) dlg.npc.stop = true;
  nextLine();
}
function nextLine() {
  const line = dlg.queue.shift();
  if (!line) return endDialogue();
  dlg.line = line; dlg.chars = 0; dlg.speakerIsPlayer = line.who === 'Kai';
  whoEl.textContent = line.who; textEl.textContent = ''; choicesEl.innerHTML = ''; hintEl.style.visibility = 'visible';
}
function endDialogue() {
  const d = dlg; dlg = null; G.dlg = null;
  box.classList.remove('on'); setBars(false);
  if (d.npc) { d.npc.stop = false; d.npc.talk = false; }
  G.state = 'play'; G.camSnap = true;
  d.onEnd?.();
}
function choose(c) { sfx('ui'); dlg.queue.unshift(...(c.lines || [])); c.fn?.(); nextLine(); }
box.addEventListener('click', () => { if (dlg && !dlg.line.choices) advance(); });
function advance() {
  const full = dlg.line.text.length;
  if (dlg.chars < full) { dlg.chars = full; textEl.textContent = dlg.line.text; showChoices(); } else if (!dlg.line.choices) nextLine();
}
function showChoices() {
  const cs = dlg.line.choices; if (!cs || choicesEl.children.length) return;
  hintEl.style.visibility = 'hidden';
  cs.forEach((c, i) => {
    const b = document.createElement('button'); b.textContent = `${i + 1}. ${c.t}`;
    b.onclick = (e) => { e.stopPropagation(); choose(c); }; choicesEl.appendChild(b);
  });
}
export function updateDialogue(dt) {
  if (!dlg) return;
  const L = dlg.line, full = L.text.length;
  if (dlg.chars < full) {
    dlg.chars = Math.min(full, dlg.chars + dt * 48);
    textEl.textContent = L.text.slice(0, Math.floor(dlg.chars));
    if ((dlg.blip += dt) > 0.07) { dlg.blip = 0; sfx('blip'); }
    if (dlg.chars >= full) showChoices();
  }
  if (dlg.npc) dlg.npc.talk = !dlg.speakerIsPlayer && dlg.chars < full;
  G.playerTalk = dlg.speakerIsPlayer && dlg.chars < full;
  if (L.choices && dlg.chars >= full) {
    for (let i = 0; i < L.choices.length; i++) if (hit('Digit' + (i + 1), 'Numpad' + (i + 1))) return choose(L.choices[i]);
    if (hit('KeyE', 'Enter', 'Space') && L.choices.length === 1) choose(L.choices[0]);
  } else if (hit('KeyE', 'Enter', 'Space')) { consume('KeyE'); advance(); }
}

const va = new THREE.Vector3(), vb = new THREE.Vector3();
export function dialogueCamera(cam, dt) {
  const p = G.player, n = dlg?.npc; if (!n) return false;
  let dx = n.x - p.x, dz = n.z - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  const sx = dz, sz = -dx; // side vector
  if (dlg.speakerIsPlayer) { va.set(n.x + dx * 1.1 + sx * 0.8, 1.7, n.z + dz * 1.1 + sz * 0.8); vb.set(p.x, 1.5, p.z); }
  else { va.set(p.x - dx * 1.3 + sx * 0.8, 1.72, p.z - dz * 1.3 + sz * 0.8); vb.set(n.x, 1.5, n.z); }
  const k = G.camSnap ? 1 : 1 - Math.exp(-5 * dt); G.camSnap = false;
  cam.position.lerp(va, k); G.look.lerp(vb, k); cam.lookAt(G.look);
  cam.fov = lerp(cam.fov, 38, k); cam.updateProjectionMatrix();
  return true;
}

// ---------------------------------------------------------------- cutscenes
// shot: { dur, p0, p1, l0, l1, fov, who, text, orbit: {c:[x,y,z], r, h, a0, a1}, on() }
let cs = null;
export function playCutscene(shots, onEnd) {
  cs = { shots, i: -1, t: 0, onEnd };
  G.state = 'cutscene'; setBars(true); setSkip(true); nextShot();
}
function nextShot() {
  cs.i++; cs.t = 0;
  const s = cs.shots[cs.i];
  if (!s) return endCutscene();
  subtitle(s.who, s.text); s.on?.();
}
function endCutscene() {
  const c = cs; cs = null;
  subtitle('', ''); setBars(false); setSkip(false);
  G.state = 'play'; G.camSnap = true;
  c.onEnd?.();
}
const ease = (t) => t * t * (3 - 2 * t);
export function updateCutscene(dt, cam) {
  if (!cs) return;
  if (hit('Enter', 'Escape', 'KeyE')) { consume('KeyE'); consume('Escape'); return endCutscene(); }
  const s = cs.shots[cs.i]; cs.t += dt;
  const k = ease(Math.min(1, cs.t / s.dur));
  if (s.orbit) {
    const o = s.orbit, a = lerp(o.a0, o.a1, k);
    cam.position.set(o.c[0] + Math.sin(a) * o.r, o.c[1] + o.h, o.c[2] + Math.cos(a) * o.r);
    G.look.set(o.c[0], o.c[1], o.c[2]);
  } else {
    cam.position.set(lerp(s.p0[0], s.p1[0], k), lerp(s.p0[1], s.p1[1], k), lerp(s.p0[2], s.p1[2], k));
    const l1 = s.l1 || s.l0;
    G.look.set(lerp(s.l0[0], l1[0], k), lerp(s.l0[1], l1[1], k), lerp(s.l0[2], l1[2], k));
  }
  cam.lookAt(G.look); cam.fov = s.fov || 45; cam.updateProjectionMatrix();
  if (cs.t >= s.dur) nextShot();
}
