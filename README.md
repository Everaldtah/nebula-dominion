# Nebula Dominion

A real-time strategy game in the style of StarCraft II that runs in the browser. It has three original races, each with its own economy and a three-tier tech tree, and you play against an AI opponent.

- **2D battlefield:** units, buildings and resources are AI-generated 3D models pre-rendered into 16-direction animated sprite sheets and drawn with Canvas 2D over lit height-field terrain. Procedural vector art is the fallback.
- **3D effects (Three.js):** projectiles, beams, explosions, lit 3D debris, shockwaves, warp-in columns, shield hits, ability effects, camera shake, a rotating 3D portrait of the selected unit, and an animated planet on the menu.
- **TypeScript simulation:** deterministic, fixed 20 Hz tick, no DOM. The same engine runs in the browser and in the tests.
- **Procedural audio:** every sound is synthesized at runtime with the Web Audio API, so all of it is original. That covers music for each scene, race-specific unit voice lines, weapons, impacts, deaths, debris, abilities, construction and UI sounds.

## Races

| | Vanguard Directorate | Kyrrh Swarm | Aethel Concord |
|---|---|---|---|
| Style | Industrial human fleet. Builders stay on site | Chitinous hive. Units hatch from larva; buildings need creep | Radiant constructs. Shields regenerate; structures need a Lumen field |
| Worker | Rigger | Grub (consumed when building) | Acolyte (starts a structure, which then builds itself) |
| Supply | Habitat Pod | Drover (flying) | Lumen Obelisk (also projects power) |
| Main base: T1 → T2 → T3 | Command Bastion → Citadel → Stronghold | Brood Nest → Sanctum → Throne | Sanctum Core → Radiant Core → Exalted Core |
| Upgrade chamber | Arsenal (ground weapons, plating, starship weapons) | Mutagen Pit (talons, carapace) + Aerie (flyer attacks) | Crucible (arms, plating) + Skyforge (ship weapons) |
| Tier 1 | Trooper, Breacher, Mender | Skitterling, Carapid, Matron | Vindicator, Seeker |
| Tier 2 | Scorcher, Juggernaut (Anchor Mode), Wasp | Quillback, Wyvern | Bulwark, Strider, Radiant |
| Tier 3 (giant) | **Titan**, **Dreadnought** (Solar Lance), from Fusion Works | **Behemoth** (Great Cavern), **Gravemaw** (Elder Aerie) | **Hierophant**, **Empyrean**, from Celestial Archive |
| Tier-3 research | Titanium Hulls (+2 armor) | Chitin Bulwark (+2 armor) | Aegis Lattice (+2 armor) |

Weapon and armor upgrade level 2 needs a Tier 2 main base, and level 3 needs Tier 3, as in StarCraft II.

## Mechanics

- **Economy:** crystal and flux harvesting with one worker per crystal patch at a time, 3 workers per flux vent, patches that deplete, expansions, supply caps and production queues.
- **Combat:** damage bonuses against Light, Armored and Massive units, armor and shields, splash, bouncing attacks, ramping beams, ground and air targeting, minimum range, and weapon/armor/air upgrades.
- **Abilities:** Overdrive (stim), Anchor Mode (siege), Phase Step (blink), Spawn Brood (larva inject), Solar Lance, and automatic Mender healing.
- **Movement:** A* and cached flow fields, line-of-sight smoothing, unit separation, sliding along walls, and formation moves.
- **Fog of war:** explored and visible areas, with memory of enemy structures you have seen.
- **AI:** easy, normal and hard. It follows race build orders, upgrades its main base, expands, saturates gas, researches, attacks in waves, defends (pulling workers if needed), and micro-manages units: sieging, stimming, blinking out and firing the Solar Lance.

## Controls

Left-click or drag to select. Right-click for the smart command (move, attack, harvest or rally). The hotkeys are: **A** attack-move, **S** stop, **H** hold, **P** patrol, **M** move, **B**/**V** build menus, **Ctrl+1-9** to set a control group, **1-9** to recall it, **F1** for an idle worker, **F2** to select the army, **Space** to jump to the last alert, and **F10**/**Esc** for the menu. Scroll with the arrow keys, the screen edges or a middle-button drag, and zoom with the wheel.

## AI-generated 3D assets

Units, buildings and resources are real 3D models made by open AI models, then pre-rendered into sprite sheets in the style of StarCraft 1:

1. **Concept art:** SDXL (OpenRAIL++) renders 3 candidates per asset on a free Kaggle T4 pair (`assetgen/concepts`).
2. **Image → 3D:** [Microsoft TRELLIS](https://github.com/microsoft/TRELLIS) (MIT) turns the chosen concept into a textured GLB mesh (`assetgen/trellis`, about 60 s per model on a T4).
3. **Rig, animate and render:** Blender 5 with Cycles on the GPU (`assetgen/blender/rig_render.py`, run by `assetgen/build_assets.py`) does the following:
   - Normalizes each model to game scale.
   - Recolors the blue-keyed panels to each team's color.
   - Adds procedural animation: a biped or quadruped gait, serpent undulation, hover bob, vehicle bounce or a light pulse.
   - Renders 16 facing directions × animation frames from a 48° camera onto a shadow catcher, plus a 24-frame turntable used for the HUD portrait.

`python assetgen/kaggle_run.py concepts`, `python assetgen/kaggle_run.py trellis --sources everaldtah/nd-assetgen-concepts --env PICKS=id:k,...` and then `python assetgen/render_all.py` rebuild everything. Hunyuan3D was ruled out because its license excludes the UK and EU.

## Unit Gallery and Campaign

- **Unit Gallery (menu):** every unit and structure of all three races as the real AI-generated 3D model.
  - Drag to orbit, scroll to zoom, with an auto-rotate toggle.
  - Units are auto-rigged (legs detected from the mesh, plus spine, head and wings) and play Idle, Walk and Attack at an adjustable speed.
  - The concept portrait and full stats appear alongside the model.
- **Campaign: The Shattered Veil.**
  - Nine original missions across three acts (Directorate, Kyrrh, Aethel).
  - Briefings with character portraits, and in-mission comms.
  - Objectives: destroy, survive, build, reach a tier, and protect your base, with scripted attack waves.
  - Tech is locked per mission, and progress is saved.

## Operation Iron Descent (first-person campaign)

A first-person campaign played only with Vanguard Directorate forces. You are Ember-One, a trooper dropped onto Vorrhaal, the Kyrrh Swarm homeworld.

- **Intro cinematic (about 50 seconds, skippable).** The flagship *Unyielding Covenant* in orbit, a hull flyby, dropships launching, re-entry through the burning sky, and landfall. It is rendered in real time, with narrated subtitles and a procedural engine rumble.
- **Three missions:**
  - **Landfall:** on foot. Hold the drop zone, then destroy the Thorn Colonies.
  - **Into the Mire:** the Tier 2 Juggernaut drops in. Burn both Brood Nests and kill the Matrons.
  - **Titanfall:** the Tier 3 Titan drops in, and the Dreadnought's Solar Lance becomes available. Kill the Behemoths and break the Brood Throne.
- **RTS-accurate rules.** Every Kyrrh stat, weapon, range, cooldown, armor value, armored bonus, splash, regeneration and creep speed comes from `src/sim/data.ts`. The same applies to the RTS larva timer and Matron *Spawn Brood*, Directorate *Overdrive* (−10 HP, +50% for 11 s), *Anchor Mode* (2.7 s transition, 39 m range, minimum range, splash) and *Solar Lance* (2 s charge, 240 damage, 71 s cooldown).
  - The player is a hero: ×4 health, Level 3 Weapons and Plating, Titanium Hulls on the Titan, and a Mender drone that heals at the Mender's 12.6 HP/s once you break contact.
- **Controls:** WASD to move, Shift to sprint, Space to jump, mouse to aim, LMB to fire. 1/2 switches between rifle and grenades, R reloads (or calls the Solar Lance in Titanfall), Q is Overdrive, E boards or exits a mech, F toggles Anchor Mode, and Esc pauses.
- **Environment art is AI-generated on Kaggle**, like the units: SDXL ground textures, sky and planet map, plus SDXL→TRELLIS 3D props (fungus trees, bone arches, spires, egg clutches, crystals, the dropship wreck, the flagship and the dropship). See `assetgen/envconcepts/` and `assetgen/build_env.py`.

### Windows desktop app

`desktop/` packages Iron Descent as a standalone Windows app with Electron. It launches fullscreen on the discrete GPU straight into the campaign; F11 toggles windowed mode and *Quit to desktop* exits.

```bash
cd desktop && npm install && node build.mjs   # web build -> FPS-only assets -> IronDescent.exe
```

The build installs to `%LOCALAPPDATA%\Programs\IronDescent` and adds Desktop and Start-menu shortcuts. `node tests/e2e/desktop_app.mjs` smoke-tests the installed app.

## Modes and performance

- **Play vs AI** or **Watch AI vs AI**. The spectator mode shows both economies and has an accelerator (½× to 16×, plus MAX) and a director camera that follows the biggest fight.
- **F9** shows a performance overlay. The menu reports whether the browser is using your GPU. If you're on software rendering, it warns you and switches to lighter effects.
- **Local GPU play:** double-click `Play Nebula Dominion (GPU).cmd`. It serves `dist/` at http://localhost:4747 (`serve-local.mjs`, no dependencies) and opens a dedicated Chrome window with GPU rasterization and zero-copy forced on.

## Development

```bash
npm install
npm run dev          # local dev server
npm test             # 56 tests: simulation (mechanics + full AI-vs-AI games in every matchup), campaign and FPS data
npm run build && npm run preview
npm run test:e2e     # drives the built game in headless Chrome (needs the preview server running)
node tests/e2e/fps.mjs http://localhost:5173/   # FPS campaign: intro + all 3 missions played by an auto-aim bot
```

### Layout

```
src/sim/       game.ts (engine), data.ts (races/units/tiers), ai.ts, map.ts, pathfinding.ts
src/render/    renderer2d.ts, sprites.ts, terrain.ts (Canvas 2D); fx3d.ts, portrait3d.ts (Three.js)
src/audio/     audio.ts (procedural Web Audio engine)
src/ui/        commands.ts (command card), gallery.ts (3D unit gallery)
src/campaign/  RTS campaign missions + controller
src/fps/       FPS campaign: fps.ts (engine), cinematic.ts (intro), mode.ts (menus/HUD), story.ts (script + missions)
src/main.ts    app shell, input, HUD, minimap
tests/unit     Vitest simulation tests
tests/e2e      Puppeteer browser test
```

All names, art and audio are original. The game is inspired by the RTS genre but uses no StarCraft assets or names.
