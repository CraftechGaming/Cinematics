// Keyboard, mouse and touch input.
export const keys = new Set();
const pressed = new Set();
export const mouse = { dx: 0, dy: 0, wheel: 0, locked: false };
export const touch = { x: 0, y: 0, on: false };

addEventListener('keydown', (e) => {
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

export const hit = (...codes) => codes.some((c) => pressed.has(c));
export const press = (code) => pressed.add(code);
export const consume = (code) => pressed.delete(code);
export function endFrame() { pressed.clear(); mouse.dx = mouse.dy = mouse.wheel = 0; }

export const pad = { x: 0, y: 0, thr: 0 };
export function axis() {
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + pad.x;
  let y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + pad.y;
  if (touch.on) { x += touch.x; y += touch.y; }
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}
// Driving throttle: keys / on-screen pedals / gamepad triggers (the touch stick only steers).
export function throttle() {
  const k = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  return Math.max(-1, Math.min(1, k + pad.thr));
}

// ---- gamepad (standard mapping): sticks, triggers, A = action, B/X = jump / handbrake, Y = replay
const PAD_KEYS = { 0: ['KeyE', 'KeyF'], 1: ['Space'], 2: ['Space'], 3: ['KeyR'], 8: ['KeyP'], 9: ['Escape'], 5: ['KeyC'] };
const padDown = {};
export function pollGamepad() {
  let gp = null;
  try { gp = [...(navigator.getGamepads?.() || [])].find((g) => g && g.connected); } catch { /* blocked by the host page */ }
  if (!gp) { pad.x = pad.y = pad.thr = 0; return; }
  const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
  pad.x = dz(gp.axes[0] || 0); pad.y = -dz(gp.axes[1] || 0);
  mouse.dx += dz(gp.axes[2] || 0) * 16; mouse.dy += dz(gp.axes[3] || 0) * 10;
  pad.thr = (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
  for (const [b, codes] of Object.entries(PAD_KEYS)) {
    const on = !!gp.buttons[b]?.pressed;
    if (on && !padDown[b]) codes.forEach((c) => { pressed.add(c); keys.add(c); });
    if (!on && padDown[b]) codes.forEach((c) => keys.delete(c));
    padDown[b] = on;
  }
}

export const isTouch = () => document.body.classList.contains('touch');

export function initInput(canvas) {
  const lockable = () => !isTouch() && canvas.requestPointerLock;
  canvas.addEventListener('click', () => { if (!mouse.locked && lockable()) try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* not allowed here */ } });
  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
    document.dispatchEvent(new CustomEvent('lockchange', { detail: mouse.locked }));
  });
  addEventListener('mousemove', (e) => {
    if (mouse.locked || e.buttons) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
  });
  addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('gesturestart', (e) => e.preventDefault()); // no pinch-zoom of the page on iOS

  // --- touch: the on-screen controls appear the first time the screen is touched ---
  addEventListener('touchstart', () => {
    if (isTouch()) return;
    document.body.classList.add('touch');
    document.dispatchEvent(new CustomEvent('touchmode'));
  }, { capture: true, passive: true });

  const joy = document.getElementById('joy'), nub = document.getElementById('nub');
  let joyId = null, lookId = null, lx = 0, ly = 0;
  const setJoy = (t) => {
    const r = joy.getBoundingClientRect(), R = r.width / 2;
    let dx = (t.clientX - r.left - R) / R, dy = (t.clientY - r.top - R) / R;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    touch.x = dx; touch.y = -dy; touch.on = true;
    nub.style.transform = `translate(${dx * 70}%, ${dy * 70}%)`;
  };
  const endJoy = () => { joyId = null; touch.x = touch.y = 0; touch.on = false; nub.style.transform = ''; };
  joy.addEventListener('touchstart', (e) => { joyId = e.changedTouches[0].identifier; setJoy(e.changedTouches[0]); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; e.preventDefault(); }, { passive: false });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) setJoy(t);
      else if (t.identifier === lookId) { mouse.dx += (t.clientX - lx) * 2.2; mouse.dy += (t.clientY - ly) * 2.2; lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: true });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) endJoy();
      if (t.identifier === lookId) lookId = null;
    }
  };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  for (const b of document.querySelectorAll('#touch [data-key]')) {
    const codes = b.dataset.key.split(',');
    const up = () => { codes.forEach((c) => keys.delete(c)); b.classList.remove('down'); };
    b.addEventListener('touchstart', (e) => { codes.forEach((c) => { pressed.add(c); keys.add(c); }); b.classList.add('down'); e.preventDefault(); }, { passive: false });
    b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
  }
}
