# CHICKEN INVASION: THE HATCH

**They didn't just invade Earth. They're evolving across the galaxy.**

A premium 3D top-down space shooter for desktop and mobile browsers. Absorb alien DNA,
watch your living ship physically evolve, and fight through three stages to defeat the
Chicken Overlord.

![Genre](https://img.shields.io/badge/genre-3D%20arcade%20shooter-4ae0ff) ![Stack](https://img.shields.io/badge/stack-React%20%C2%B7%20TypeScript%20%C2%B7%20Three.js%20%C2%B7%20Vite-b06bff)

---

## Quick start

```bash
npm install
npm run dev        # ← default start command (http://localhost:5173)
```

Production build and preview:

```bash
npm run build      # type-check + production bundle into dist/
npm run preview    # serve the production build
```

Other scripts:

```bash
npm run typecheck  # TypeScript, no emit
npm test           # unit tests (vitest)
```

No backend, no paid APIs, no external asset downloads — everything (models, textures,
VFX, audio, music) is generated procedurally at runtime.

---

## Controls

### Desktop

| Input | Action |
| --- | --- |
| `W A S D` / Arrow keys | Move |
| Mouse | Optional aiming (weapons aim toward the cursor when it is moving) |
| *(automatic)* | Primary weapon always fires |
| `Space` | **Mega Burst** (consumes the rechargeable energy meter) |
| `Esc` / `P` | Pause / resume |
| `M` | Mute |

### Mobile / touch

| Input | Action |
| --- | --- |
| Drag on the left half of the screen | Virtual joystick movement |
| *(automatic)* | Primary weapon always fires |
| **MEGA BURST** button (bottom right) | Special ability |
| ❚❚ button (top right) | Pause |

The game is fully playable with touch only — no keyboard required.

---

## The game

### The Living Ship — signature mechanic

Enemies drop **DNA fragments**. Collecting them fills the evolution meter and physically
transforms your ship: glowing veins, organic spines, a pulsing heart-core, crown tendrils,
blade wings and orbiting energy motes grow on the hull across **four evolution levels**.
The transformation is purely visual geometry — not just a HUD number.

Four DNA types with distinct gameplay and VFX:

| DNA | Effect | Visual |
| --- | --- | --- |
| 🔥 **Fire** | Burning damage-over-time on hit | Orange flame tendrils, ember trails |
| ⚡ **Plasma** | Higher damage & fire rate | Magenta plasma orbs and halos |
| ❄ **Ice** | Slows enemies on hit | Cyan crystals growing on the hull |
| 🔋 **Electric** | Chain lightning to nearby enemies | Volt coils and lightning arcs |

**Combo weapons** (collect 7+ of each type):

- **Fire + Electric → Chain Nova** — explosive chain-lightning shots.
- **Ice + Plasma → Cryo Lance** — piercing freezing energy beam.

### Mega Burst

A rechargeable energy meter (charged by time and kills). Unleash it for a radial energy
explosion that damages everything nearby, erases enemy bullets, and triggers a screen-wide
shockwave with lightning arcs.

### Enemies

- **Space Chicken** — fast flocking alien chickens, aimed shots, DNA drops.
- **Armored Duck** — slow, tanky, layered armor plates that break off with debris VFX.
- **Rocket Chicken** — telegraphs, then charges at speed with an engine trail and explodes.
- **Alien Egg** — hatches into new enemies if ignored. Visible warning stages
  (calm → glowing → shaking/red cracks → hatch). Destroy early for bonus DNA.
- **Iron Duke** *(stage 1 mini-boss)* — command duck with spread volleys, radial bursts
  and minion summons. Visible health bar.
- **The Chicken Overlord** *(final boss)* — three attack phases (volleys & summons →
  spirals, rockets & egg drops → enraged dashes and dense patterns), entrance cinematic,
  boss health bar with phase pips, slow-motion multi-explosion death and victory screen.

### Three stages (~2–3 minutes each)

1. **Earth Orbit** — Earth with atmospheric rim, blue lighting, asteroid field, basic
   formations, egg introduction, ends with the Iron Duke mini-boss.
2. **The Nebula** — violet/magenta nebula, ringed gas giant, armored ducks, rocket
   chickens and egg hatching, escalating formations.
3. **The Chicken Armada** — dark crimson battlefield, an alien mothership fleet in the
   background, dense mixed waves, and the final boss.

### Juice & feedback

Layered particle explosions, shockwave rings, billboard flashes, lightning arcs, projectile
trails, hit flashes, armor-break debris, DNA magnet-collect effects, evolution transformation
bursts, screen shake (optional), hit-stop and slow-motion, floating score numbers, stage
transition cards, boss entrance roar, synthesized SFX for every action and a generative
per-stage music soundtrack (Web Audio API — see below).

### UI

Animated main menu (live 3D ship showcase), in-game HUD (hull, score, stage, DNA panel,
evolution progress, active combo badge, Mega Burst meter, boss health), pause menu,
settings (master/music/SFX volume, mute, screen shake, particle quality, FPS counter),
controls/help screen, stage transitions, game-over and victory screens with ranks.
Best score and settings persist via `localStorage`.

---

## Tech stack & architecture

- **React 18 + TypeScript + Vite** — UI shell and overlays.
- **Three.js** (vanilla, with `EffectComposer` + `UnrealBloomPass` + `OutputPass`) —
  rendering. The game loop is a plain class (`GameEngine`) to avoid React re-renders
  during gameplay; the UI reads a throttled mirror of HUD state.
- **Zustand** — lightweight UI state store with `localStorage` persistence.
- **Web Audio API** — every sound effect and the music (per-stage generative sequencer:
  drums, bass, arpeggio, pad) is synthesized live. No audio files.

```
src/
  game/
    GameEngine.ts     # renderer, camera, game loop, flow (menu → stages → boss → endings)
    Player.ts         # the Living Ship: movement, autofire, DNA, evolution, Mega Burst
    Evolution.ts      # pure evolution logic (unit-tested)
    models.ts         # procedural model library (ships, chickens, ducks, eggs, boss)
    enemies.ts        # enemy behaviors incl. hatching, mini-boss and the Overlord
    StageDirector.ts  # scripted wave timelines per stage (unit-tested)
    Environment.ts    # nebula shader, planets, stars, asteroids, armada, lighting
    Particles.ts      # pooled VFX: points, flashes, rings, lightning, beams
    Projectiles.ts    # pooled projectiles with trails and effects
    Pickups.ts        # DNA / health fragments with magnet collection
    AudioEngine.ts    # synthesized SFX + generative music
    input.ts          # keyboard, mouse aim, touch joystick
  ui/                 # MainMenu, HUD, Pause, GameOver, Victory, Settings, Help, Touch
  state.ts            # zustand store + localStorage
tools/
  visual-qa.mjs       # headless-browser screenshot harness
  flow-qa.mjs         # headless end-to-end state-machine checks
tests/                # vitest unit tests
```

### Performance

Object pooling (projectiles, particles, pickups, enemies), shared geometries/materials,
merged meshes per enemy, capped device pixel ratio, adaptive particle budget setting,
cheap XZ circle collisions, throttled HUD updates, and proper Three.js disposal on teardown.

---

## Testing

### Unit tests (`npm test`) — 16/16 passing

- `tests/evolution.test.ts` — evolution levels & thresholds, DNA caps, single-type weapon
  effects, both combo unlocks, damage/fire-rate/volley scaling, progress bounds, math utils.
- `tests/stages.test.ts` — stage timeline ordering and one-shot emission, mini-boss/boss
  placement, egg introduction in stage 2, elapsed-time tracking.

### End-to-end flow checks (`node tools/flow-qa.mjs`) — 19/19 passing

Driven in a real headless browser (WebGL via SwiftShader):

1. Boots into the main menu
2. Start game enters stage 1
3. Stage 1 playing with HUD
4. Auto-fire produces bullets
5. DNA collection raises evolution level
6. Fire + Electric unlocks Chain Nova
7. Mega Burst drains the energy meter
8. All four enemy kinds spawn
9. Alien egg hatches when its timer expires
10. Stage 1 completes and advances to stage 2
11. Progression reaches stage 3
12. Boss spawns and becomes active
13. Boss defeat triggers the victory screen
14. Best score persists to `localStorage`
15. Player death triggers the game-over screen
16. Pause works
17. Resume works
18. Settings persist to `localStorage`
19. Zero uncaught page errors during the entire run

### Visual QA (`node tools/visual-qa.mjs`) — 14 screenshots captured & reviewed

Main menu, stage 1 gameplay, evolved ship, Mega Burst, stage 2 enemies (chickens, ducks,
rocket, egg), stage 3 boss fight, pause menu, game over, mobile portrait (390×844),
settings panel, help screen, stage transition card, victory screen, full-battle composition.
Screenshots were inspected iteratively and drove fixes to lighting (IBL + brighter keys),
metal shading, the duck silhouette, bullet halo sizing, asteroid deformation, the boss
readability, the ortho-scaled background fleet, and the menu ship placement.

To run the harnesses yourself (optional, not needed to play):

```bash
npm i --no-save puppeteer-core @sparticuz/chromium
node tools/flow-qa.mjs http://localhost:5173
node tools/visual-qa.mjs http://localhost:5173 tools/shots
```

### TypeScript & build

`npm run typecheck` and `npm run build` both pass clean.

---

## Asset attribution & licenses

**All game assets are generated procedurally by the source code at runtime** — 3D models
(layered lathes, extrusions, tubes and shaped plates), canvas textures, shader effects,
particles and all audio/music (Web Audio synthesis). There are **no third-party art or
audio assets**, no external CDN fetches and no copyrighted content.

System font stack (Segoe UI / Inter / Roboto / Helvetica / Arial) — no bundled fonts.

### Software dependencies (all permissive)

| Package | License | Use |
| --- | --- | --- |
| [three](https://github.com/mrdoob/three.js) | MIT | 3D rendering |
| [react](https://github.com/facebook/react) / react-dom | MIT | UI shell |
| [zustand](https://github.com/pmndrs/zustand) | MIT | UI state |
| [vite](https://github.com/vitejs/vite) | MIT | build tooling |
| [typescript](https://github.com/microsoft/TypeScript) | Apache-2.0 | types |
| [vitest](https://github.com/vitest-dev/vitest) | MIT | unit tests |
| puppeteer-core / @sparticuz/chromium *(dev-only, optional)* | Apache-2.0 | QA harnesses |

The game code itself is released under the MIT License (see `LICENSE`).

---

## Known limitations

- **No gamepad support** — keyboard/mouse and touch only.
- **Music is generative, not composed** — it is procedural by design (zero audio files);
  it loops chord progressions per stage rather than featuring a hand-written score.
- **No mid-stage checkpoints** — dying restarts from stage 1 (arcade style); the best
  score persists.
- **Particle quality setting takes effect for new sessions** — the particle pool size is
  fixed when the engine is constructed.
- **Mouse aiming is subtle by design** — auto-fire leads straight up unless the cursor is
  actively moving in the play area.
- The QA harnesses expect `puppeteer-core` + `@sparticuz/chromium` installed separately
  (kept out of `package.json` to keep the game install lean).
