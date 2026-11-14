// Characters, dialogue scripts, missions, checkpoints and collectibles.
import * as THREE from 'three';
import { G, HALF, save, damp, angLerp } from './ctx.js';
import { makeHuman, poseHuman, makeVehicle, syncVehicle } from './entities.js';
import { startDialogue, playCutscene } from './scenes.js';
import { setObjective, setTimer, banner, fade } from './ui.js';
import { sfx } from './audio.js';
import { clearReplay } from './director.js';

let cpMesh, questMesh, scene;
const CAR_SPOTS = { pebble: [30, 44, 0], comet: [50, 44, 0], dune: [212, 187, Math.PI / 2] };
const STAR_SPOTS = [[0, HALF + 124], [-40, -30], [-120, -40], [75, HALF + 45], [-300, HALF + 30], [300, HALF + 30], [200, 214], [-314, -314], [314, -314], [40, 66], [-200, 74], [160, -200]];

export function initStory(sc) {
  scene = sc;
  const npc = (id, name, x, z, ry, look) => {
    const h = makeHuman(look); h.group.position.set(x, 0, z); h.group.rotation.y = ry; scene.add(h.group);
    G.npcs[id] = { id, name, h, x, z, ry, baseRy: ry, stop: false, talk: false };
  };
  npc('maya', 'Maya', 40, 35, 0, { skin: 0xa8703f, hair: 0x1b1b1b, shirt: 0x12343b, pants: 0x3d405b });
  npc('rico', 'Rico', 204.5, 199.5, 0, { skin: 0xd9a273, hair: 0x4a2c17, shirt: 0xf8f9fa, pants: 0xb3261e, scale: 1 });
  npc('zoe', 'Zoe', -112, HALF + 10, Math.PI, { skin: 0xf1c9a5, hair: 0xe85d9f, shirt: 0x9b5de5, pants: 0x1d3557, scale: 0.9 });

  for (const [type, [x, z, h]] of Object.entries(CAR_SPOTS)) {
    const v = makeVehicle(type); v.x = x; v.z = z; v.h = v.va = h; v.home = [x, z, h];
    scene.add(v.group); G.vehicles.push(v); syncVehicle(v, 0);
  }
  const truck = makeVehicle('van', 0xfff3d6); truck.x = 200; truck.z = 196; truck.h = Math.PI / 2; syncVehicle(truck, 0); scene.add(truck.group);
  G.colliders.push({ x0: 197.2, x1: 202.8, z0: 194.8, z1: 197.2, h: 2 });

  cpMesh = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 30, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5d93, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  beam.position.y = 15;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.25, 8, 36), new THREE.MeshBasicMaterial({ color: 0xffd166 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3;
  cpMesh.add(beam, ring); cpMesh.visible = false; scene.add(cpMesh);
  questMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb703, emissiveIntensity: 1.2 }));
  scene.add(questMesh);

  const sg = new THREE.OctahedronGeometry(0.55), sm = new THREE.MeshStandardMaterial({ color: 0xfff1a8, emissive: 0xffc300, emissiveIntensity: 1.5, metalness: 0.6, roughness: 0.2 });
  G.starObjs = STAR_SPOTS.map(([x, z]) => { const s = new THREE.Mesh(sg, sm); s.position.set(x, 1.3, z); s.scale.y = 1.5; scene.add(s); return s; });
}

export function applyUnlocks() {
  for (const v of G.vehicles) if (v.home) { v.owned = !!G.unlocked[v.type]; v.group.visible = v.owned; }
  G.starObjs.forEach((s, i) => { s.visible = !G.stars.includes(i); });
}

// ---------------------------------------------------------------- scripts
const L = (who, text, extra) => ({ who, text, ...extra });
const MISSIONS = [
  { giver: 'maya', title: 'First Wheels', reward: 200, needCar: true, cps: [[0, HALF]], label: () => (G.player.car ? 'Drive to the pier' : 'Get in the yellow Pebble — press <b>F</b>'), passText: 'You know the way to the sea now.' },
  { giver: 'rico', title: 'Hot Slices', reward: 350, time: 150, unlock: 'dune', cps: [[80, 120], [-160, 40], [-80, -160]], label: (i) => `Deliver the pizzas while they're hot — ${i}/3`, passText: 'Unlocked: Dune pickup (parked by the plaza)' },
  { giver: 'zoe', title: 'Sunset Sprint', reward: 500, time: 135, unlock: 'comet', tod: 17.2, cps: [[-320, HALF], [-320, 0], [-160, 0], [-160, -160], [0, -160], [0, 160], [160, 160], [160, HALF], [0, HALF]], label: (i) => `Race the sunset — marker ${i + 1}/9`, passText: 'Unlocked: Comet sports car (at Maya\'s Garage)' },
];

function script(id) {
  const m = G.mission, giver = MISSIONS[m]?.giver === id && !G.active;
  if (G.active?.def.giver === id) return [L(G.npcs[id].name, 'The clock is ticking — follow the pink marker. Go, go, go!')];
  if (id === 'maya') {
    if (giver) return [
      L('Maya', 'You must be Kai! Welcome to Sunset Bay.'),
      L('Kai', 'Thanks, Maya. I heard this is the place to be if you love driving.'),
      L('Maya', 'It is — if you drive smart. Around here we race the clock, not each other\'s bumpers.', { choices: [
        { t: 'I\'m ready. What do I drive?', lines: [L('Maya', 'That little yellow Pebble out front. She\'s small, but she\'s got heart.')] },
        { t: 'Any rules I should know?', lines: [L('Maya', 'Three. Be kind to pedestrians, bring my cars back shiny, and always enjoy the view.'), L('Maya', 'Your ride is the yellow Pebble out front.')] },
      ] }),
      L('Maya', 'Take her down to the pier and get a feel for the city. Follow the pink marker on your map.'),
    ];
    if (m === 1) return [L('Maya', 'Not bad for a first drive! Rico at the plaza is looking for a driver. Look for the gold marker.')];
    if (m === 2) return [L('Maya', 'Zoe is filming down on the coast road. Win her race and I might have a surprise for you.')];
    return [L('Maya', 'The Comet is yours, champ. Treat her well.'), L('Kai', 'Shiny and in one piece. I promise.')];
  }
  if (id === 'rico') {
    if (giver) return [
      L('Rico', 'Kai, right? Maya says you can drive. My delivery guy is stuck at the dentist!'),
      L('Rico', 'Three hot pizzas, three hungry customers. If they arrive cold, I cry. Actual tears.', { choices: [
        { t: 'Leave it to me!', lines: [L('Rico', 'That\'s the spirit! Go, go, go!')] },
        { t: 'What\'s in it for me?', lines: [L('Rico', 'Cash, free slices for life, and my trusty old pickup. Deal?'), L('Kai', 'Deal!')] },
      ] }),
    ];
    if (m < 1) return [L('Rico', 'Best pizza in the Bay! Come back when Maya says you\'re ready to drive for me.')];
    return [L('Rico', 'My hero! Slice on the house, any time.'), L('Kai', 'Extra pineapple?'), L('Rico', '...We can still be friends.')];
  }
  if (id === 'zoe') {
    if (giver || m >= 3) return [
      L('Zoe', m >= 3 ? 'Back for another take? The light is perfect.' : 'Hey! You\'re the new driver everyone\'s talking about. I\'m Zoe — I make movies.'),
      L('Zoe', 'One car, one lap of the city, golden sunset light. Hit every marker before the clock runs out.'),
      L('Zoe', 'And afterwards — press R. My replay cameras make everybody look like a movie star.', { choices: [
        { t: 'Lights, camera, action!', fn: () => { G.accept = true; }, lines: [L('Zoe', 'Rolling!')] },
        { t: 'Give me a minute.', lines: [L('Zoe', 'No rush. The sun sets every day.')] },
      ] }),
    ];
    return [L('Zoe', 'I\'m scouting locations. Come find me once you\'ve made a name for yourself.')];
  }
}

export function talkTo(n) {
  if (!n.id) return startDialogue([L('Local', n.line)], { npc: n });
  const m = G.mission, isGiver = MISSIONS[m]?.giver === n.id && !G.active, rematch = n.id === 'zoe' && m >= 3 && !G.active;
  G.accept = n.id !== 'zoe';
  startDialogue(script(n.id), { npc: n, onEnd: () => {
    if (isGiver && G.accept) startMission(MISSIONS[m]);
    else if (rematch && G.accept) startMission({ ...MISSIONS[2], reward: 150, unlock: null, rematch: true, passText: 'Another perfect take.' });
  } });
}

// ---------------------------------------------------------------- missions
function startMission(def) {
  G.active = { def, i: 0, time: def.time ?? null, cp: null };
  if (def.tod) G.tod = def.tod;
  setCp(0); banner(def.title, def.time ? 'Beat the clock!' : 'New mission', 2600); sfx('check');
}
function setCp(i) {
  const a = G.active, c = a.def.cps[i];
  a.i = i; a.cp = { x: c[0], z: c[1] }; cpMesh.position.set(c[0], 0, c[1]); cpMesh.visible = true;
}
function endMission(pass) {
  const a = G.active, def = a.def; G.active = null; cpMesh.visible = false; setObjective(''); setTimer(null);
  if (!pass) { banner('MISSION FAILED', `Talk to ${G.npcs[def.giver].name} to try again`, 4000, true); sfx('fail'); return; }
  G.money += def.reward;
  if (!def.rematch) G.mission++;
  if (def.unlock) G.unlocked[def.unlock] = true;
  applyUnlocks(); save(); sfx('pass');
  banner('MISSION PASSED', `+$${def.reward} · ${def.passText}`, 5200);
  const p = G.player, t = p.car || p;
  if (p.car) p.car.v *= 0.2;
  playCutscene([{ dur: 5, fov: 40, orbit: { c: [t.x, 1.1, t.z], r: p.car ? 9 : 5, h: 1.6, a0: (p.car ? p.car.h : p.ry) + 0.6, a1: (p.car ? p.car.h : p.ry) + 2.6 } }]);
}

export function updateStory(dt) {
  const p = G.player, px = p.car ? p.car.x : p.x, pz = p.car ? p.car.z : p.z, t = G.time;
  // named characters
  for (const n of Object.values(G.npcs)) {
    const near = Math.hypot(px - n.x, pz - n.z) < 9;
    n.ry = angLerp(n.ry, near || n.stop ? Math.atan2(p.x - n.x, p.z - n.z) : n.baseRy, damp(5, dt));
    n.h.group.rotation.y = n.ry;
    poseHuman(n.h, 0, 0, n.talk ? 'talk' : G.questNpc === n && near && !n.stop && !p.car ? 'wave' : 'move', t + n.x);
  }
  const giver = !G.active && MISSIONS[G.mission] ? G.npcs[MISSIONS[G.mission].giver] : !G.active && G.mission >= 3 ? G.npcs.zoe : null;
  G.questNpc = giver;
  questMesh.visible = !!giver && G.state !== 'dialogue';
  if (giver) { questMesh.position.set(giver.x, 2.35 + Math.sin(t * 3) * 0.08, giver.z); questMesh.rotation.y = t * 2; }
  // collectibles
  G.starObjs.forEach((s, i) => {
    if (!s.visible) return;
    s.rotation.y = t * 2 + i; s.position.y = 1.3 + Math.sin(t * 2 + i) * 0.2;
    if (Math.hypot(px - s.position.x, pz - s.position.z) < 2.6) {
      s.visible = false; G.stars.push(i); G.money += 50; sfx('star'); save();
      banner(`★ ${G.stars.length} / 12`, G.stars.length === 12 ? 'You found every star in Sunset Bay!' : 'Gold star found  +$50', 2200);
    }
  });
  // active mission
  const a = G.active; if (!a || G.state !== 'play') return;
  cpMesh.rotation.y = t; cpMesh.children[0].material.opacity = 0.22 + Math.sin(t * 4) * 0.08;
  setObjective(a.def.label(a.i));
  if (a.time != null) { a.time -= dt; setTimer(Math.max(0, a.time)); if (a.time <= 0) return endMission(false); }
  if ((!a.def.needCar || p.car) && Math.hypot(px - a.cp.x, pz - a.cp.z) < 6.5) {
    sfx('check');
    if (a.i + 1 >= a.def.cps.length) endMission(true); else setCp(a.i + 1);
  }
}

// ---------------------------------------------------------------- new game / continue
export function placeAtGarage() {
  const p = G.player; p.car = null; p.x = 40; p.z = 39; p.y = 0; p.ry = Math.PI; p.human.group.visible = true;
  for (const v of G.vehicles) if (v.home) { [v.x, v.z, v.h] = v.home; v.va = v.h; v.v = 0; syncVehicle(v, 0); }
  G.active = null; cpMesh.visible = false; setObjective(''); setTimer(null); clearReplay(); G.camSnap = true; G.cam.yaw = 0; G.cam.pitch = 0.3;
}

export function newGame() {
  Object.assign(G, { money: 0, mission: 0, stars: [], unlocked: { pebble: true }, tod: 16 });
  placeAtGarage(); applyUnlocks(); save();
  fade(true);
  setTimeout(() => {
    fade(false);
    playCutscene([
      { dur: 6.5, p0: [30, 70, HALF + 330], p1: [10, 30, HALF + 130], l0: [0, 20, 100], fov: 50, text: 'Sunset Bay. Where the road meets the sea.' },
      { dur: 6, p0: [-230, 95, -250], p1: [-110, 70, -120], l0: [-40, 25, -110], l1: [20, 10, 20], fov: 50, text: 'Everybody here is chasing something.' },
      { dur: 6, p0: [58, 2.4, 62], p1: [47, 1.9, 47], l0: [40, 1.4, 37], fov: 40, text: 'Kai just arrived with a backpack and one dream: to become the best driver in the Bay.' },
    ], () => talkTo(G.npcs.maya));
  }, 700);
}
