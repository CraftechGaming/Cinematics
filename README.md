# Sunset Bay

An original, family-friendly **3D open-world driving adventure** that runs in the browser
(Three.js / WebGL). Explore a coastal city on foot or by car, meet its characters, play
story missions with dialogue and cutscenes — and direct your own movie moments.

No violence, no weapons, no mature content: you race the clock, not other people.

## Play

```
npm start          # or: node server.js
```

Then open http://localhost:8080 (any static web server works; there is no build step).

## Features

- **Open world** – procedural city with downtown towers, a park, a beach, a pier and a
  Ferris wheel, traffic that follows the roads and pedestrians you can chat with.
- **Cars** – three cars to unlock (Pebble, Dune pickup, Comet sports car) with arcade
  handling, handbrake drifts, headlights and engine sound.
- **Animation** – jointed characters with walk / run / jump / talk / wave animations.
- **Dialogue** – typewriter dialogue with choices and over-the-shoulder cameras.
- **Cinematics** – letterboxed cutscenes with scripted camera moves and subtitles.
- **Story missions** – *First Wheels*, *Hot Slices* (pizza delivery) and *Sunset Sprint*
  (checkpoint race), plus 12 hidden gold stars.
- **Graphics** – physically based sky and image-based reflections, PBR glass façades,
  clear-coat car paint, soft shadows, HDR bloom, filmic tone mapping and 4x MSAA.
- **Day / night cycle** – sunsets, starry nights, lit windows and street lamps.
- **Resolutions** – renders at exactly **720p (1280×720)**, **1080p (1920×1080)** or
  **2160p / 4K (3840×2160)**; choose in *Settings*. The HUD scales with the picture.
- **Special feature: Director Mode**
  - **Instant Replay (R)** – the last 15 seconds are always recorded. Rewatch them as a
    movie with automatic cinematic cameras, slow motion and scrubbing.
  - **Photo Mode (P)** – freeze time, fly a free camera, change the time of day, pick a
    filter and save a picture at the current resolution (up to 4K).

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk · drive |
| Mouse | Look around |
| Shift | Run |
| Space | Jump · handbrake |
| F | Get in / out of your car |
| E | Talk · continue dialogue |
| R | Director Replay |
| P | Photo Mode |
| M | Mute music |
| Esc | Pause |

**Touch (iPad, tablets, phones in landscape):** left stick to walk or steer, drag the screen to
look, and on-screen ACT / JUMP / GAS / BRAKE / DRIFT / REPLAY / PHOTO buttons.
**Gamepad:** sticks, RT gas, LT brake, A action, B jump or drift, Y replay, Start pause.

On 16:9 screens the picture is exactly 1280×720, 1920×1080 or 3840×2160; on other screen
shapes (such as an iPad) the height stays the same and the width follows the screen.
Graphics quality (Auto / High / Medium / Low) is in *Settings*; Auto steps down if the
frame rate stays low.

## Code map

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, resolution, main loop, player, camera, menus |
| `src/world.js` | City generation, sky, lighting, day/night |
| `src/entities.js` | Character rig + animation, car models + physics |
| `src/traffic.js` | AI traffic and pedestrians |
| `src/scenes.js` | Dialogue and cutscene systems |
| `src/story.js` | Characters, scripts, missions, collectibles |
| `src/director.js` | Replay and photo mode |
| `src/ui.js`, `src/audio.js`, `src/input.js` | HUD/minimap, synthesized audio, input |

Three.js (MIT) is vendored in `vendor/`.
