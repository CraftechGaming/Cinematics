// Fully synthesized audio (WebAudio): engine, UI sounds and a generative synth soundtrack.
import { G } from './ctx.js';

let ac = null, master, musicGain, sfxGain, engOsc, engSub, engGain, engFilter;
let step = 0, nextT = 0;

export function initAudio() {
  if (ac) { ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.connect(ac.destination);
  musicGain = ac.createGain(); musicGain.connect(master);
  sfxGain = ac.createGain(); sfxGain.connect(master);
  engFilter = ac.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 500;
  engGain = ac.createGain(); engGain.gain.value = 0;
  engOsc = ac.createOscillator(); engOsc.type = 'sawtooth';
  engSub = ac.createOscillator(); engSub.type = 'square';
  engOsc.connect(engFilter); engSub.connect(engFilter); engFilter.connect(engGain); engGain.connect(sfxGain);
  engOsc.start(); engSub.start();
  nextT = ac.currentTime + 0.1;
  setInterval(schedule, 60);
  applyVolume();
}
export function applyVolume() {
  if (!ac) return;
  musicGain.gain.value = G.settings.music * 0.5;
  sfxGain.gain.value = G.settings.sfx;
}

function tone(freq, t, dur, type, vol, dest) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}

// Am - F - C - G, laid-back coastal synth loop.
const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
function schedule() {
  if (!ac || ac.state !== 'running') return;
  const spb = 60 / 96 / 2; // eighth notes
  while (nextT < ac.currentTime + 0.25) {
    const ch = CHORDS[Math.floor(step / 16) % 4], i = step % 16;
    if (i % 8 === 0) tone(ch[0] / 2, nextT, spb * 7, 'triangle', 0.22, musicGain);
    if (i === 0) ch.forEach((f) => tone(f, nextT, spb * 15, 'sine', 0.05, musicGain));
    const arp = [0, 1, 2, 1, 0, 2, 1, 2][i % 8];
    tone(ch[arp] * 2, nextT, spb * 1.6, 'square', 0.025, musicGain);
    if (i % 4 === 2) tone(8000, nextT, 0.03, 'square', 0.006, musicGain);
    step++; nextT += spb;
  }
}

export function engine(speed, on) {
  if (!ac) return;
  const s = Math.abs(speed), gear = (s % 13) / 13, f = 48 + gear * 70 + s * 1.5;
  const t = ac.currentTime;
  engOsc.frequency.setTargetAtTime(f, t, 0.05);
  engSub.frequency.setTargetAtTime(f / 2, t, 0.05);
  engFilter.frequency.setTargetAtTime(350 + s * 30, t, 0.1);
  engGain.gain.setTargetAtTime(on ? 0.05 + Math.min(0.06, s * 0.002) : 0, t, 0.08);
}

export function sfx(name) {
  if (!ac) return;
  const t = ac.currentTime, d = sfxGain;
  if (name === 'blip') tone(520 + Math.random() * 120, t, 0.05, 'square', 0.04, d);
  else if (name === 'ui') tone(660, t, 0.08, 'triangle', 0.15, d);
  else if (name === 'check') { tone(880, t, 0.15, 'sine', 0.2, d); tone(1320, t + 0.08, 0.25, 'sine', 0.2, d); }
  else if (name === 'star') [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.06, 0.2, 'triangle', 0.15, d));
  else if (name === 'pass') [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.12, 0.5, 'triangle', 0.2, d));
  else if (name === 'fail') [392, 330, 262].forEach((f, i) => tone(f, t + i * 0.2, 0.4, 'sawtooth', 0.08, d));
  else if (name === 'bump') tone(70, t, 0.2, 'sine', 0.5, d);
  else if (name === 'horn') { tone(392, t, 0.3, 'square', 0.06, d); tone(494, t, 0.3, 'square', 0.06, d); }
  else if (name === 'door') tone(140, t, 0.12, 'triangle', 0.3, d);
  else if (name === 'shutter') { tone(2400, t, 0.03, 'square', 0.08, d); tone(1600, t + 0.06, 0.04, 'square', 0.08, d); }
}
