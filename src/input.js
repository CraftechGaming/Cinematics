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

export function axis() {
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  if (touch.on) { x += touch.x; y += touch.y; }
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}

export function initInput(canvas) {
  canvas.addEventListener('click', () => {
    if (!mouse.locked && !('ontouchstart' in window)) canvas.requestPointerLock?.()?.catch?.(() => {});
  });
  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
    document.dispatchEvent(new CustomEvent('lockchange', { detail: mouse.locked }));
  });
  addEventListener('mousemove', (e) => {
    if (mouse.locked || e.buttons) { mouse.dx += e.movementX; mouse.dy += e.movementY; }
  });
  addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); }, { passive: true });

  // --- touch: left stick + drag-to-look + buttons ---
  const pad = document.getElementById('touch');
  if (!('ontouchstart' in window)) return;
  pad.style.display = 'block';
  const joy = document.getElementById('joy'), nub = document.getElementById('nub');
  let joyId = null, lookId = null, lx = 0, ly = 0;
  const setJoy = (t) => {
    const r = joy.getBoundingClientRect(), R = r.width / 2;
    let dx = (t.clientX - r.left - R) / R, dy = (t.clientY - r.top - R) / R;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    touch.x = dx; touch.y = -dy; touch.on = true;
    nub.style.transform = `translate(${dx * 35}%, ${dy * 35}%)`;
  };
  joy.addEventListener('touchstart', (e) => { joyId = e.changedTouches[0].identifier; setJoy(e.changedTouches[0]); e.preventDefault(); });
  canvas.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) setJoy(t);
      else if (t.identifier === lookId) { mouse.dx += (t.clientX - lx) * 2; mouse.dy += (t.clientY - ly) * 2; lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: true });
  addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { joyId = null; touch.x = touch.y = 0; touch.on = false; nub.style.transform = ''; }
      if (t.identifier === lookId) lookId = null;
    }
  });
  for (const b of pad.querySelectorAll('[data-key]')) {
    const codes = b.dataset.key.split(',');
    b.addEventListener('touchstart', (e) => { codes.forEach((c) => { pressed.add(c); keys.add(c); }); e.preventDefault(); });
    b.addEventListener('touchend', () => codes.forEach((c) => keys.delete(c)));
  }
}
