# Nebula Dominion

A real-time strategy game in the style of StarCraft II that runs in the browser. It has three original races, each with its own economy and a three-tier tech tree, and you play against an AI opponent.

- **2D battlefield:** every unit, building and resource is procedural vector art drawn with Canvas 2D. There are no sprite sheets.
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

## Development

```bash
npm install
npm run dev          # local dev server
npm test             # 42 simulation tests (mechanics + full AI-vs-AI games in every matchup)
npm run build && npm run preview
npm run test:e2e     # drives the built game in headless Chrome (needs the preview server running)
```

### Layout

```
src/sim/       game.ts (engine), data.ts (races/units/tiers), ai.ts, map.ts, pathfinding.ts
src/render/    renderer2d.ts, sprites.ts, terrain.ts (Canvas 2D); fx3d.ts, portrait3d.ts (Three.js)
src/audio/     audio.ts (procedural Web Audio engine)
src/ui/        commands.ts (command card)
src/main.ts    app shell, input, HUD, minimap
tests/unit     Vitest simulation tests
tests/e2e      Puppeteer browser test
```

All names, art and audio are original. The game is inspired by the RTS genre but uses no StarCraft assets or names.
