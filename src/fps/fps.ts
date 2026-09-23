// Operation Iron Descent — first-person mode (Three.js). Directorate soldier vs the Kyrrh Swarm.
// Unit stats and abilities come from the RTS data (sim/data.ts). Player units get "hero" scaling
// (x4 health, x3 rifle rate) so a lone soldier can survive; every enemy stat is exactly the RTS value.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DEFS } from '../sim/data';
import { audio } from '../audio/audio';
import { q } from '../assetver';
import { FpsMission, Radio } from './story';

const BASE = import.meta.env.BASE_URL;
export const M = 3;              // metres per RTS tile
const SPEED_K = 1.7;            // RTS tiles/s -> m/s for Kyrrh movement
const HERO_HP = 4, MECH_RATE = 2;   // hero pilots: x4 health, faster reloads

export type Difficulty = 'easy' | 'medium' | 'hard';
/** Kyrrh stats never change; difficulty scales how hard they hit, how many come, and how fast you recover. */
export const DIFFICULTY: Record<Difficulty, { label: string; desc: string; dmg: number; hp: number; waves: number; hatch: number; regenDelay: number }> = {
  easy: { label: 'Easy', desc: 'Kyrrh hit 40% softer, smaller swarms, and the Mender heals you sooner.', dmg: 0.6, hp: 1.3, waves: 0.7, hatch: 1.4, regenDelay: 3 },
  medium: { label: 'Medium', desc: 'The intended fight: RTS-strength Kyrrh against your hero loadout.', dmg: 1, hp: 1, waves: 1, hatch: 1, regenDelay: 4 },
  hard: { label: 'Hard', desc: 'Kyrrh hit 35% harder, bigger swarms, hives hatch faster, and healing is slow.', dmg: 1.35, hp: 0.85, waves: 1.35, hatch: 0.8, regenDelay: 6 },
};
// Hero loadout on foot: a fully automatic rifle (Trooper round + L3 upgrade) and high-explosive grenades.
const RIFLE = { interval: 0.085, mag: 45, reload: 1.5, spread: 0.006, bloom: 0.022 };
const GRENADE = { damage: 40, bonus: 20, radius: 4.5, cd: 0.75, knock: 14, stun: 0.5 };
// The Covenant's strike team ships fully researched: Directorate Weapons L3 and Plating L3 (+3 armor),
// Titans also carry Titanium Hulls (+2 armor). Damage bonus per level = the weapon's RTS perUpgrade.
const UPG = 3;
const up = (id: string) => (DEFS[id].weapon?.perUpgrade ?? 0) * UPG;
const WORLD = 190;

// ------------------------------------------------------------------ enemy kinds (from RTS defs)
interface Kind {
  id: string; hp: number; armor: number; armored: boolean; massive: boolean; speed: number; radius: number; air: number; scale: number;
  dmg: number; bonusArmored: number; range: number; cd: number; atk: 'melee' | 'spit' | 'lob' | 'glaive' | 'none'; hits: number;
  splash: number; hitsAir: boolean; regen: number; structure?: boolean; spawns?: string[]; spawnEvery?: number;
}
function kind(id: string): Kind {
  const d = DEFS[id];
  const w = d.weapon;
  const air = d.air ? ({ drover: 9, wyvern: 7, gravemaw: 12 } as Record<string, number>)[id] ?? 8 : 0;
  const atk: Kind['atk'] = !w ? 'none' : w.proj === 'claw' ? 'melee' : id === 'gravemaw' ? 'lob' : w.proj === 'glaive' ? 'glaive' : 'spit';
  const k: Kind = {
    id, hp: d.hp, armor: d.armor, armored: d.attrs.includes('armored'), massive: d.attrs.includes('massive'),
    speed: d.speed * SPEED_K, radius: Math.max(0.8, (d.kind === 'building' ? d.size * 0.5 : d.radius) * M * 0.75), air, scale: M,
    dmg: w?.damage ?? 0, bonusArmored: w?.bonus?.attr === 'armored' ? w.bonus.amount : 0, range: Math.max(2.2, (w?.range ?? 0) * M),
    cd: w?.cooldown ?? 1, atk, hits: w?.hits ?? 1, splash: (w?.splash ?? 0) * M, hitsAir: w ? w.targets !== 'ground' : false,
    regen: d.race === 'kyrrh' ? (d.regen ?? 0.27) : 0, structure: d.kind === 'building',
  };
  // Hives hatch one larva every 11 s (RTS larva timer); a Skitterling larva hatches as a pair.
  if (id === 'nest') { k.spawns = ['skitterling', 'skitterling']; k.spawnEvery = 11; }
  if (id === 'throne') { k.spawns = ['skitterling', 'skitterling', 'quillback']; k.spawnEvery = 11; }
  // Matron Spawn Brood (RTS: 25 energy, the nearest hive gets 3 extra larva after 29 s)
  if (id === 'matron') { k.spawnEvery = 29; }
  return k;
}

// ------------------------------------------------------------------ player vehicles (from RTS defs)
type Mode = 'foot' | 'juggernaut' | 'titan';
const VEHICLE = {
  foot: { hp: DEFS.trooper.hp * HERO_HP, armor: DEFS.trooper.armor + UPG, armored: false, eye: 1.7, speed: 6.5, radius: 0.5 },
  juggernaut: { hp: DEFS.juggernaut.hp * HERO_HP, armor: DEFS.juggernaut.armor + UPG, armored: true, eye: 3.2, speed: DEFS.juggernaut.speed * SPEED_K, radius: 1.6 },
  titan: { hp: DEFS.titan.hp * HERO_HP, armor: DEFS.titan.armor + UPG + 2, armored: true, eye: 7.5, speed: DEFS.titan.speed * SPEED_K + 1, radius: 2.6 },
};
const SIEGE = { damage: 40 + 4 * UPG, bonus: 30, range: 13 * M, minRange: 2 * M, cd: 2.14, splash: 1.25 * M, transition: 2.7 };

interface Enemy {
  id: number; net?: THREE.Vector3; netRy?: number; netAnim?: number;
  k: Kind; obj: THREE.Object3D; mixer: THREE.AnimationMixer | null; acts: Record<string, THREE.AnimationAction>;
  hp: number; pos: THREE.Vector3; vel: THREE.Vector3; cd: number; spawnT: number; lastHit: number; alive: boolean; dying: number; cur: string; flash: number; stun: number;
}
interface Shot { pos: THREE.Vector3; vel: THREE.Vector3; mesh: THREE.Mesh; dmg: number; bonus: number; splash: number; enemy: boolean; life: number; grav: number; hitsAir: boolean; color: number; kind: string }
interface Pickup { id: number; pos: THREE.Vector3; mesh: THREE.Object3D; mode: Mode; hp: number }

/** Co-op wiring supplied by the menu layer: who we are, and how to reach the partner. */
export interface CoopLink { role: 'host' | 'guest'; allyName: string; send(msg: any, reliable?: boolean): void; direct(): boolean }
interface Ally {
  name: string; pos: THREE.Vector3; target: THREE.Vector3; yaw: number; pitch: number; mode: Mode; hp: number; maxHp: number;
  down: boolean; firing: boolean; weapon: string; obj: THREE.Group; bodies: Partial<Record<Mode, { o: THREE.Object3D; mixer: THREE.AnimationMixer | null; walk?: THREE.AnimationAction; idle?: THREE.AnimationAction }>>;
  tag: THREE.Sprite; lastFx: number; lastMsg: number;
}

export interface FpsHooks {
  radio(r: Radio): void;
  objectives(html: string): void;
  hud(h: HudState): void;
  message(text: string, kind?: 'info' | 'warn'): void;
  end(win: boolean, text: string): void;
}
export interface HudState {
  hp: number; maxHp: number; mode: Mode; weapon: string; ammo: string; overdrive: number; anchor: string; lance: number; lanceReady: boolean;
  boss: { name: string; frac: number } | null; hurt: number; hitmark: number; radar: { x: number; z: number; air: boolean; big: boolean; pod?: boolean; ally?: boolean }[]; yaw: number;
  ally: { name: string; hp: number; maxHp: number; down: boolean; mode: Mode } | null; down: number; link: string;
  prompt: string;
}

function noise2(seed: number) {
  const p = new Uint8Array(512);
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const perm = Array.from({ length: 256 }, (_, i) => i).sort(() => rnd() - 0.5);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = (h: number, x: number, y: number) => ((h & 1) ? x : -x) + ((h & 2) ? y : -y);
  const f = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
    const u = f(x), v = f(y), a = p[X] + Y, b = p[X + 1] + Y;
    const l1 = g(p[a], x, y) + u * (g(p[b], x - 1, y) - g(p[a], x, y));
    const l2 = g(p[a + 1], x, y - 1) + u * (g(p[b + 1], x - 1, y - 1) - g(p[a + 1], x, y - 1));
    return (l1 + v * (l2 - l1)) * 0.7;
  };
}

export class FpsGame {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1200);
  private loader = new GLTFLoader();
  private models = new Map<string, { scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null>();
  private noise: (x: number, y: number) => number;
  private terrain!: THREE.Mesh;
  private colliders: { x: number; z: number; r: number }[] = [];
  private creep: { x: number; z: number; r: number }[] = [];
  enemies: Enemy[] = [];
  private shots: Shot[] = [];
  pickups: Pickup[] = [];
  private fx: { mesh: THREE.Object3D; t: number; life: number; grow: number; fade: boolean }[] = [];
  private sun!: THREE.DirectionalLight;
  // player
  pos = new THREE.Vector3(0, 0, 0);
  private vel = new THREE.Vector3();
  yaw = 0; pitch = 0;
  mode: Mode = 'foot';
  hp = 0; footHp = 0;
  weapon: 'rifle' | 'grenade' = 'rifle';
  private ammo = RIFLE.mag; private bloom = 0; private shake = 0; private muzzle: THREE.PointLight | null = null; private muzzleFlash: THREE.Sprite | null = null;
  private lights: THREE.PointLight[] = []; private lightNext = 0;
  maxHp(mode: Mode) { return Math.round(VEHICLE[mode].hp * this.D.hp); }
  private reload = 0; private fireCd = 0; private overdrive = 0;
  anchored = false; private anchorT = 0;
  private lanceCd = 0; private lanceCharge = 0; private lanceTarget: THREE.Vector3 | null = null; private lanceBeam: THREE.Mesh | null = null;
  private keys = new Set<string>();
  mouseDown = false;
  private grounded = true;
  private hurt = 0; private hitmark = 0; private lastHurt = -99;
  private gun: THREE.Group | null = null;
  private cockpit: THREE.Group | null = null;
  // mission
  mission: FpsMission;
  elapsed = 0;
  kills = new Map<string, number>();
  private waveNext: number[] = []; private waveN: number[] = [];
  private radioFired = new Set<number>();
  private objDone = new Set<number>();
  private podDropped = false;
  paused = false; over = false; result: 'win' | 'lose' | null = null;
  // co-op
  coop: CoopLink | null = null; ally: Ally | null = null;
  private nextId = 1; private podId = 1; private netT = 0; private metaT = 0; private stateT = 0;
  private hitQ: [number, number, number, number][] = [];
  private downT = 0; private pendingBoard = -1; private byId = new Map<number, Enemy>(); private seenCreep = new Set<number>();
  get role() { return this.coop?.role ?? 'solo'; }
  /** test hooks: fire without pointer lock, simulation speed multiplier */
  testAuto = false; timeScale = 1;
  private raf = 0; private last = 0;
  private handlers: [string, EventListener][] = [];

  private D: typeof DIFFICULTY[Difficulty];
  constructor(public canvas: HTMLCanvasElement, mission: FpsMission, private hooks: FpsHooks, private seed = 7, public difficulty: Difficulty = 'medium', coop: CoopLink | null = null) {
    this.mission = mission;
    this.coop = coop;
    this.D = DIFFICULTY[difficulty];
    this.hp = this.footHp = this.maxHp('foot');
    this.noise = noise2(seed * 97 + mission.id.length * 13);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    const draco = new DRACOLoader(); draco.setDecoderPath(`${BASE}draco/`); this.loader.setDRACOLoader(draco);
    this.camera.rotation.order = 'YXZ';
  }

  // ================================================================ loading
  private load(url: string) {
    return new Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null>(res => this.loader.load(url + q, g => res({ scene: g.scene, clips: g.animations }), undefined, () => res(null)));
  }
  async preload(onProgress: (f: number) => void) {
    const m = this.mission;
    const enemyIds = new Set<string>();
    for (const w of m.waves) for (const [id] of w.kinds) enemyIds.add(id);
    for (const [id] of m.structures) { enemyIds.add(id); kind(id).spawns?.forEach(s => enemyIds.add(s)); }
    enemyIds.add('matron'); enemyIds.add('skitterling');
    const units = [...enemyIds, 'juggernaut', 'titan', ...(this.coop ? ['trooper'] : [])];
    const props = ['prop_fungus', 'prop_spire', 'prop_eggs', 'prop_rock', 'prop_arch', 'prop_pod', 'prop_crystal', 'prop_wreck', 'prop_beacon', 'prop_rifle'];
    const all = [...units.map(u => ({ key: u, url: `${BASE}models/${u}.glb` })), ...props.map(p => ({ key: p, url: `${BASE}env/${p}.glb` }))];
    let done = 0;
    await Promise.all(all.map(async a => { this.models.set(a.key, await this.load(a.url)); onProgress(++done / (all.length + 6)); }));
    const texNames = ['tex_creep', 'tex_rock', 'tex_mire', 'tex_bone', 'sky', 'planet'];
    const tl = new THREE.TextureLoader();
    this.tex = {};
    await Promise.all(texNames.map(n => new Promise<void>(res => tl.load(`${BASE}env/${n}.webp${q}`, t => { t.colorSpace = THREE.SRGBColorSpace; this.tex[n] = t; onProgress(++done / (all.length + 6)); res(); }, undefined, () => { onProgress(++done / (all.length + 6)); res(); }))));
    this.build();
  }
  private tex: Record<string, THREE.Texture> = {};

  // ================================================================ world
  heightAt(x: number, z: number) {
    const n = this.noise;
    let h = n(x * 0.012, z * 0.012) * 9 + n(x * 0.04, z * 0.04) * 2.5 + n(x * 0.12, z * 0.12) * 0.5;
    const d = Math.hypot(x, z);
    h *= Math.min(1, d / 40);                       // flatter drop zone
    if (d > WORLD - 25) h += (d - (WORLD - 25)) * 0.9; // crater rim around the arena
    return h;
  }
  private biomeTex(): [string, string] {
    return this.mission.biome === 'mire' ? ['tex_mire', 'tex_creep'] : this.mission.biome === 'bone' ? ['tex_bone', 'tex_rock'] : ['tex_rock', 'tex_creep'];
  }

  private build() {
    const m = this.mission, s = this.scene;
    const fogCol = m.biome === 'mire' ? 0x2a3a2a : m.biome === 'bone' ? 0x3a2a36 : 0x2c2238;
    s.fog = new THREE.FogExp2(fogCol, 0.0085);
    s.background = new THREE.Color(fogCol);
    // sky dome
    const sky = this.tex.sky;
    if (sky) { sky.wrapS = THREE.MirroredRepeatWrapping; sky.repeat.set(2, 1); }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshBasicMaterial({ map: sky ?? null, color: sky ? 0xffffff : 0x3a2850, side: THREE.BackSide, fog: false }));
    dome.position.y = -120;
    s.add(dome);
    // lights
    s.add(new THREE.HemisphereLight(0xb89cff, 0x302030, 0.9));
    this.sun = new THREE.DirectionalLight(0xffd9b0, 2.4);
    this.sun.position.set(80, 140, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 400 });
    s.add(this.sun); s.add(this.sun.target);
    for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffa040, 0, 10); l.userData.pooled = true; s.add(l); this.lights.push(l); }
    // terrain with two blended ground textures (splat by noise; creep around Kyrrh structures)
    const size = WORLD * 2 + 40, seg = 220;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const P = geo.attributes.position as THREE.BufferAttribute;
    const splat = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i);
      P.setY(i, this.heightAt(x, z));
      splat[i] = THREE.MathUtils.smoothstep(this.noise(x * 0.02 + 40, z * 0.02 - 17), -0.1, 0.25);
    }
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 1));
    geo.computeVertexNormals();
    const [ta, tb] = this.biomeTex();
    const mk = (t?: THREE.Texture) => { if (t) { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.repeat.set(size / 9, size / 9); t.anisotropy = 8; } return t ?? null; };
    const mapA = mk(this.tex[ta]), mapB = mk(this.tex[tb]?.clone());
    if (mapB) mapB.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: mapA, color: mapA ? 0xffffff : 0x4a3a52, roughness: 0.92, metalness: 0.02 });
    if (mapB) {
      mat.onBeforeCompile = sh => {
        sh.uniforms.mapB = { value: mapB };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float splat;\nvarying float vSplat;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSplat = splat;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D mapB;\nvarying float vSplat;')
          .replace('#include <map_fragment>', `#ifdef USE_MAP
            vec4 cA = texture2D( map, vMapUv );
            vec4 cB = texture2D( mapB, vMapUv * 0.73 );
            diffuseColor *= mix( cA, cB, vSplat );
          #endif`);
      };
    }
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    s.add(this.terrain);
    // props
    const rnd = mulberry(this.seed * 31 + 3);
    const propList = m.biome === 'mire' ? ['prop_fungus', 'prop_pod', 'prop_eggs', 'prop_rock', 'prop_spire'] : m.biome === 'bone' ? ['prop_arch', 'prop_spire', 'prop_rock', 'prop_crystal', 'prop_eggs'] : ['prop_rock', 'prop_crystal', 'prop_fungus', 'prop_spire', 'prop_pod'];
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, d = 28 + rnd() * (WORLD - 40);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const id = propList[Math.floor(rnd() * propList.length)];
      const big = id === 'prop_arch' || id === 'prop_spire' || id === 'prop_fungus';
      const scale = (big ? 9 : 4.5) * (0.7 + rnd() * 0.7);
      this.addProp(id, x, z, scale, rnd() * Math.PI * 2);
    }
    // wreck of Dropship Four at the landing zone
    this.addProp('prop_wreck', 9, -6, 11, 0.6);
    // Kyrrh structures
    const placed: { x: number; z: number }[] = [];
    for (const [id, n] of (this.role === 'guest' ? [] : m.structures)) for (let i = 0; i < n; i++) {
      let x = 0, z = 0;
      for (let tries = 0; tries < 50; tries++) {
        const a = rnd() * Math.PI * 2, d = id === 'thorn' ? 45 + rnd() * 50 : 90 + rnd() * 60;
        x = Math.cos(a) * d; z = Math.sin(a) * d;
        if (placed.every(p => Math.hypot(p.x - x, p.z - z) > 30)) break;
      }
      placed.push({ x, z });
      this.spawn(id, new THREE.Vector3(x, this.heightAt(x, z), z));
      if (id !== 'thorn') this.creep.push({ x, z, r: 28 });
    }
    // creep decals
    for (const c of this.creep) this.addCreep(c.x, c.z, c.r);
    if (this.coop) this.buildAlly();
    // first-person gun
    this.buildGun();
    this.camera.add(this.gunGroup());
    s.add(this.camera);
    this.pos.set(0, this.heightAt(0, 0), 0);
    this.waveNext = m.waves.map(w => w.from); this.waveN = m.waves.map(() => 0);
  }

  private addCreep(x: number, z: number, r: number) {
    const t = this.tex.tex_creep?.clone();
    if (t) { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.repeat.set(r / 4.5, r / 4.5); t.needsUpdate = true; }
    const ring = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshStandardMaterial({ map: t ?? null, color: 0xc070c0, transparent: true, opacity: 0.85, roughness: 0.6, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, this.heightAt(x, z) + 0.15, z); ring.receiveShadow = true;
    this.scene.add(ring);
  }

  // ================================================================ co-op: the partner's avatar
  private buildAlly() {
    const obj = new THREE.Group();
    const bodies: Ally['bodies'] = {};
    for (const [mode, id, height] of [['foot', 'trooper', 1.95], ['juggernaut', 'juggernaut', 4.2], ['titan', 'titan', 9]] as [Mode, string, number][]) {
      const src = this.models.get(id);
      let o: THREE.Object3D, mixer: THREE.AnimationMixer | null = null, walk, idle;
      if (src) {
        o = skClone(src.scene);
        const hb = new THREE.Box3().setFromObject(o);
        o.scale.setScalar(height / Math.max(0.1, hb.max.y - hb.min.y));   // sized to the player's eye height, not the RTS scale
        o.traverse(x => { const mm = x as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; mm.frustumCulled = false; tuneMat(mm.material as THREE.MeshStandardMaterial); } });
        if (src.clips.length) {
          mixer = new THREE.AnimationMixer(o);
          const w = src.clips.find(c => c.name === 'Walk'), i = src.clips.find(c => c.name === 'Idle');
          walk = w ? mixer.clipAction(w) : undefined; idle = i ? mixer.clipAction(i) : undefined;
          idle?.play(); walk?.play(); if (walk) walk.weight = 0;
        }
      } else o = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.2, 4, 8), new THREE.MeshStandardMaterial({ color: 0xff9a3a }));
      o.visible = mode === 'foot';
      obj.add(o); bodies[mode] = { o, mixer, walk, idle };
    }
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex(this.coop!.allyName), depthTest: false, transparent: true }));
    tag.scale.set(4, 1, 1); tag.renderOrder = 20; obj.add(tag);
    obj.visible = false;
    this.scene.add(obj);
    this.ally = { name: this.coop!.allyName, pos: new THREE.Vector3(3, 0, 3), target: new THREE.Vector3(3, 0, 3), yaw: 0, pitch: 0, mode: 'foot', hp: 1, maxHp: 1,
      down: false, firing: false, weapon: 'rifle', obj, bodies, tag, lastFx: 0, lastMsg: 0 };
  }
  private updateAlly(dt: number) {
    const a = this.ally; if (!a) return;
    a.obj.visible = a.lastMsg > 0 && !a.down;
    const k = 1 - Math.exp(-dt * 12);
    const moving = a.pos.distanceTo(a.target) > 0.05;
    a.pos.lerp(a.target, k);
    a.pos.y = this.heightAt(a.pos.x, a.pos.z);
    a.obj.position.copy(a.pos);
    a.obj.rotation.y = a.yaw + Math.PI / 2;
    for (const [mode, b] of Object.entries(a.bodies)) {
      if (!b) continue;
      b.o.visible = mode === a.mode;
      if (b.walk && b.idle) { b.walk.weight += ((moving ? 1 : 0) - b.walk.weight) * Math.min(1, dt * 6); b.idle.weight = 1 - b.walk.weight; }
      if (b.o.visible) b.mixer?.update(dt);
    }
    a.tag.position.y = VEHICLE[a.mode].eye + 1.4;
    // the partner's gunfire: tracers + sound, so you can see them fighting
    if (a.firing && !a.down && this.elapsed - a.lastFx > (a.mode === 'foot' ? 0.1 : 0.5)) {
      a.lastFx = this.elapsed;
      const eye = a.pos.clone(); eye.y += VEHICLE[a.mode].eye;
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(a.pitch, a.yaw, 0, 'YXZ'));
      const from = eye.clone().add(dir.clone().multiplyScalar(1.2)).add(new THREE.Vector3(0, -0.3, 0));
      this.tracer(from, eye.clone().add(dir.multiplyScalar(60)), a.mode === 'foot' ? 0xffe07a : 0xffc060);
      audio.weapon(a.mode === 'foot' ? 'bullet' : 'artillery', 'directorate', 'trooper', a.pos.x / M, a.pos.z / M);
    }
  }
  /** Players the Kyrrh can target: me and (in co-op) my partner. */
  private targets(): { pos: THREE.Vector3; mode: Mode; ally: boolean }[] {
    const t: { pos: THREE.Vector3; mode: Mode; ally: boolean }[] = [];
    if (this.hp > 0 && this.downT <= 0) t.push({ pos: this.pos, mode: this.mode, ally: false });
    const a = this.ally;
    if (a && a.lastMsg > 0 && !a.down && this.elapsed - a.lastMsg < 5) t.push({ pos: a.pos, mode: a.mode, ally: true });
    return t;
  }
  private hurtAlly(dmg: number, bonus: number, hits: number, src: string) { this.coop?.send({ t: 'hurt', dmg, bonus, hits, src }); }

  // ================================================================ co-op: network messages
  onNet(m: any) {
    if (m.t === 'p') {                                 // partner state
      const a = this.ally; if (!a) return;
      a.target.set(m.x, m.y, m.z); if (!a.lastMsg) a.pos.copy(a.target);
      a.yaw = m.yaw; a.pitch = m.pitch; a.mode = m.mode; a.hp = m.hp; a.maxHp = m.maxHp; a.down = !!m.down; a.firing = !!m.f; a.weapon = m.w;
      a.lastMsg = this.elapsed || 0.001;
      return;
    }
    if (this.role === 'host') {
      if (m.t === 'hits') for (const [id, dmg, bonus, hits] of m.h as [number, number, number, number][]) { const e = this.byId.get(id); if (e) this.hurtEnemy(e, dmg, bonus, hits, true); }
      else if (m.t === 'splash') this.splashAt(new THREE.Vector3(m.x, m.y, m.z), m.r, m.dmg, m.bonus, false, !!m.heavy, true);
      else if (m.t === 'lance') this.lanceStrike(new THREE.Vector3(m.x, m.y, m.z), true);
      else if (m.t === 'board') {
        const pk = this.pickups.find(x => x.id === m.id);
        if (pk) { this.removePod(pk); this.coop!.send({ t: 'podGone', id: pk.id, to: 'guest', hp: pk.hp, mode: pk.mode }); }
      } else if (m.t === 'drop') this.dropPod(m.mode, new THREE.Vector3(m.x, 0, m.z), m.hp);
      else if (m.t === 'ready') { for (const pk of this.pickups) this.coop!.send({ t: 'pod', id: pk.id, mode: pk.mode, x: pk.pos.x, z: pk.pos.z, hp: pk.hp }); }
      return;
    }
    // ---- guest: the host is authoritative for the Kyrrh, the pods and the mission
    if (m.t === 's') {
      if (Math.abs(m.el - this.elapsed) > 0.5) this.elapsed = m.el;
      for (const r of m.e as any[]) {
        const [id, kid, x, y, z, ry, hp, anim] = r;
        let e = this.byId.get(id);
        if (!e) {
          e = this.spawn(kid, new THREE.Vector3(x, y, z), id);
          e.pos.set(x, y, z);
          if ((kid === 'nest' || kid === 'throne') && !this.seenCreep.has(id)) { this.seenCreep.add(id); this.creep.push({ x, z, r: 28 }); this.addCreep(x, z, 28); }
        }
        if (!e.alive) continue;
        e.net = (e.net ?? new THREE.Vector3()).set(x, y, z); e.netRy = ry; e.netAnim = anim;
        if (hp < e.hp) e.flash = 0.12;
        e.hp = hp;
      }
    } else if (m.t === 'die') { const e = this.byId.get(m.id); if (e && e.alive) this.killEnemy(e); }
    else if (m.t === 'm') {
      this.kills = new Map(m.kills); this.objDone = new Set(m.od);
    } else if (m.t === 'hurt') this.hurtPlayer(m.dmg, m.bonus, m.hits, m.src);
    else if (m.t === 'es') this.shoot(new THREE.Vector3(...(m.f as [number, number, number])), new THREE.Vector3(...(m.v as [number, number, number])).normalize(), Math.hypot(...(m.v as [number, number, number])), { dmg: 0, enemy: true, color: m.c, splash: m.s, grav: m.g, life: m.l, kind: 'ghost' });
    else if (m.t === 'pod') { if (!this.pickups.some(x => x.id === m.id)) this.dropPod(m.mode, new THREE.Vector3(m.x, 0, m.z), m.hp, m.id); }
    else if (m.t === 'podGone') {
      const pk = this.pickups.find(x => x.id === m.id); if (pk) this.removePod(pk);
      if (m.to === 'guest' && this.pendingBoard === m.id) { this.pendingBoard = -1; this.enterMech(m.mode, m.hp); }
    } else if (m.t === 'msg') this.message(m.text, m.kind);
    else if (m.t === 'end') { if (!this.over) { this.over = true; this.result = m.win ? 'win' : 'lose'; this.hooks.end(!!m.win, m.text); } }
  }

  /** Host: stream the world to the guest. Everyone: stream my own avatar. */
  private netTick(dt: number) {
    const c = this.coop; if (!c) return;
    const relay = !c.direct();
    this.stateT -= dt;
    if (this.stateT <= 0) {
      this.stateT = relay ? 0.1 : 0.05;
      c.send({ t: 'p', x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2), yaw: +this.yaw.toFixed(3), pitch: +this.pitch.toFixed(3),
        mode: this.mode, hp: Math.max(0, Math.round(this.hp)), maxHp: this.maxHp(this.mode), down: this.downT > 0, f: this.mouseDown && !this.over, w: this.weapon }, false);
    }
    if (c.role !== 'host') {
      this.netT -= dt;
      if (this.netT <= 0 && this.hitQ.length) { this.netT = relay ? 0.15 : 0.08; c.send({ t: 'hits', h: this.hitQ.splice(0) }); }
      return;
    }
    this.netT -= dt;
    if (this.netT <= 0) {
      this.netT = relay ? 0.12 : 0.066;
      const e = this.enemies.filter(x => x.alive).map(x => [x.id, x.k.id, +x.pos.x.toFixed(2), +x.pos.y.toFixed(2), +x.pos.z.toFixed(2), +x.obj.rotation.y.toFixed(2), Math.ceil(x.hp), x.cur === 'Attack' ? 2 : x.vel.length() > 0.6 ? 1 : 0]);
      c.send({ t: 's', el: +this.elapsed.toFixed(2), e }, false);
    }
    this.metaT -= dt;
    if (this.metaT <= 0) { this.metaT = 0.5; c.send({ t: 'm', kills: [...this.kills], od: [...this.objDone] }); }
  }

  private addProp(id: string, x: number, z: number, scale: number, rot: number) {
    const src = this.models.get(id);
    let obj: THREE.Object3D;
    if (src) {
      obj = src.scene.clone(true);
      fitObject(obj, scale);
      obj.traverse(o => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; mm.receiveShadow = true; tuneMat(mm.material as THREE.MeshStandardMaterial); } });
    } else {
      obj = new THREE.Mesh(new THREE.IcosahedronGeometry(scale * 0.4, 1), new THREE.MeshStandardMaterial({ color: 0x5a3a60, roughness: 0.8 }));
      obj.position.y = scale * 0.2; (obj as THREE.Mesh).castShadow = true;
    }
    const g = new THREE.Group(); g.add(obj);
    g.position.set(x, this.heightAt(x, z) - 0.2, z); g.rotation.y = rot;
    this.scene.add(g);
    if (id !== 'prop_pod' && id !== 'prop_eggs') this.colliders.push({ x, z, r: scale * (id === 'prop_arch' ? 0.18 : 0.32) });
  }

  private buildGun() {
    this.gun = new THREE.Group();
    const src = this.models.get('prop_rifle');
    if (src) {
      const r = src.scene.clone(true);
      fitObject(r, 0.62);
      r.rotation.y = -Math.PI / 2 + 0.06;   // muzzle forward (-Z), angled slightly toward the crosshair
      r.position.y -= 0.12;
      r.traverse(o => { const mm = o as THREE.Mesh; if (mm.isMesh) tuneMat(mm.material as THREE.MeshStandardMaterial); });
      this.gun.add(r);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.7), new THREE.MeshStandardMaterial({ color: 0x3a4148, metalness: 0.8, roughness: 0.35 }));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x1c1f22, metalness: 0.9, roughness: 0.3 }));
      barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.5;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.03, 0.3), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0x442200 }));
      stripe.position.set(0, 0.06, 0.05);
      this.gun.add(body, barrel, stripe);
    }
    this.gun.position.set(0.3, -0.3, -0.62);
    // mech cockpit frame
    this.cockpit = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a3036, metalness: 0.85, roughness: 0.4 });
    const bar = (w: number, h: number, x: number, y: number, rz = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameMat); b.position.set(x, y, -0.6); b.rotation.z = rz; this.cockpit!.add(b); };
    bar(2.2, 0.16, 0, -0.52); bar(2.2, 0.1, 0, 0.5); bar(0.12, 1.2, -0.9, 0, 0.25); bar(0.12, 1.2, 0.9, 0, -0.25);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    glow.position.set(0, -0.43, -0.58); this.cockpit.add(glow);
    this.cockpit.visible = false;
  }
  private gunGroup() { const g = new THREE.Group(); g.add(this.gun!, this.cockpit!); return g; }

  // ================================================================ enemies
  spawn(id: string, at: THREE.Vector3, netId?: number): Enemy {
    const k = kind(id);
    const src = this.models.get(id);
    let obj: THREE.Object3D, mixer: THREE.AnimationMixer | null = null;
    const acts: Record<string, THREE.AnimationAction> = {};
    if (src) {
      obj = skClone(src.scene);
      obj.scale.setScalar(k.scale);
      obj.traverse(o => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; mm.frustumCulled = false; tuneMat(mm.material as THREE.MeshStandardMaterial); } });
      if (src.clips.length) {
        mixer = new THREE.AnimationMixer(obj);
        for (const c of src.clips) acts[c.name] = mixer.clipAction(c);
      }
    } else {
      obj = new THREE.Mesh(new THREE.SphereGeometry(k.radius, 16, 12), new THREE.MeshStandardMaterial({ color: 0x8a3a80 }));
    }
    const g = new THREE.Group(); g.add(obj); this.scene.add(g);
    const e: Enemy = { id: netId ?? this.nextId++, k, obj: g, mixer, acts, hp: k.hp, pos: at.clone(), vel: new THREE.Vector3(), cd: Math.random() * k.cd, spawnT: (k.spawnEvery ?? 0) * Math.random(), lastHit: -99, alive: true, dying: 0, cur: '', flash: 0, stun: 0 };
    e.pos.y = this.heightAt(at.x, at.z) + k.air;
    g.position.copy(e.pos);
    this.play(e, 'Idle');
    this.enemies.push(e); this.byId.set(e.id, e);
    return e;
  }
  private play(e: Enemy, name: string) {
    if (e.cur === name || !e.mixer) return;
    const next = e.acts[name] ?? e.acts.Idle;
    if (!next) return;
    const prev = e.acts[e.cur];
    next.reset().setLoop(name === 'Attack' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.15, false);
    e.cur = name;
  }

  /** Damage with RTS rules: bonus vs armored, minus armor, minimum 0.5. */
  private hurtEnemy(e: Enemy, dmg: number, bonus: number, hits = 1, fromAlly = false) {
    if (!e.alive) return;
    if (this.role === 'guest') {
      // the host owns the Kyrrh: report the hit, show the feedback locally
      this.hitQ.push([e.id, +dmg.toFixed(1), +bonus.toFixed(1), hits]);   // batched, flushed ~10x/s
      e.flash = 0.12; this.hitmark = 0.15;
      return;
    }
    let total = 0;
    for (let i = 0; i < hits; i++) total += Math.max(0.5, dmg + (e.k.armored ? bonus : 0) - e.k.armor);
    e.hp -= total; e.lastHit = this.elapsed; e.flash = 0.12;
    if (!fromAlly) this.hitmark = 0.15;
    if (e.hp <= 0) this.killEnemy(e);
  }
  private killEnemy(e: Enemy) {
    e.alive = false; e.dying = 1.2;
    if (this.role === 'host') this.coop!.send({ t: 'die', id: e.id });
    this.kills.set(e.k.id, (this.kills.get(e.k.id) ?? 0) + 1);
    this.burst(e.pos.clone().add(new THREE.Vector3(0, 1 + e.k.air * 0.2, 0)), e.k.structure ? 0x9dff5a : 0xd060c0, e.k.structure ? 60 : 24, e.k.structure ? 14 : 5);
    audio.death('kyrrh', e.k.radius / M, !!e.k.structure, this.pos.x / M + (e.pos.x - this.pos.x) / M, this.pos.z / M + (e.pos.z - this.pos.z) / M);
    if (e.k.structure) this.message(`${DEFS[e.k.id].name} destroyed`);
  }
  dmgLog: Record<string, number> = {};
  private hurtPlayer(dmg: number, bonus: number, hits = 1, src = '?') {
    if (this.downT > 0 || this.over) return;
    const v = VEHICLE[this.mode];
    let total = 0;
    for (let i = 0; i < hits; i++) total += Math.max(0.5, dmg + (v.armored ? bonus : 0) - v.armor);
    total *= this.D.dmg;
    this.hp -= total; this.lastHurt = this.elapsed;
    this.dmgLog[src] = (this.dmgLog[src] ?? 0) + total;
    this.hurt = Math.min(1, this.hurt + total / 40);
    if (this.hp <= 0) {
      if (this.mode !== 'foot') {
        this.message(`${this.mode === 'titan' ? 'Titan' : 'Juggernaut'} destroyed! Ejecting!`, 'warn');
        this.burst(this.pos.clone().add(new THREE.Vector3(0, 3, 0)), 0xffb347, 60, 12);
        this.mode = 'foot'; this.hp = Math.max(40, this.footHp); this.anchored = false;
      } else if (this.coop) {
        if (this.downT <= 0) { this.downT = 10; this.hp = 0; this.mouseDown = false; this.message(`You are down! ${this.coop.allyName} has to hold on. Redeploying in 10 s`, 'warn'); }
      } else if (!this.over) { this.over = true; this.result = 'lose'; this.hooks.end(false, 'Ember-One is down. The swarm overruns the drop zone.'); }
    }
  }

  // ================================================================ effects + projectiles
  private burst(at: THREE.Vector3, color: number, n: number, size: number, light = true) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), vel: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) { pos.set([at.x, at.y, at.z], i * 3); vel.push(new THREE.Vector3((Math.random() - 0.5) * size, Math.random() * size * 0.8, (Math.random() - 0.5) * size)); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.5 + size * 0.05, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.userData.vel = vel;
    this.scene.add(pts);
    this.fx.push({ mesh: pts, t: 0, life: 0.9, grow: 0, fade: true });
    if (!light) return;
    // pooled lights: adding/removing lights makes three.js recompile every material (a visible hitch)
    const fl = this.lights[this.lightNext++ % this.lights.length];
    if (!fl) return;
    fl.color.setHex(color); fl.distance = size * 3; fl.position.copy(at); fl.intensity = 40;
    this.fx.push({ mesh: fl, t: 0, life: 0.2, grow: 0, fade: true });
  }
  private shoot(from: THREE.Vector3, dir: THREE.Vector3, speed: number, o: Partial<Shot> & { dmg: number; enemy: boolean }) {
    const color = o.color ?? (o.enemy ? 0x9dff5a : 0xffd27a);
    if (o.enemy && this.role === 'host') {
      const v = dir.clone().multiplyScalar(speed);
      this.coop!.send({ t: 'es', f: [from.x, from.y, from.z].map(n => +n.toFixed(2)), v: [v.x, v.y, v.z].map(n => +n.toFixed(2)), c: color, s: o.splash ?? 0, g: o.grav ?? 0, l: o.life ?? 3 }, false);
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(o.splash ? 0.2 : 0.12, 8, 6), new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.shots.push({ pos: from.clone(), vel: dir.clone().multiplyScalar(speed), mesh, dmg: o.dmg, bonus: o.bonus ?? 0, splash: o.splash ?? 0, enemy: o.enemy, life: o.life ?? 3, grav: o.grav ?? 0, hitsAir: o.hitsAir ?? true, color, kind: o.kind ?? '' });
  }
  private tracer(a: THREE.Vector3, b: THREE.Vector3, color = 0xffe07a) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    this.scene.add(l);
    this.fx.push({ mesh: l, t: 0, life: 0.06, grow: 0, fade: true });
  }
  private splashAt(p: THREE.Vector3, radius: number, dmg: number, bonus: number, byEnemy: boolean, heavy = false, fromAlly = false) {
    if (!byEnemy && !fromAlly && this.role === 'guest') this.coop!.send({ t: 'splash', x: p.x, y: p.y, z: p.z, r: radius, dmg, bonus, heavy });
    this.burst(p, byEnemy ? 0x9dff5a : 0xffa040, heavy ? 70 : 30, radius * (heavy ? 2 : 1.4));
    if (byEnemy) {
      if (this.role === 'guest') return;   // the host tells us if a blast reached us
      if (p.distanceTo(this.eye()) < radius + VEHICLE[this.mode].radius + 1) this.hurtPlayer(dmg, bonus, 1, 'splash');
      const a = this.ally; if (a && !a.down && p.distanceTo(a.pos) < radius + VEHICLE[a.mode].radius + 2) this.hurtAlly(dmg, bonus, 1, 'splash');
      return;
    }
    if (heavy) {
      // fireball + shockwave ring + screen shake, and a proper boom
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      ball.position.copy(p); this.scene.add(ball);
      this.fx.push({ mesh: ball, t: 0, life: 0.35, grow: radius * 0.9, fade: true });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, this.heightAt(p.x, p.z) + 0.3, p.z); this.scene.add(ring);
      this.fx.push({ mesh: ring, t: 0, life: 0.45, grow: radius * 1.6, fade: true });
      this.shake = Math.max(this.shake, 0.35 * Math.max(0, 1 - p.distanceTo(this.pos) / 35));
      if (this.role === 'guest') { /* damage is applied by the host */ }
      audio.weapon('artillery', 'directorate', 'grenade', p.x / M, p.z / M);
    }
    if (this.role === 'guest') return;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.max(0, e.pos.distanceTo(p) - e.k.radius);
      if (d >= radius) continue;
      // full damage in the inner 60%, falling to half at the edge
      const f = d < radius * 0.6 ? 1 : 1 - 0.5 * (d - radius * 0.6) / (radius * 0.4);
      this.hurtEnemy(e, dmg * f, bonus * f, 1, fromAlly);
      if (heavy && !e.k.structure && !e.k.massive) {
        const push = new THREE.Vector3(e.pos.x - p.x, 0, e.pos.z - p.z);
        if (push.lengthSq() < 0.01) push.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        e.vel.add(push.normalize().multiplyScalar(GRENADE.knock * (1 - d / radius)));
        e.stun = Math.max(e.stun, GRENADE.stun);
      }
    }
  }
  private flashMuzzle() {
    if (!this.muzzle) {
      this.muzzle = new THREE.PointLight(0xffc36a, 0, 9); this.muzzle.position.set(0.28, -0.2, -1.0); this.camera.add(this.muzzle);
      this.muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex(), color: 0xffd08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      this.muzzleFlash.position.set(0.28, -0.22, -1.02); this.muzzleFlash.renderOrder = 10; this.camera.add(this.muzzleFlash);
    }
    this.muzzle.intensity = 6;
    this.muzzleFlash!.visible = true; this.muzzleFlash!.scale.setScalar(0.18 + Math.random() * 0.1); this.muzzleFlash!.material.rotation = Math.random() * 6.28;
  }

  // ================================================================ input
  private on<K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, target: EventTarget = window) {
    target.addEventListener(type, fn as EventListener);
    this.handlers.push([type, fn as EventListener]);
  }
  private bind() {
    this.on('keydown', e => {
      this.keys.add(e.code);
      if (this.over) return;
      if (e.code === 'Digit1') this.weapon = 'rifle';
      if (e.code === 'Digit2') this.weapon = 'grenade';
      if (e.code === 'KeyQ') this.useOverdrive();
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyF') this.toggleAnchor();
      if (e.code === 'KeyR') { if (this.mission.lance) this.callLance(); else if (this.mode === 'foot' && this.ammo < RIFLE.mag && this.reload <= 0) this.reload = RIFLE.reload; }
    });
    this.on('keyup', e => this.keys.delete(e.code));
    this.on('mousemove', e => {
      if (document.pointerLockElement !== this.canvas || this.paused) return;
      this.yaw -= e.movementX * 0.0022; this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.35, 1.35);
    });
    this.on('mousedown', e => { if (e.button !== 0 || e.target !== this.canvas || this.over || this.paused) return; this.mouseDown = true; if (document.pointerLockElement !== this.canvas) lockPointer(this.canvas); });
    this.on('mouseup', e => { if (e.button === 0) this.mouseDown = false; });
    this.on('resize', () => this.resize());
  }
  private useOverdrive() {
    // RTS Overdrive: costs 10 health, +50% attack and movement speed for 11 seconds (Trooper on foot)
    if (this.mode !== 'foot' || this.overdrive > 0.5 || this.hp <= 10) return;
    this.hp -= 10; this.overdrive = 11;
    audio.ability('overdrive', 0, 0);
    this.message('OVERDRIVE');
  }
  toggleAnchor() {
    if (this.mode !== 'juggernaut' || this.anchorT > 0) return;
    this.anchorT = SIEGE.transition;
    audio.ability(this.anchored ? 'unsiege' : 'siege', 0, 0);
  }
  interact() {
    if (this.mode !== 'foot') {
      // leave the mech where it stands
      const mode = this.mode;
      const at = this.pos.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 3, 0, Math.cos(this.yaw) * 3));
      if (this.role === 'guest') this.coop!.send({ t: 'drop', mode, x: at.x, z: at.z, hp: this.hp });
      else this.dropPod(mode, at, this.hp);
      this.mode = 'foot'; this.hp = this.footHp; this.anchored = false; this.anchorT = 0;
      return;
    }
    const p = this.pickups.find(pk => pk.pos.distanceTo(this.pos) < 6);
    if (!p) return;
    if (this.role === 'guest') { this.pendingBoard = p.id; this.coop!.send({ t: 'board', id: p.id }); return; }   // host arbitrates
    this.removePod(p);
    if (this.role === 'host') this.coop!.send({ t: 'podGone', id: p.id });
    this.enterMech(p.mode, p.hp);
  }
  private enterMech(mode: Mode, hp: number) {
    this.footHp = this.hp;
    this.mode = mode; this.hp = hp;
    this.message(mode === 'titan' ? 'TITAN ONLINE' : 'JUGGERNAUT ONLINE');
    audio.ui('confirm');
  }
  private removePod(p: Pickup) { this.scene.remove(p.mesh); this.pickups = this.pickups.filter(x => x !== p); }
  private dropPod(mode: Mode, at: THREE.Vector3, hp?: number, netId?: number) {
    const src = this.models.get(mode);
    const g = new THREE.Group();
    if (src) {
      const o = skClone(src.scene); o.scale.setScalar(M * (mode === 'titan' ? 1.4 : 1.15)); g.add(o);
      o.traverse(x => { const mm = x as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; tuneMat(mm.material as THREE.MeshStandardMaterial); } });
    } else g.add(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: 0x8795a3 })));
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    beacon.position.y = 30; g.add(beacon);
    at.y = this.heightAt(at.x, at.z);
    g.position.copy(at);
    this.scene.add(g);
    const pk: Pickup = { id: netId ?? this.podId++, pos: at.clone(), mesh: g, mode, hp: hp ?? this.maxHp(mode) };
    this.pickups.push(pk);
    if (this.role === 'host') this.coop!.send({ t: 'pod', id: pk.id, mode, x: at.x, z: at.z, hp: pk.hp });
  }
  callLance() {
    // Dreadnought Solar Lance: 2s channel, then 240 damage. Cooldown 71s (RTS values).
    if (this.lanceCd > 0 || this.lanceCharge > 0) return;
    const hit = this.aimPoint();
    this.lanceTarget = hit.point;
    this.lanceCharge = 2;
    audio.ability('lanceCharge', 0, 0);
    this.message('SOLAR LANCE CHARGING');
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 400, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.copy(hit.point).add(new THREE.Vector3(0, 200, 0));
    this.scene.add(beam); this.lanceBeam = beam;
  }

  /** Solar Lance impact: 240 damage to the nearest enemy at the point (host applies it, the guest reports it). */
  private lanceStrike(t: THREE.Vector3, fromAlly: boolean) {
    if (this.role === 'guest') this.coop!.send({ t: 'lance', x: t.x, y: t.y, z: t.z });
    else {
      const e = this.enemies.filter(x => x.alive).sort((a, b) => a.pos.distanceTo(t) - b.pos.distanceTo(t))[0];
      if (e && e.pos.distanceTo(t) < e.k.radius + 6) this.hurtEnemy(e, 240, 0, 1, fromAlly);
    }
    this.burst(t, 0xfff1a0, 90, 16);
    audio.ability('solarlance', t.x / M, t.z / M);
  }

  // ================================================================ aiming
  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + VEHICLE[this.mode].eye, this.pos.z); }
  private aimDir() { return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')); }
  private aimPoint(dir?: THREE.Vector3): { point: THREE.Vector3; enemy: Enemy | null } {
    const o = this.eye(), d = dir ?? this.aimDir();
    let best: Enemy | null = null, bt = 400;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const c = e.pos.clone(); c.y += e.k.structure ? e.k.radius * 0.8 : e.k.radius * 0.9;
      const oc = c.sub(o); const t = oc.dot(d);
      if (t < 0 || t > bt) continue;
      const dist2 = oc.lengthSq() - t * t;
      if (dist2 < e.k.radius * e.k.radius * 1.1) { bt = t; best = e; }
    }
    if (best) return { point: o.clone().add(d.clone().multiplyScalar(bt)), enemy: best };
    for (let t = 1; t < 300; t += 1.5) { const p = o.clone().add(d.clone().multiplyScalar(t)); if (p.y < this.heightAt(p.x, p.z)) return { point: p, enemy: null }; }
    return { point: o.clone().add(d.multiplyScalar(300)), enemy: null };
  }

  private fire(dt: number) {
    this.fireCd -= dt;
    if (!this.mouseDown || (document.pointerLockElement !== this.canvas && !this.testAuto)) { this.fireCd = Math.max(0, this.fireCd); return; }
    // cooldowns accumulate, so the rate of fire doesn't depend on the framerate (up to 4 shots in a slow frame)
    for (let n = 0; n < 4 && this.fireCd <= 0; n++) {
      const before = this.fireCd;
      this.fireOnce();
      if (this.fireCd === before) break;   // couldn't fire (reloading, transforming...)
    }
  }
  private fireOnce() {
    const o = this.eye(), d = this.aimDir();
    const muzzle = o.clone().add(d.clone().multiplyScalar(1.2)).add(new THREE.Vector3(0, -0.2, 0));
    if (this.mode === 'foot') {
      if (this.weapon === 'rifle') {
        if (this.reload > 0) return;
        if (this.ammo <= 0) { this.reload = RIFLE.reload; return; }
        this.ammo--;
        if (this.ammo === 0) this.reload = RIFLE.reload;   // auto-reload on an empty magazine
        const w = DEFS.trooper.weapon!;
        // fully automatic: ~12 rounds/s while the trigger is held; accuracy blooms during long bursts
        this.fireCd += RIFLE.interval / (this.overdrive > 0 ? 1.5 : 1);
        const cone = RIFLE.spread + this.bloom;
        const dir = d.clone().add(new THREE.Vector3((Math.random() - 0.5) * cone, (Math.random() - 0.5) * cone, (Math.random() - 0.5) * cone)).normalize();
        this.bloom = Math.min(RIFLE.bloom, this.bloom + 0.0025);
        const aim = this.aimPoint(dir);
        this.tracer(this.camera.localToWorld(new THREE.Vector3(0.28, -0.22, -1.0)), aim.point);
        if (aim.enemy) this.hurtEnemy(aim.enemy, w.damage + up('trooper'), 0, 1);
        else this.burst(aim.point, 0xffd27a, 4, 1.5, false);
        audio.weapon('bullet', 'directorate', 'trooper', undefined as any, undefined as any);
        this.kick = Math.min(0.06, this.kick + 0.018);
        this.pitch = Math.min(1.35, this.pitch + 0.0012);   // gentle muzzle climb
        this.flashMuzzle();
      } else {
        this.fireCd += GRENADE.cd / (this.overdrive > 0 ? 1.5 : 1);
        // the launcher's sight solves the arc: the grenade lands on whatever is under the crosshair (max 60 m)
        const aim = this.aimPoint();
        const to = aim.point.clone().sub(muzzle);
        if (to.length() > 60) to.setLength(60);
        this.lob(muzzle, muzzle.clone().add(to), Math.max(0.15, to.length() / 32), { dmg: GRENADE.damage, bonus: GRENADE.bonus, splash: GRENADE.radius, enemy: false, color: 0xffb347, kind: 'grenade' });
        audio.weapon('shell', 'directorate', 'breacher', undefined as any, undefined as any);
        this.kick = 0.12;
      }
    } else if (this.mode === 'juggernaut') {
      if (this.anchorT > 0) return;
      if (this.anchored) {
        const aim = this.aimPoint();
        const dist = aim.point.distanceTo(this.pos);
        if (dist < SIEGE.minRange) { this.message('Target inside minimum range', 'warn'); this.fireCd += 0.4; return; }
        const tgt = dist > SIEGE.range ? this.pos.clone().add(aim.point.clone().sub(this.pos).setLength(SIEGE.range)) : aim.point;
        this.fireCd += SIEGE.cd;
        this.lob(muzzle, tgt, 1.1, { dmg: SIEGE.damage, bonus: SIEGE.bonus, splash: SIEGE.splash, enemy: false, color: 0xffe07a, kind: 'artillery' });
        audio.weapon('artillery', 'directorate', 'juggernaut', undefined as any, undefined as any);
        this.kick = 0.25;
      } else {
        const w = DEFS.juggernaut.weapon!;
        this.fireCd += w.cooldown / MECH_RATE;
        this.shoot(muzzle, this.aimPoint().point.sub(muzzle).normalize(), 70, { dmg: w.damage + up('juggernaut'), bonus: w.bonus?.amount ?? 0, splash: 2, enemy: false, color: 0xffcf6a, hitsAir: false, kind: 'shell' });
        audio.weapon('shell', 'directorate', 'juggernaut', undefined as any, undefined as any);
        this.kick = 0.15;
      }
    } else {
      const w = DEFS.titan.weapon!;
      this.fireCd += w.cooldown / 1.5;   // hero pilot, a little under the Juggernaut's boost: the Titan already hits hardest
      const target = this.aimPoint().point;
      for (const side of [-1, 1]) {
        // the twin cannons converge on whatever is under the crosshair
        const from = muzzle.clone().add(new THREE.Vector3(Math.cos(this.yaw) * side * 2.2, -1.2, -Math.sin(this.yaw) * side * 2.2));
        this.shoot(from, target.clone().sub(from).normalize(), 80, { dmg: w.damage + up('titan'), bonus: w.bonus?.amount ?? 0, splash: 2, enemy: false, color: 0xffe07a, hitsAir: true, kind: 'titan' });
      }
      audio.weapon('artillery', 'directorate', 'titan', undefined as any, undefined as any);
      this.kick = 0.2;
    }
  }
  private kick = 0;
  private lob(from: THREE.Vector3, to: THREE.Vector3, time: number, o: Partial<Shot> & { dmg: number; enemy: boolean }) {
    const g = 22;
    const v = new THREE.Vector3((to.x - from.x) / time, (to.y - from.y + 0.5 * g * time * time) / time, (to.z - from.z) / time);
    const sp = v.length();
    this.shoot(from, v.normalize(), sp, { ...o, grav: g, life: time + 0.5 });
  }

  // ================================================================ mission logic
  private objectiveDone(i: number) {
    const o = this.mission.objectives[i];
    if (o.type === 'survive') return this.elapsed >= o.seconds;
    if (o.type === 'kill') return (this.kills.get(o.kind) ?? 0) >= o.count;
    return !this.enemies.some(e => e.alive && e.k.id === o.kind) && this.elapsed > 1;
  }
  private missionTick(dt: number) {
    const m = this.mission;
    m.radio.forEach((r, i) => { if (!this.radioFired.has(i) && this.elapsed >= r.at) { this.radioFired.add(i); this.hooks.radio(r); } });
    if (this.role !== 'guest') this.missionLogic();
    this.renderObjectives();
    void dt;
  }
  private missionLogic() {
    const m = this.mission;
    const players = this.targets();
    m.waves.forEach((w, i) => {
      if (this.elapsed < this.waveNext[i] || (w.until && this.elapsed > w.until)) return;
      this.waveNext[i] += w.every;
      const alive = this.enemies.filter(e => e.alive && !e.k.structure).length;
      const cap = Math.round((w.max ?? 30) * this.D.waves);
      if (alive >= cap) return;
      const scale = Math.min(2.5, 1 + (w.grow ?? 0) * this.waveN[i]++);   // waves grow, but never past 2.5x
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 40;
      const around = (players[Math.floor(Math.random() * players.length)] ?? { pos: this.pos }).pos;   // waves hunt either player
      let room = cap - alive;
      // co-op: a second player brings a bigger swarm
      for (const [id, n] of w.kinds) for (let j = 0; j < Math.max(1, Math.round(n * scale * this.D.waves * (this.coop ? 1.5 : 1))) && room-- > 0; j++) {
        const x = THREE.MathUtils.clamp(around.x + Math.cos(a) * d + (Math.random() - 0.5) * 16, -WORLD + 20, WORLD - 20);
        const z = THREE.MathUtils.clamp(around.z + Math.sin(a) * d + (Math.random() - 0.5) * 16, -WORLD + 20, WORLD - 20);
        this.spawn(id, new THREE.Vector3(x, 0, z));
      }
    });
    if (!this.podDropped && m.unlock.length && this.elapsed >= (m.unlockAt ?? 5)) {
      this.podDropped = true;
      // one set of mechs per player: mine next to me, my partner's next to them
      const owners = [this.pos, ...(this.ally && this.ally.lastMsg > 0 ? [this.ally.pos] : [])];
      for (const [oi, owner] of owners.entries()) m.unlock.forEach((u, i) => {
        const a = (oi === 0 ? this.yaw : this.ally!.yaw) + Math.PI + (i - (m.unlock.length - 1) / 2) * 0.8;
        const p = owner.clone().add(new THREE.Vector3(Math.sin(a) * 14, 0, Math.cos(a) * 14));
        this.dropPod(u, p);
        this.burst(p.clone().add(new THREE.Vector3(0, 2, 0)), 0xffb347, 50, 10);
      });
      const text = `${m.unlock.map(u => u === 'titan' ? 'TITAN' : 'JUGGERNAUT').join(' + ')} DROP POD LANDED — press E to board`;
      this.message(text);
      this.coop?.send({ t: 'msg', text });
      audio.death('directorate', 1.4, false, 0, 0);
    }
    m.objectives.forEach((_, i) => { if (!this.objDone.has(i) && this.objectiveDone(i)) { this.objDone.add(i); audio.event('research', 'directorate'); } });
    if (this.objDone.size === m.objectives.length && !this.over) this.finish(true, m.outro);
    // co-op: the mission is lost only when both players are down at once
    if (this.coop && !this.over && this.downT > 0 && this.ally && (this.ally.down || this.elapsed - this.ally.lastMsg > 15))
      this.finish(false, 'Both of you are down. The swarm overruns the landing zone.');
  }
  private finish(win: boolean, text: string) {
    this.over = true; this.result = win ? 'win' : 'lose';
    this.coop?.send({ t: 'end', win, text });
    this.hooks.end(win, text);
  }
  private renderObjectives() {
    const m = this.mission;
    const rows = m.objectives.map((o, i) => {
      const ok = this.objDone.has(i);
      let extra = '';
      if (o.type === 'survive' && !ok) { const left = Math.max(0, o.seconds - this.elapsed); extra = ` <b>${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b>`; }
      if (o.type === 'kill' && !ok) extra = ` <b>${Math.min(o.count, this.kills.get(o.kind) ?? 0)}/${o.count}</b>`;
      if (o.type === 'destroy' && !ok) extra = ` <b>${this.enemies.filter(e => e.alive && e.k.id === o.kind).length} left</b>`;
      return `<li class="${ok ? 'ok' : ''}">${ok ? '✔' : '◆'} ${o.label}${extra}</li>`;
    });
    this.hooks.objectives(`<div class="obj-title">${m.title}${this.coop ? ` · CO-OP` : ''}</div><ul>${rows.join('')}</ul>`);
  }

  // ================================================================ loop
  start() {
    this.bind();
    this.resize();
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) { const n = Math.ceil(this.timeScale); for (let i = 0; i < n; i++) this.update(dt * this.timeScale / n); }
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    for (const [t, f] of this.handlers) window.removeEventListener(t, f);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.renderer.dispose();
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private update(dt: number) {
    if (!this.over) this.elapsed += dt;
    if (this.downT > 0) {
      this.downT -= dt;
      if (this.downT <= 0 && !this.over) {
        // redeploy at the landing zone
        this.mode = 'foot'; this.hp = this.footHp = this.maxHp('foot'); this.ammo = RIFLE.mag; this.reload = 0; this.anchored = false; this.anchorT = 0;
        this.pos.set((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8); this.vel.set(0, 0, 0);
        this.message('Redeployed');
      }
    }
    const v = VEHICLE[this.mode];
    // ---- timers
    if (this.overdrive > 0) this.overdrive -= dt;
    if (this.reload > 0) { this.reload -= dt; if (this.reload <= 0) this.ammo = RIFLE.mag; }
    if (this.lanceCd > 0) this.lanceCd -= dt;
    if (this.anchorT > 0) { this.anchorT -= dt; if (this.anchorT <= 0) { this.anchored = !this.anchored; this.message(this.anchored ? 'ANCHOR MODE: range 39 m, splash' : 'MOBILE MODE'); } }
    if (this.lanceCharge > 0) {
      this.lanceCharge -= dt;
      if (this.lanceBeam) (this.lanceBeam.material as THREE.MeshBasicMaterial).opacity = 0.15 + (2 - this.lanceCharge) * 0.25;
      if (this.lanceCharge <= 0 && this.lanceTarget) {
        this.lanceStrike(this.lanceTarget, false);
        this.lanceCd = 71;
        if (this.lanceBeam) { const b = this.lanceBeam; this.fx.push({ mesh: b, t: 0, life: 0.6, grow: 0, fade: true }); this.lanceBeam = null; }
      }
    }
    // support drone: a Mender heals the trooper (RTS rate 12.6/s), a Rigger repairs mechs; both need 4s out of the fight
    const maxHp = this.maxHp(this.mode);
    if (this.elapsed - this.lastHurt > this.D.regenDelay && this.hp > 0 && this.hp < maxHp) this.hp = Math.min(maxHp, this.hp + 12.6 * dt);
    this.hurt = Math.max(0, this.hurt - dt * 0.8);
    this.hitmark = Math.max(0, this.hitmark - dt);
    this.kick = Math.max(0, this.kick - dt * 1.5);
    if (!this.mouseDown) this.bloom = Math.max(0, this.bloom - dt * 0.08);
    this.shake = Math.max(0, this.shake - dt * 1.2);
    if (this.muzzle) { this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 120); this.muzzleFlash!.visible = this.muzzle.intensity > 2.5; }
    // ---- movement
    const speed = (this.anchored || this.anchorT > 0 || this.downT > 0) ? 0 : v.speed * (this.keys.has('ShiftLeft') && this.mode === 'foot' ? 1.45 : 1) * (this.overdrive > 0 ? 1.5 : 1);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (this.keys.has('KeyW')) wish.add(fwd); if (this.keys.has('KeyS')) wish.sub(fwd);
    if (this.keys.has('KeyD')) wish.add(right); if (this.keys.has('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    const accel = this.mode === 'foot' ? 12 : 4;
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, accel * dt);
    if (this.keys.has('Space') && this.grounded && this.mode === 'foot') { this.vel.y = 6.5; this.grounded = false; }
    this.vel.y -= 20 * dt;
    this.pos.addScaledVector(this.vel, dt);
    // collisions with props and structures
    for (const c of this.colliders) this.pushOut(c.x, c.z, c.r + v.radius);
    for (const e of this.enemies) if (e.alive && e.k.structure) this.pushOut(e.pos.x, e.pos.z, e.k.radius + v.radius);
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > WORLD - 12) { this.pos.x *= (WORLD - 12) / r; this.pos.z *= (WORLD - 12) / r; }
    const gy = this.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gy) { this.pos.y = gy; this.vel.y = 0; this.grounded = true; }
    // ---- camera
    const bob = this.grounded && wish.lengthSq() > 0 ? Math.sin(this.elapsed * (this.mode === 'foot' ? 11 : 4)) * (this.mode === 'foot' ? 0.05 : 0.18) : 0;
    this.camera.position.copy(this.eye()).add(new THREE.Vector3(0, bob, 0));
    this.camera.rotation.set(this.pitch + this.kick * 0.6 + (Math.random() - 0.5) * this.shake * 0.08, this.yaw + (Math.random() - 0.5) * this.shake * 0.08, 0);
    if (this.gun) { this.gun.visible = this.mode === 'foot'; this.gun.position.z = -0.62 + this.kick; this.gun.position.y = -0.3 + bob * 0.3; }
    if (this.cockpit) this.cockpit.visible = this.mode !== 'foot';
    this.sun.position.set(this.pos.x + 80, 140, this.pos.z + 40); this.sun.target.position.copy(this.pos);
    // ---- weapons
    if (!this.over && this.downT <= 0) this.fire(dt);
    // ---- enemies
    this.updateEnemies(dt);
    // ---- projectiles
    this.updateShots(dt);
    // ---- effects
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt;
      const k = f.t / f.life;
      const pts = f.mesh as THREE.Points;
      if (pts.isPoints && pts.userData.vel) {
        const a = pts.geometry.attributes.position as THREE.BufferAttribute;
        (pts.userData.vel as THREE.Vector3[]).forEach((vv, j) => { vv.y -= 12 * dt; a.setXYZ(j, a.getX(j) + vv.x * dt, a.getY(j) + vv.y * dt, a.getZ(j) + vv.z * dt); });
        a.needsUpdate = true;
      }
      const mat = (f.mesh as THREE.Mesh).material as THREE.Material & { opacity?: number };
      if (mat && f.fade && 'opacity' in mat) mat.opacity = Math.max(0, 1 - k);
      const light = f.mesh as THREE.PointLight;
      if (light.isPointLight) light.intensity = 40 * Math.max(0, 1 - k);
      if (f.grow) f.mesh.scale.setScalar(1 + f.grow * Math.min(1, k * 1.6));
      if (k >= 1) { if (!f.mesh.userData.pooled) this.scene.remove(f.mesh); this.fx.splice(i, 1); }
    }
    // ---- audio listener follows the player (RTS audio engine uses tile coordinates)
    audio.listener = { x: this.pos.x / M - 20, y: this.pos.z / M - 12, w: 40, h: 25 };
    audio.intensity = Math.min(1, this.enemies.filter(e => e.alive && e.pos.distanceTo(this.pos) < 40).length / 10);
    this.updateAlly(dt);
    if (!this.over) this.missionTick(dt);
    this.netTick(dt);
    this.emitHud();
  }

  private pushOut(x: number, z: number, r: number) {
    const dx = this.pos.x - x, dz = this.pos.z - z, d = Math.hypot(dx, dz);
    if (d < r && d > 0.001) { this.pos.x = x + (dx / d) * r; this.pos.z = z + (dz / d) * r; }
  }

  private onCreep(p: THREE.Vector3) { return this.mission.biome === 'creep' || this.creep.some(c => Math.hypot(p.x - c.x, p.z - c.z) < c.r); }

  private updateEnemies(dt: number) {
    if (this.role === 'guest') { this.updateNetEnemies(dt); return; }
    const players = this.targets();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      // each Kyrrh goes for the nearest living player
      let tp = players[0];
      for (const pl of players) if (pl.pos.distanceTo(e.pos) < (tp?.pos.distanceTo(e.pos) ?? Infinity)) tp = pl;
      const me = tp?.pos ?? this.pos, v = VEHICLE[tp?.mode ?? this.mode], onAlly = !!tp?.ally;
      const target = new THREE.Vector3(me.x, me.y + v.eye * 0.6, me.z);
      e.mixer?.update(dt * (e.cur === 'Walk' ? Math.max(0.6, e.vel.length() / Math.max(1, e.k.speed)) * 1.3 : 1));
      if (!e.alive) {
        e.dying -= dt;
        e.obj.position.y -= dt * (e.k.air ? 6 : 1.2);
        e.obj.scale.multiplyScalar(1 - dt * 0.6);
        if (e.dying <= 0) { this.scene.remove(e.obj); this.enemies.splice(i, 1); }
        continue;
      }
      const k = e.k;
      // Kyrrh regeneration (Carapids heal far faster out of combat, as in the RTS)
      if (!e.alive) continue;
      if (k.regen && e.hp < k.hp) e.hp = Math.min(k.hp, e.hp + k.regen * (k.id === 'carapid' && this.elapsed - e.lastHit > 3 ? 3 : 1) * dt);
      if (e.flash > 0) e.flash -= dt;
      // spawners (Matron Spawn Brood, Nests, Throne)
      if (k.spawnEvery) {
        e.spawnT -= dt;
        const crowd = this.enemies.filter(x => x.alive && !x.k.structure).length;
        if (e.spawnT <= 0 && players.some(pl => pl.pos.distanceTo(e.pos) < 90) && crowd < (this.coop ? 22 : 16)) {
          e.spawnT = k.spawnEvery * this.D.hatch;
          const hatch = (hive: Enemy, kinds: string[]) => kinds.forEach((s, j) => this.spawn(s, hive.pos.clone().add(new THREE.Vector3(Math.cos(j * 2.1 + this.elapsed) * (hive.k.radius + 3), 0, Math.sin(j * 2.1 + this.elapsed) * (hive.k.radius + 3)))));
          if (k.id === 'matron') {
            const hive = this.enemies.filter(x => x.alive && (x.k.id === 'nest' || x.k.id === 'throne')).sort((a, b) => a.pos.distanceTo(e.pos) - b.pos.distanceTo(e.pos))[0];
            if (hive) { hatch(hive, ['skitterling', 'skitterling', 'carapid']); audio.ability('spawnbrood', hive.pos.x / M, hive.pos.z / M); this.burst(hive.pos.clone().add(new THREE.Vector3(0, 3, 0)), 0x9dff5a, 30, 6); }
          } else if (k.spawns) hatch(e, k.spawns);
        }
      }
      const to = target.clone().sub(e.pos); const dist = Math.hypot(to.x, to.z) - v.radius;
      e.cd -= dt;
      const canHit = k.atk !== 'none' && (this.mode === 'foot' || true);
      const inRange = dist <= k.range && canHit && !!tp;
      if (!k.structure) {
        // steer: melee closes in, ranged units hold at 80% range
        const want = k.atk === 'melee' ? 0.5 : k.range * 0.8;
        const dir = new THREE.Vector3(to.x, 0, to.z).normalize();
        let sp = k.speed * (this.onCreep(e.pos) && !k.air ? 1.3 : 1);
        if (dist < want) sp = k.atk === 'melee' ? 0 : -k.speed * 0.3;
        const desired = dir.multiplyScalar(sp);
        // separation
        for (const o of this.enemies) {
          if (o === e || !o.alive || o.k.structure || !!o.k.air !== !!k.air) continue;
          const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz), min = k.radius + o.k.radius;
          if (d < min && d > 0.01) { desired.x += (dx / d) * (min - d) * 4; desired.z += (dz / d) * (min - d) * 4; }
        }
        e.vel.lerp(desired, Math.min(1, dt * 4));
        e.pos.addScaledVector(e.vel, dt);
        for (const c of this.colliders) { const dx = e.pos.x - c.x, dz = e.pos.z - c.z, d = Math.hypot(dx, dz); if (d < c.r + k.radius * 0.6 && !k.air && d > 0.01) { e.pos.x = c.x + dx / d * (c.r + k.radius * 0.6); e.pos.z = c.z + dz / d * (c.r + k.radius * 0.6); } }
        const ground = this.heightAt(e.pos.x, e.pos.z);
        e.pos.y = k.air ? ground + k.air + Math.sin(this.elapsed * 1.5 + i) * 0.6 : ground;
        e.obj.position.copy(e.pos);
        e.obj.rotation.y = Math.atan2(to.x, to.z) - Math.PI / 2;
        if (e.cur !== 'Attack' || !e.acts.Attack?.isRunning()) this.play(e, e.vel.length() > 0.6 ? 'Walk' : 'Idle');
      } else {
        e.obj.position.copy(e.pos);
        if (k.id === 'thorn') e.obj.rotation.y = Math.atan2(to.x, to.z) - Math.PI / 2;
      }
      if (e.flash > 0) e.obj.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5); });
      else if (e.flash > -0.2) e.obj.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.55); });
      // attack
      if (e.stun > 0) e.stun -= dt;
      if (inRange && e.cd <= 0 && e.stun <= 0 && !this.over) {
        e.cd = k.cd;
        this.play(e, 'Attack');
        const from = e.pos.clone().add(new THREE.Vector3(0, k.air ? 0 : Math.min(3, k.radius), 0));
        if (k.atk === 'melee') {
          if (onAlly) this.hurtAlly(k.dmg, k.bonusArmored, k.hits, k.id); else this.hurtPlayer(k.dmg, k.bonusArmored, k.hits, k.id);
          audio.weapon('claw', 'kyrrh', k.id, e.pos.x / M, e.pos.z / M);
          if (k.splash) this.burst(target.clone(), 0xd060c0, 12, 3);
        } else if (k.atk === 'lob') {
          this.lob(from, target.clone().add(onAlly ? new THREE.Vector3() : this.vel.clone().multiplyScalar(0.6)), 1.4, { dmg: k.dmg, bonus: k.bonusArmored, splash: Math.max(3, k.splash), enemy: true, color: 0x9dff5a, kind: 'bile' });
          audio.weapon('acid', 'kyrrh', k.id, e.pos.x / M, e.pos.z / M);
        } else {
          const dir = target.clone().sub(from).normalize();
          const col = k.atk === 'glaive' ? 0xff7ae0 : k.id === 'carapid' ? 0x9dff5a : 0xe8dcb8;
          this.shoot(from, dir, k.atk === 'glaive' ? 30 : 40, { dmg: k.dmg, bonus: k.bonusArmored, splash: 0, enemy: true, color: col, kind: k.id });
          audio.weapon(k.id === 'carapid' ? 'acid' : k.atk === 'glaive' ? 'glaive' : k.id === 'thorn' ? 'thorn' : 'spine', 'kyrrh', k.id, e.pos.x / M, e.pos.z / M);
        }
      }
    }
  }

  /** Guest: Kyrrh positions come from the host; interpolate and animate them. */
  private updateNetEnemies(dt: number) {
    const k = 1 - Math.exp(-dt * 10);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.mixer?.update(dt);
      if (!e.alive) {
        e.dying -= dt;
        e.obj.position.y -= dt * (e.k.air ? 6 : 1.2);
        e.obj.scale.multiplyScalar(1 - dt * 0.6);
        if (e.dying <= 0) { this.scene.remove(e.obj); this.enemies.splice(i, 1); this.byId.delete(e.id); }
        continue;
      }
      if (e.net) {
        e.pos.lerp(e.net, k);
        e.obj.position.copy(e.pos);
        const ry = e.netRy ?? 0; let d = ry - e.obj.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        e.obj.rotation.y += d * k;
        if (e.netAnim === 2 && e.cur !== 'Attack') this.play(e, 'Attack');
        else if (e.netAnim !== 2 && (e.cur !== 'Attack' || !e.acts.Attack?.isRunning())) this.play(e, e.netAnim === 1 ? 'Walk' : 'Idle');
      }
      if (e.flash > 0) { e.flash -= dt; e.obj.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5); }); }
      else if (e.flash > -0.2) { e.flash -= dt; e.obj.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.55); }); }
    }
  }

  private updateShots(dt: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.vel.y -= s.grav * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      let hit = false;
      if (s.enemy) {
        if (s.kind !== 'ghost') {   // ghost = the host's shot mirrored to the guest (visual only)
          const p = this.eye(); p.y -= VEHICLE[this.mode].eye * 0.4;
          if (this.downT <= 0 && s.pos.distanceTo(p) < VEHICLE[this.mode].radius + 0.6) { hit = true; if (!s.splash) this.hurtPlayer(s.dmg, s.bonus, 1, s.kind); }
          const a = this.ally;
          if (!hit && a && !a.down && a.lastMsg > 0) {
            const ap = a.pos.clone(); ap.y += VEHICLE[a.mode].eye * 0.6;
            if (s.pos.distanceTo(ap) < VEHICLE[a.mode].radius + 0.6) { hit = true; if (!s.splash) this.hurtAlly(s.dmg, s.bonus, 1, s.kind); }
          }
        }
      } else {
        for (const e of this.enemies) {
          if (!e.alive || (e.k.air && !s.hitsAir)) continue;
          const c = e.pos.clone(); c.y += e.k.structure ? e.k.radius * 0.6 : e.k.radius * 0.8;
          if (s.pos.distanceTo(c) < e.k.radius + 0.4) { hit = true; if (!s.splash) this.hurtEnemy(e, s.dmg, s.bonus); break; }
        }
      }
      const ground = this.heightAt(s.pos.x, s.pos.z);
      if (s.pos.y <= ground) hit = true;
      if (hit || s.life <= 0) {
        if (s.splash && s.kind !== 'ghost') this.splashAt(s.pos, s.splash, s.dmg, s.bonus, s.enemy, s.kind === 'grenade');
        else if (s.splash) this.burst(s.pos, 0x9dff5a, 30, s.splash * 1.4);
        else this.burst(s.pos, s.color, 5, 1.5);
        this.scene.remove(s.mesh); s.mesh.geometry.dispose();
        this.shots.splice(i, 1);
      }
    }
  }

  private message(t: string, k: 'info' | 'warn' = 'info') { this.hooks.message(t, k); }

  private emitHud() {
    const v = VEHICLE[this.mode];
    const bossE = this.enemies.filter(e => e.alive && (e.k.structure && e.k.id !== 'thorn' || e.k.massive) && e.pos.distanceTo(this.pos) < 90).sort((a, b) => a.pos.distanceTo(this.pos) - b.pos.distanceTo(this.pos))[0];
    const aim = this.mode === 'foot' ? (this.weapon === 'rifle' ? (this.reload > 0 ? 'RELOADING' : `${this.ammo} / ${RIFLE.mag}`) : 'GRENADE') : this.mode === 'juggernaut' ? (this.anchored ? 'SIEGE CANNON' : 'CANNON') : 'TWIN CANNONS';
    const pk = this.mode === 'foot' ? this.pickups.find(p => p.pos.distanceTo(this.pos) < 6) : null;
    this.hooks.hud({
      hp: Math.max(0, this.hp), maxHp: this.maxHp(this.mode), mode: this.mode,
      weapon: this.mode === 'foot' ? (this.weapon === 'rifle' ? 'Assault Rifle · Auto' : 'HE Grenade Launcher') : this.mode === 'juggernaut' ? 'Juggernaut' : 'Titan',
      ammo: aim, overdrive: this.overdrive, anchor: this.mode === 'juggernaut' ? (this.anchorT > 0 ? 'TRANSFORMING' : this.anchored ? 'ANCHORED' : 'MOBILE') : '',
      lance: this.lanceCd, lanceReady: !!this.mission.lance && this.lanceCd <= 0 && this.lanceCharge <= 0,
      boss: bossE ? { name: DEFS[bossE.k.id].name, frac: bossE.hp / bossE.k.hp } : null,
      hurt: this.hurt, hitmark: this.hitmark, yaw: this.yaw,
      radar: [...this.enemies.filter(e => e.alive).map(e => ({ x: e.pos.x - this.pos.x, z: e.pos.z - this.pos.z, air: e.k.air > 0, big: !!e.k.structure || e.k.massive })),
        ...this.pickups.map(p => ({ x: p.pos.x - this.pos.x, z: p.pos.z - this.pos.z, air: false, big: false, pod: true })),
        ...(this.ally && this.ally.lastMsg > 0 ? [{ x: this.ally.pos.x - this.pos.x, z: this.ally.pos.z - this.pos.z, air: false, big: false, ally: true }] : [])],
      prompt: this.downT > 0 ? `DOWN — redeploying in ${Math.ceil(this.downT)} s` : pk ? `Press E to board the ${pk.mode === 'titan' ? 'Titan' : 'Juggernaut'}` : this.mode !== 'foot' ? 'E: exit mech' : '',
      ally: this.ally && this.ally.lastMsg > 0 ? { name: this.ally.name, hp: this.ally.hp, maxHp: this.ally.maxHp, down: this.ally.down, mode: this.ally.mode } : null,
      down: Math.max(0, this.downT), link: this.coop ? (this.coop.direct() ? 'P2P' : 'RELAY') : '',
    });
  }
}

/** requestPointerLock returns a promise that rejects without a fresh user gesture; the HUD prompt covers that case. */
export function lockPointer(el: HTMLElement) {
  try { const r = el.requestPointerLock() as unknown as Promise<void> | undefined; r?.catch?.(() => { /* click to take control */ }); } catch { /* older browsers throw */ }
}
function nameTex(name: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 30px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(6,14,24,0.65)'; g.beginPath(); g.roundRect(8, 10, 240, 44, 10); g.fill();
  g.fillStyle = '#5ef0ff'; g.fillText(name.slice(0, 16), 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let _flash: THREE.Texture | null = null;
function flashTex() {
  if (_flash) return _flash;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.3, 'rgba(255,200,90,0.8)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,230,160,0.9)'; g.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); g.stroke(); }
  return (_flash = new THREE.CanvasTexture(c));
}
function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function fitObject(o: THREE.Object3D, size: number) {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
  o.scale.multiplyScalar(size / Math.max(s.x, s.y, s.z, 0.001));
  o.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(o), c = b2.getCenter(new THREE.Vector3());
  o.position.x -= c.x; o.position.z -= c.z; o.position.y -= b2.min.y;
}
function tuneMat(m: THREE.MeshStandardMaterial) {
  if (!m || !('metalness' in m)) return;
  if (!m.metalnessMap) { m.metalness = 0.25; m.roughness = Math.max(0.45, Math.min(m.roughness, 0.65)); }
  if (m.map && !m.emissiveMap) { m.emissiveMap = m.map; m.emissive = new THREE.Color(1, 1, 1); }
  if (m.emissiveMap) m.emissiveIntensity = 0.55;
}
