import {
  ABILITIES, DEFS, DT, EntityDef, GAS_TIME, GAS_TRIP, LARVA_UNITS, MAX_SUPPLY, MINE_TIME, MINERAL_TRIP,
  Race, RACES, RESEARCH, Weapon, researchCost, researchTime, Proj,
} from './data';
import { GameMap, generateMap, T_GROUND } from './map';
import { FlowFields, Pathfinder, Pt } from './pathfinding';
import { mulberry32, SpatialHash } from './util';

export type OrderType = 'move' | 'amove' | 'attack' | 'patrol' | 'gather' | 'return' | 'build' | 'hold' | 'ability' | 'follow';
export interface Order {
  type: OrderType;
  x?: number; y?: number;
  target?: number;
  bType?: string; tx?: number; ty?: number;
  ability?: string;
  px?: number; py?: number;
  phase?: 'toRes' | 'mining' | 'toDrop' | 'construct';
  auto?: boolean;
}
export interface QueueItem { kind: 'unit' | 'research' | 'morph'; id: string; progress: number; total: number; started: boolean; level?: number }
export interface Egg { unit: string; progress: number; total: number }

export const SIEGE_WEAPON: Weapon = { damage: 40, bonus: { attr: 'armored', amount: 30 }, range: 13, minRange: 2, cooldown: 2.14, targets: 'ground', splash: 1.25, perUpgrade: 4, proj: 'artillery' };

let NEXT_ID = 1;

export class Entity {
  id = NEXT_ID++;
  alive = true;
  x: number; y: number;
  vx = 0; vy = 0;
  radius: number;
  hp = 0; maxHp = 0; shields = 0; maxShields = 0; energy = 0;
  facing = Math.PI / 2;
  // rect footprint (buildings, resources)
  tx = 0; ty = 0; w = 0; h = 0;
  built = true; progress = 1;
  queue: QueueItem[] = [];
  rally: { x: number; y: number; target?: number } | null = null;
  builder = 0;
  larva = 0; larvaTimer = 0; eggs: Egg[] = []; broodTimer = 0;
  powered = true;
  // units
  orders: Order[] = [];
  path: Pt[] | null = null; pathIdx = 0; pathGoalX = 0; pathGoalY = 0;
  stuckTimer = 0; stuckCount = 0; progX = 0; progY = 0;
  steerX = 0; steerY = 0; steerTick = -99; steerGX = -1; steerGY = -1; steerMode = 0;
  cooldown = 0; target = 0;
  carry = 0; carryType: 'm' | 'g' = 'm'; lastGather = 0; gatherTimer = 0; hidden = false; constructing = 0;
  overdrive = 0; sieged = false; transition = 0; lastHit = -9999; phaseCd = 0; lanceCd = 0;
  channel: { target: number; t: number } | null = null;
  rampTarget = 0; rampStacks = 0; healTarget = 0;
  attackAnim = 0; moving = false; bornTick = 0;
  // resources
  amount = 0; occupiedBy = 0; gasBuilding = 0; geyser = 0;
  seenMask = 0; kills = 0;
  constructor(
    public owner: number,
    public type: 'unit' | 'building' | 'mineral' | 'geyser',
    public def: EntityDef | null,
    x: number, y: number,
  ) {
    this.x = x; this.y = y;
    this.radius = def ? def.radius : 0.5;
    if (def) {
      this.hp = this.maxHp = def.hp;
      this.shields = this.maxShields = def.shields ?? 0;
      this.energy = def.startEnergy ?? 0;
    }
  }
  get isAir() { return !!this.def?.air; }
  get isRect() { return this.type !== 'unit'; }
  get isBuilding() { return this.type === 'building'; }
  get race(): Race | null { return this.def?.race ?? null; }
}

export interface Player {
  id: number;
  race: Race;
  name: string;
  team: number;
  minerals: number;
  gas: number;
  supplyUsed: number;
  supplyCap: number;
  weapons: number;
  armor: number;
  air: number;
  researched: Set<string>;
  researching: Set<string>;
  alive: boolean;
  ai: 'easy' | 'normal' | 'hard' | null;
  color: string;
  lastAlert: number;
  lastAttacked: { x: number; y: number; tick: number } | null;
  stats: { minerals: number; gas: number; units: number; buildings: number; kills: number; lost: number };
}

export type GameEvent =
  | { t: 'shot'; x1: number; y1: number; x2: number; y2: number; proj: Proj; owner: number; src: number; tgt: number; race: Race; air: boolean; unit: string }
  | { t: 'hit'; x: number; y: number; proj: Proj; shield: boolean; owner: number }
  | { t: 'death'; x: number; y: number; unit: string; race: Race; owner: number; radius: number; air: boolean; building: boolean }
  | { t: 'spawn'; x: number; y: number; unit: string; owner: number; race: Race }
  | { t: 'buildStart'; x: number; y: number; unit: string; owner: number; race: Race; size: number }
  | { t: 'buildDone'; x: number; y: number; unit: string; owner: number; race: Race; size: number }
  | { t: 'research'; owner: number; id: string; race: Race }
  | { t: 'msg'; owner: number; text: string; kind: 'error' | 'info' | 'alert' }
  | { t: 'attacked'; owner: number; x: number; y: number }
  | { t: 'ability'; ability: string; x: number; y: number; x2?: number; y2?: number; owner: number; race: Race }
  | { t: 'gather'; x: number; y: number; owner: number; kind: 'm' | 'g' }
  | { t: 'gameover'; winner: number };

export type Command =
  | { c: 'move' | 'amove' | 'patrol'; ids: number[]; x: number; y: number; queue?: boolean }
  | { c: 'attack'; ids: number[]; target: number; queue?: boolean }
  | { c: 'smart'; ids: number[]; x: number; y: number; target?: number; queue?: boolean }
  | { c: 'stop' | 'hold' | 'return'; ids: number[] }
  | { c: 'train'; ids: number[]; unit: string }
  | { c: 'research'; ids: number[]; research: string }
  | { c: 'build'; ids: number[]; bType: string; tx: number; ty: number; queue?: boolean }
  | { c: 'cancel'; id: number }
  | { c: 'morph'; ids: number[]; to: string }
  | { c: 'ability'; ids: number[]; ability: string; x?: number; y?: number; target?: number; queue?: boolean }
  | { c: 'rally'; ids: number[]; x: number; y: number; target?: number };

export interface GameOptions {
  seed?: number;
  players: { race: Race; ai?: 'easy' | 'normal' | 'hard' | null; name?: string; color?: string }[];
  mapSize?: number;
}

export const PLAYER_COLORS = ['#3d9bff', '#ff4d4d', '#4dff88', '#ffd24d'];

export class Game {
  map: GameMap;
  tick = 0;
  players: Player[] = [];
  entities: Entity[] = [];
  byId = new Map<number, Entity>();
  events: GameEvent[] = [];
  occ: Int32Array; // tile -> entity id occupying (buildings/resources)
  creep: Uint8Array; // bitmask of players whose creep covers tile
  visible: Uint8Array[] = [];
  explored: Uint8Array[] = [];
  pf: Pathfinder;
  flow: FlowFields;
  occVersion = 0;
  hash: SpatialHash<Entity>;
  rng: () => number;
  winner = -1;
  over = false;
  pathBudget = 0;
  controllers: { update(): void }[] = [];
  private tmp: Entity[] = [];
  private creepDirty = true;

  constructor(opts: GameOptions) {
    NEXT_ID = 1;
    this.rng = mulberry32((opts.seed ?? 42) * 7919 + 3);
    this.map = generateMap(opts.seed ?? 42, opts.mapSize ?? 128);
    const { w, h } = this.map;
    this.occ = new Int32Array(w * h);
    this.creep = new Uint8Array(w * h);
    this.pf = new Pathfinder(w, h, i => this.map.terrain[i] !== T_GROUND || this.occ[i] !== 0);
    this.hash = new SpatialHash<Entity>(w, h);
    this.flow = new FlowFields(this.pf);

    for (const r of this.map.resources) {
      const e = new Entity(-1, r.kind, null, r.tx + r.w / 2, r.ty + r.h / 2);
      e.tx = r.tx; e.ty = r.ty; e.w = r.w; e.h = r.h; e.amount = r.amount;
      e.radius = Math.max(r.w, r.h) / 2;
      this.addEntity(e);
    }
    opts.players.forEach((p, i) => {
      const pl: Player = {
        id: i, race: p.race, name: p.name ?? (p.ai ? `AI (${p.ai})` : 'Commander'), team: i,
        minerals: 50, gas: 0, supplyUsed: 0, supplyCap: 0, weapons: 0, armor: 0, air: 0,
        researched: new Set(), researching: new Set(), alive: true, ai: p.ai ?? null,
        color: p.color ?? PLAYER_COLORS[i], lastAlert: -9999, lastAttacked: null,
        stats: { minerals: 0, gas: 0, units: 0, buildings: 0, kills: 0, lost: 0 },
      };
      this.players.push(pl);
      this.visible.push(new Uint8Array(w * h));
      this.explored.push(new Uint8Array(w * h));
      const base = this.map.bases[this.map.starts[i]];
      const rd = RACES[p.race];
      const main = this.spawnBuilding(i, rd.main, Math.round(base.x - 2.5), Math.round(base.y - 2.5), true);
      if (p.race === 'kyrrh') { main.larva = 3; this.spawnUnitNear(main, 'drover'); }
      for (let k = 0; k < 12; k++) {
        const u = this.spawnUnitNear(main, rd.worker);
        const m = this.nearestMineral(u.x, u.y, 14);
        if (m) u.orders.push({ type: 'gather', target: m.id, phase: 'toRes' });
      }
    });
    this.updateCreep();
    this.updateSupply();
    this.updateFog();
  }

  // ------------------------------------------------------------------ helpers
  get time() { return this.tick * DT; }
  get(id: number | undefined): Entity | undefined {
    if (!id) return undefined;
    const e = this.byId.get(id);
    return e && e.alive ? e : undefined;
  }
  addEntity(e: Entity) {
    e.bornTick = this.tick;
    this.entities.push(e);
    this.byId.set(e.id, e);
    if (e.isRect) this.setOcc(e, e.type === 'building' && e.def?.gas ? -1 : e.id);
  }
  private setOcc(e: Entity, v: number) {
    if (v === -1) return; // gas buildings sit on geysers which already occupy
    this.occVersion++;
    const W = this.map.w;
    for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) this.occ[y * W + x] = v;
  }
  emit(ev: GameEvent) {
    if (this.events.length > 4000) this.events.splice(0, 2000);
    this.events.push(ev);
  }
  msg(owner: number, text: string, kind: 'error' | 'info' | 'alert' = 'error') { this.emit({ t: 'msg', owner, text, kind }); }

  tileFree(tx: number, ty: number) { return this.pf.isFree(tx, ty); }
  inBounds(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < this.map.w && ty < this.map.h; }

  edgeDist(a: Entity, b: Entity) {
    if (b.isRect) {
      const cx = Math.max(b.tx, Math.min(a.x, b.tx + b.w));
      const cy = Math.max(b.ty, Math.min(a.y, b.ty + b.h));
      return Math.hypot(a.x - cx, a.y - cy) - (a.isRect ? 0 : a.radius);
    }
    if (a.isRect) {
      const cx = Math.max(a.tx, Math.min(b.x, a.tx + a.w));
      const cy = Math.max(a.ty, Math.min(b.y, a.ty + a.h));
      return Math.hypot(b.x - cx, b.y - cy) - b.radius;
    }
    return Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
  }

  isEnemy(a: number, b: number) { return a >= 0 && b >= 0 && a !== b && this.players[a].team !== this.players[b].team; }

  unitsOf(owner: number, pred?: (e: Entity) => boolean) {
    return this.entities.filter(e => e.alive && e.owner === owner && (!pred || pred(e)));
  }
  countOf(owner: number, defId: string, includeUnbuilt = true) {
    let n = 0;
    for (const e of this.entities) if (e.alive && e.owner === owner && e.def && (e.def.id === defId || e.def.satisfies?.includes(defId)) && (includeUnbuilt || e.built)) n++;
    return n;
  }
  hasBuilt(owner: number, defId: string) {
    return this.entities.some(e => e.alive && e.owner === owner && e.built && e.def && (e.def.id === defId || e.def.satisfies?.includes(defId)));
  }
  /** Highest completed main-base tier. */
  tierOf(owner: number) {
    let t = 0;
    for (const e of this.entities) if (e.alive && e.owner === owner && e.built && e.def?.tier) t = Math.max(t, e.def.tier);
    return Math.max(1, t);
  }
  armorBonus(owner: number, unitId: string) {
    const p = this.players[owner];
    let a = 0;
    for (const rid of p.researched) { const r = RESEARCH[rid]; if (r.armorBonus?.units.includes(unitId)) a += r.armorBonus.amount; }
    return a;
  }
  reqsMet(owner: number, def: { requires?: string[] }) {
    return (def.requires ?? []).every(r => this.hasBuilt(owner, r));
  }
  missingReq(owner: number, def: { requires?: string[] }) {
    return (def.requires ?? []).find(r => !this.hasBuilt(owner, r));
  }
  nearestMineral(x: number, y: number, maxD = 999, preferFree = false): Entity | undefined {
    let best: Entity | undefined, bd = maxD;
    for (const e of this.entities) {
      if (!e.alive || e.type !== 'mineral') continue;
      let d = Math.hypot(e.x - x, e.y - y);
      if (preferFree && e.occupiedBy && this.get(e.occupiedBy)) d += 3;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  nearestDropoff(owner: number, x: number, y: number): Entity | undefined {
    let best: Entity | undefined, bd = Infinity;
    for (const e of this.entities) {
      if (!e.alive || e.owner !== owner || !e.def?.dropoff || !e.built) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  weaponOf(e: Entity): Weapon | undefined {
    if (e.def?.id === 'juggernaut' && e.sieged) return SIEGE_WEAPON;
    if (e.isBuilding && !e.built) return undefined;
    return e.def?.weapon;
  }
  canTarget(a: Entity, t: Entity, w = this.weaponOf(a)) {
    if (!w || !t.alive || t.hidden || !t.def) return false;
    if (!this.isEnemy(a.owner, t.owner)) return false;
    if (t.isAir) return w.targets !== 'ground';
    return w.targets !== 'air';
  }

  // ------------------------------------------------------------------ spawning
  spawnBuilding(owner: number, defId: string, tx: number, ty: number, complete: boolean): Entity {
    const def = DEFS[defId];
    const e = new Entity(owner, 'building', def, tx + def.size / 2, ty + def.size / 2);
    e.tx = tx; e.ty = ty; e.w = e.h = def.size;
    e.radius = def.size / 2;
    if (!complete) {
      e.built = false; e.progress = 0;
      e.hp = Math.max(1, def.hp * 0.1);
      e.shields = (def.shields ?? 0) * 0.1;
    }
    if (def.gas) {
      const g = this.entities.find(r => r.alive && r.type === 'geyser' && r.tx === tx && r.ty === ty);
      if (g) { g.gasBuilding = e.id; e.geyser = g.id; }
    }
    this.addEntity(e);
    if (complete && def.creepRadius) this.creepDirty = true;
    return e;
  }

  spawnUnitNear(b: Entity, defId: string): Entity {
    const def = DEFS[defId];
    let x = b.x + (this.rng() - 0.5), y = b.y + (this.rng() - 0.5);
    if (!def.air) {
      const t = this.pf.nearestFree(Math.floor(b.x + (this.rng() - 0.5) * b.w * 0.8), b.ty + b.h, 14, Math.floor(b.x), b.ty + b.h);
      if (t) { x = t.x + 0.3 + this.rng() * 0.4; y = t.y + 0.3 + this.rng() * 0.4; }
    }
    const u = new Entity(b.owner, 'unit', def, x, y);
    u.facing = Math.PI / 2;
    this.addEntity(u);
    return u;
  }

  // ------------------------------------------------------------------ placement
  canPlace(owner: number, defId: string, tx: number, ty: number, ignoreUnit = 0): string | null {
    const def = DEFS[defId];
    const W = this.map.w, s = def.size;
    if (tx < 0 || ty < 0 || tx + s > W || ty + s > this.map.h) return 'Out of bounds';
    const race = def.race;
    if (def.gas) {
      const g = this.entities.find(r => r.alive && r.type === 'geyser' && r.tx === tx && r.ty === ty);
      if (!g) return 'Must be placed on a flux vent';
      if (g.gasBuilding && this.get(g.gasBuilding)) return 'Vent already tapped';
      return null;
    }
    const bit = 1 << owner;
    for (let y = ty; y < ty + s; y++)
      for (let x = tx; x < tx + s; x++) {
        const i = y * W + x;
        if (this.map.terrain[i] !== T_GROUND || this.occ[i] !== 0) return "Can't build there";
        if (def.needsCreep && !(this.creep[i] & bit)) return 'Must build on creep';
        if (race !== 'kyrrh' && this.creep[i]) return "Can't build on creep";
      }
    if (def.dropoff) {
      for (const e of this.entities) {
        if (!e.alive || (e.type !== 'mineral' && e.type !== 'geyser')) continue;
        if (e.tx < tx + s + 3 && e.tx + e.w > tx - 3 && e.ty < ty + s + 3 && e.ty + e.h > ty - 3) return 'Too close to resources';
      }
    }
    if (def.needsPower && !this.poweredAt(owner, tx + s / 2, ty + s / 2)) return 'Must be placed in a Lumen field';
    const near = this.hash.query(tx + s / 2, ty + s / 2, s + 1.5, this.tmp);
    for (const u of near) {
      if (!u.alive || u.type !== 'unit' || u.isAir || u.hidden || u.id === ignoreUnit) continue;
      if (u.x + u.radius > tx && u.x - u.radius < tx + s && u.y + u.radius > ty && u.y - u.radius < ty + s) {
        if (u.owner !== owner || u.sieged) return 'Location is blocked';
      }
    }
    return null;
  }

  poweredAt(owner: number, x: number, y: number) {
    for (const e of this.entities)
      if (e.alive && e.owner === owner && e.built && e.def?.powerRadius && Math.hypot(e.x - x, e.y - y) <= e.def.powerRadius) return true;
    return false;
  }

  private pushUnitsOut(b: Entity, ignore = 0) {
    for (const u of this.entities) {
      if (!u.alive || u.type !== 'unit' || u.isAir || u.id === ignore) continue;
      if (u.x + u.radius > b.tx && u.x - u.radius < b.tx + b.w && u.y + u.radius > b.ty && u.y - u.radius < b.ty + b.h) {
        const t = this.pf.nearestFree(Math.floor(u.x), Math.floor(u.y), 8);
        if (t) { u.x = t.x + 0.5; u.y = t.y + 0.5; u.path = null; }
      }
    }
  }

  // ------------------------------------------------------------------ commands
  issue(cmd: Command, owner: number) {
    if (this.over) return;
    const own = (ids: number[]) => ids.map(i => this.get(i)).filter((e): e is Entity => !!e && e.owner === owner);
    switch (cmd.c) {
      case 'move': case 'amove': case 'patrol': {
        const units = own(cmd.ids).filter(u => u.type === 'unit');
        const offs = this.formation(units, cmd.x, cmd.y);
        units.forEach((u, i) => {
          if (cmd.c === 'amove' && !this.weaponOf(u) && u.def?.id !== 'mender') {
            this.giveOrder(u, { type: 'move', x: offs[i].x, y: offs[i].y }, cmd.queue);
            return;
          }
          const o: Order = { type: cmd.c, x: offs[i].x, y: offs[i].y };
          if (cmd.c === 'patrol') { o.px = u.x; o.py = u.y; }
          this.giveOrder(u, o, cmd.queue);
        });
        // buildings: set rally
        const bs = own(cmd.ids).filter(u => u.isBuilding && (u.def?.trains || u.def?.larvaHost));
        for (const b of bs) b.rally = { x: cmd.x, y: cmd.y };
        break;
      }
      case 'attack': {
        const t = this.get(cmd.target);
        if (!t) return;
        for (const u of own(cmd.ids)) {
          if (u.type !== 'unit') continue;
          if (this.canTarget(u, t)) this.giveOrder(u, { type: 'attack', target: t.id }, cmd.queue);
          else this.giveOrder(u, { type: 'move', x: t.x, y: t.y }, cmd.queue);
        }
        break;
      }
      case 'smart': {
        const t = this.get(cmd.target);
        const units = own(cmd.ids);
        const mobile = units.filter(u => u.type === 'unit');
        const offs = this.formation(mobile, cmd.x, cmd.y);
        mobile.forEach((u, i) => {
          if (t && this.isEnemy(owner, t.owner)) {
            if (this.canTarget(u, t)) this.giveOrder(u, { type: 'attack', target: t.id }, cmd.queue);
            else this.giveOrder(u, { type: 'move', x: t.x, y: t.y }, cmd.queue);
          } else if (t && u.def?.worker && (t.type === 'mineral' || (t.isBuilding && t.def?.gas && t.owner === owner && t.built))) {
            this.giveOrder(u, { type: 'gather', target: t.id, phase: u.carry ? 'toDrop' : 'toRes' }, cmd.queue);
            u.lastGather = t.id;
          } else if (t && u.def?.worker && t.owner === owner && t.def?.dropoff && u.carry > 0) {
            this.giveOrder(u, { type: 'return' }, cmd.queue);
          } else if (t && u.def?.worker && t.owner === owner && t.isBuilding && !t.built && t.def?.race === 'directorate') {
            this.giveOrder(u, { type: 'build', target: t.id, phase: 'construct' }, cmd.queue);
          } else if (t && t.owner === owner && t.type === 'unit' && t.id !== u.id) {
            this.giveOrder(u, { type: 'follow', target: t.id }, cmd.queue);
          } else {
            this.giveOrder(u, { type: 'move', x: offs[i].x, y: offs[i].y }, cmd.queue);
          }
        });
        for (const b of units.filter(u => u.isBuilding && (u.def?.trains || u.def?.dropoff))) {
          b.rally = { x: cmd.x, y: cmd.y, target: t?.id };
        }
        break;
      }
      case 'rally':
        for (const b of own(cmd.ids)) if (b.isBuilding) b.rally = { x: cmd.x, y: cmd.y, target: cmd.target };
        break;
      case 'stop':
        for (const u of own(cmd.ids)) if (u.type === 'unit') { this.clearOrders(u); }
        break;
      case 'hold':
        for (const u of own(cmd.ids)) if (u.type === 'unit') { this.clearOrders(u); u.orders.push({ type: 'hold' }); }
        break;
      case 'return':
        for (const u of own(cmd.ids)) if (u.def?.worker && u.carry > 0) this.giveOrder(u, { type: 'return' });
        break;
      case 'train': this.cmdTrain(own(cmd.ids), cmd.unit, owner); break;
      case 'research': this.cmdResearch(own(cmd.ids), cmd.research, owner); break;
      case 'build': {
        const def = DEFS[cmd.bType];
        const ws = own(cmd.ids).filter(u => u.def?.worker && u.def.race === def.race);
        if (!ws.length) return;
        const p = this.players[owner];
        if (p.minerals < def.cost.m) return this.msg(owner, 'Not enough crystal');
        if (p.gas < def.cost.g) return this.msg(owner, 'Not enough flux');
        const miss = this.missingReq(owner, def);
        if (miss) return this.msg(owner, `Requires ${DEFS[miss].name}`);
        const err = this.canPlace(owner, cmd.bType, cmd.tx, cmd.ty, -1);
        if (err) return this.msg(owner, err);
        const cx = cmd.tx + def.size / 2, cy = cmd.ty + def.size / 2;
        ws.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
        const w = ws[0];
        if (!cmd.queue && w.orders[0]?.type === 'gather' && w.orders[0].target) w.lastGather = w.orders[0].target;
        this.giveOrder(w, { type: 'build', bType: cmd.bType, tx: cmd.tx, ty: cmd.ty }, cmd.queue);
        break;
      }
      case 'cancel': this.cmdCancel(cmd.id, owner); break;
      case 'morph': this.cmdMorph(own(cmd.ids), cmd.to, owner); break;
      case 'ability': this.cmdAbility(own(cmd.ids), cmd, owner); break;
    }
  }

  private formation(units: Entity[], x: number, y: number): Pt[] {
    if (units.length <= 1) return units.map(() => ({ x, y }));
    let cx = 0, cy = 0;
    for (const u of units) { cx += u.x; cy += u.y; }
    cx /= units.length; cy /= units.length;
    const compact = units.every(u => Math.hypot(u.x - cx, u.y - cy) < 5);
    const far = Math.hypot(x - cx, y - cy) > 7;
    if (compact && far) return units.map(u => ({ x: x + (u.x - cx) * 0.75, y: y + (u.y - cy) * 0.75 }));
    return units.map(() => ({ x, y }));
  }

  giveOrder(u: Entity, o: Order, queue = false) {
    if (u.sieged && (o.type === 'move' || o.type === 'follow' || o.type === 'patrol')) return;
    if (u.transition > 0 && !queue) return;
    if (!queue) this.clearOrders(u);
    u.orders.push(o);
  }

  clearOrders(u: Entity) {
    const o = u.orders[0];
    if (o?.type === 'gather') {
      const r = this.get(o.target);
      if (r && r.occupiedBy === u.id) r.occupiedBy = 0;
      if (u.hidden) this.popOutOfGas(u, r);
    }
    if (u.constructing) {
      const b = this.get(u.constructing);
      if (b && b.builder === u.id) b.builder = 0;
      u.constructing = 0;
    }
    u.orders.length = 0;
    u.path = null;
    u.target = 0;
    u.channel = null;
  }

  private popOutOfGas(u: Entity, gasB?: Entity) {
    u.hidden = false;
    if (gasB) {
      const t = this.pf.nearestFree(Math.floor(gasB.x), gasB.ty + gasB.h, 6);
      if (t) { u.x = t.x + 0.5; u.y = t.y + 0.5; }
      if (gasB.occupiedBy === u.id) gasB.occupiedBy = 0;
    }
  }

  private cmdTrain(bs: Entity[], unitId: string, owner: number) {
    const def = DEFS[unitId];
    const p = this.players[owner];
    if (!def) return;
    if (def.larva) {
      const nests = bs.filter(b => b.def?.larvaHost && b.built && b.larva > 0).sort((a, b) => b.larva - a.larva);
      if (!nests.length) return this.msg(owner, 'No larva available');
      const miss = this.missingReq(owner, def);
      if (miss) return this.msg(owner, `Requires ${DEFS[miss].name}`);
      if (p.minerals < def.cost.m) return this.msg(owner, 'Not enough crystal');
      if (p.gas < def.cost.g) return this.msg(owner, 'Not enough flux');
      const sup = def.supply * (def.pairs ?? 1);
      if (sup > 0 && p.supplyUsed + sup > Math.min(p.supplyCap, MAX_SUPPLY)) return this.msg(owner, 'Spawn more Drovers');
      const n = nests[0];
      n.larva--;
      p.minerals -= def.cost.m; p.gas -= def.cost.g;
      n.eggs.push({ unit: unitId, progress: 0, total: def.time });
      this.updateSupply();
      return;
    }
    const cands = bs.filter(b => b.isBuilding && b.built && b.def?.trains?.includes(unitId));
    if (!cands.length) return;
    const miss = this.missingReq(owner, def);
    if (miss) return this.msg(owner, `Requires ${DEFS[miss].name}`);
    if (p.minerals < def.cost.m) return this.msg(owner, 'Not enough crystal');
    if (p.gas < def.cost.g) return this.msg(owner, 'Not enough flux');
    cands.sort((a, b) => a.queue.length - b.queue.length);
    const b = cands[0];
    if (b.queue.length >= 5) return this.msg(owner, 'Queue is full');
    p.minerals -= def.cost.m; p.gas -= def.cost.g;
    b.queue.push({ kind: 'unit', id: unitId, progress: 0, total: def.time, started: false });
  }

  private cmdMorph(bs: Entity[], to: string, owner: number) {
    const def = DEFS[to];
    const p = this.players[owner];
    if (!def?.morphFrom) return;
    const b = bs.find(b => b.isBuilding && b.built && b.def?.id === def.morphFrom && !b.queue.some(q => q.kind === 'morph'));
    if (!b) return;
    const miss = this.missingReq(owner, def);
    if (miss) return this.msg(owner, `Requires ${DEFS[miss].name}`);
    if (b.queue.length) return this.msg(owner, 'Structure is busy');
    if (p.minerals < def.cost.m) return this.msg(owner, 'Not enough crystal');
    if (p.gas < def.cost.g) return this.msg(owner, 'Not enough flux');
    p.minerals -= def.cost.m; p.gas -= def.cost.g;
    b.queue.push({ kind: 'morph', id: to, progress: 0, total: def.time, started: true });
  }

  private finishMorph(b: Entity, to: string) {
    const def = DEFS[to];
    const old = b.def!;
    b.hp += def.hp - old.hp; b.maxHp = def.hp;
    b.shields += (def.shields ?? 0) - (old.shields ?? 0); b.maxShields = def.shields ?? 0;
    b.def = def;
    if (def.creepRadius) this.creepDirty = true;
    this.emit({ t: 'buildDone', x: b.x, y: b.y, unit: def.id, owner: b.owner, race: def.race, size: def.size });
    if (!this.players[b.owner].ai) this.msg(b.owner, `Upgrade complete: ${def.name}`, 'info');
  }

  researchLevel(owner: number, resId: string) {
    const p = this.players[owner];
    const r = RESEARCH[resId];
    if (r.kind === 'weapons') return p.weapons;
    if (r.kind === 'armor') return p.armor;
    if (r.kind === 'air') return p.air;
    return p.researched.has(resId) ? 1 : 0;
  }
  researchAvailable(owner: number, resId: string) {
    const r = RESEARCH[resId];
    const p = this.players[owner];
    if (p.researching.has(resId)) return false;
    const lvl = this.researchLevel(owner, resId);
    if (lvl >= (r.levels ?? 1)) return false;
    return true;
  }
  /** Tier needed for the next level of a leveled upgrade (level N needs main tier N). */
  researchTierNeeded(owner: number, resId: string) {
    const r = RESEARCH[resId];
    return r.levels ? this.researchLevel(owner, resId) + 1 : 1;
  }

  private cmdResearch(bs: Entity[], resId: string, owner: number) {
    const r = RESEARCH[resId];
    const p = this.players[owner];
    const b = bs.find(b => b.isBuilding && b.built && b.def?.researches?.includes(resId) && b.queue.length === 0);
    if (!b) return this.msg(owner, 'Structure is busy');
    if (!this.researchAvailable(owner, resId)) return this.msg(owner, 'Already researched');
    const tierNeed = this.researchTierNeeded(owner, resId);
    if (this.tierOf(owner) < tierNeed) return this.msg(owner, `Requires a Tier ${tierNeed} main base`);
    const lvl = this.researchLevel(owner, resId);
    const cost = researchCost(r, lvl);
    if (p.minerals < cost.m) return this.msg(owner, 'Not enough crystal');
    if (p.gas < cost.g) return this.msg(owner, 'Not enough flux');
    p.minerals -= cost.m; p.gas -= cost.g;
    p.researching.add(resId);
    b.queue.push({ kind: 'research', id: resId, progress: 0, total: researchTime(r, lvl), started: true, level: lvl + 1 });
  }

  private cmdCancel(id: number, owner: number) {
    const b = this.get(id);
    if (!b || b.owner !== owner || !b.isBuilding) return;
    const p = this.players[owner];
    if (!b.built) {
      const def = b.def!;
      p.minerals += Math.floor(def.cost.m * 0.75); p.gas += Math.floor(def.cost.g * 0.75);
      if (def.race === 'kyrrh') {
        // grub re-emerges
        const u = new Entity(owner, 'unit', DEFS.grub, b.x, b.y);
        this.addEntity(u);
      }
      this.kill(b, 0, true);
      return;
    }
    if (b.eggs.length && !b.queue.length) {
      const egg = b.eggs.pop()!;
      const def = DEFS[egg.unit];
      p.minerals += def.cost.m; p.gas += def.cost.g;
      b.larva++;
      return;
    }
    const q = b.queue.pop();
    if (!q) return;
    if (q.kind === 'unit') { const def = DEFS[q.id]; p.minerals += def.cost.m; p.gas += def.cost.g; }
    else if (q.kind === 'morph') { const def = DEFS[q.id]; p.minerals += def.cost.m; p.gas += def.cost.g; }
    else { const cost = researchCost(RESEARCH[q.id], (q.level ?? 1) - 1); p.minerals += cost.m; p.gas += cost.g; p.researching.delete(q.id); }
  }

  private cmdAbility(units: Entity[], cmd: { ability: string; x?: number; y?: number; target?: number; queue?: boolean }, owner: number) {
    const ab = ABILITIES[cmd.ability];
    const p = this.players[owner];
    if (!ab) return;
    if (ab.research && !p.researched.has(ab.research)) return this.msg(owner, 'Research required');
    const casters = units.filter(u => u.def?.abilities?.includes(cmd.ability));
    if (!casters.length) return;
    switch (cmd.ability) {
      case 'overdrive':
        for (const u of casters) {
          const cost = u.def!.id === 'breacher' ? 20 : 10;
          if (u.hp > cost && u.overdrive <= 0.5) { u.hp -= cost; u.overdrive = 11; this.emit({ t: 'ability', ability: 'overdrive', x: u.x, y: u.y, owner, race: 'directorate' }); }
        }
        break;
      case 'siege':
        for (const u of casters) if (!u.sieged && u.transition <= 0) { this.clearOrders(u); u.transition = 2.7; this.emit({ t: 'ability', ability: 'siege', x: u.x, y: u.y, owner, race: 'directorate' }); }
        break;
      case 'unsiege':
        for (const u of casters) if (u.sieged && u.transition <= 0) { this.clearOrders(u); u.transition = 2.7; this.emit({ t: 'ability', ability: 'unsiege', x: u.x, y: u.y, owner, race: 'directorate' }); }
        break;
      case 'phase': {
        if (cmd.x === undefined || cmd.y === undefined) return;
        const ready = casters.filter(u => u.phaseCd <= 0);
        if (!ready.length) return this.msg(owner, 'Ability on cooldown');
        let cx = 0, cy = 0;
        for (const u of ready) { cx += u.x; cy += u.y; }
        cx /= ready.length; cy /= ready.length;
        for (const u of ready) this.doPhase(u, cmd.x + (u.x - cx), cmd.y + (u.y - cy));
        break;
      }
      case 'spawnbrood': {
        const t = this.get(cmd.target);
        if (!t || !t.def?.larvaHost || t.owner !== owner || !t.built) return this.msg(owner, 'Must target a Brood Nest');
        const c = casters.filter(u => u.energy >= 25).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
        if (!c) return this.msg(owner, 'Not enough energy');
        this.giveOrder(c, { type: 'ability', ability: 'spawnbrood', target: t.id }, cmd.queue);
        break;
      }
      case 'solarlance': {
        const t = this.get(cmd.target);
        if (!t || !this.isEnemy(owner, t.owner)) return this.msg(owner, 'Invalid target');
        const c = casters.filter(u => u.lanceCd <= 0 && !u.channel)[0];
        if (!c) return this.msg(owner, 'Ability on cooldown');
        this.giveOrder(c, { type: 'ability', ability: 'solarlance', target: t.id }, cmd.queue);
        break;
      }
    }
  }

  doPhase(u: Entity, x: number, y: number) {
    let dx = x - u.x, dy = y - u.y;
    const d = Math.hypot(dx, dy);
    if (d > 8) { dx *= 8 / d; dy *= 8 / d; }
    const t = this.pf.nearestFree(Math.floor(u.x + dx), Math.floor(u.y + dy), 3);
    if (!t) return;
    const ox = u.x, oy = u.y;
    u.x = t.x + 0.5; u.y = t.y + 0.5;
    u.phaseCd = 10; u.path = null;
    this.emit({ t: 'ability', ability: 'phase', x: ox, y: oy, x2: u.x, y2: u.y, owner: u.owner, race: 'aethel' });
  }

  // ------------------------------------------------------------------ main tick
  step() {
    if (this.over) return;
    this.tick++;
    this.pathBudget = 60;
    this.hash.clear();
    for (const e of this.entities) if (e.alive && e.type === 'unit' && !e.hidden) this.hash.insert(e);
    for (const e of this.entities) if (e.alive && e.isBuilding) this.hash.insert(e);

    if (this.tick % 10 === 0) this.updatePower();
    const list = this.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      if (e.isBuilding) this.updateBuilding(e);
      else if (e.type === 'unit') this.updateUnit(e);
    }
    this.separate();
    if (this.creepDirty) this.updateCreep();
    this.updateSupply();
    if (this.tick % 4 === 0) this.updateFog();
    // purge dead
    if (this.tick % 5 === 0) {
      this.entities = this.entities.filter(e => {
        if (!e.alive) { this.byId.delete(e.id); return false; }
        return true;
      });
    }
    for (const c of this.controllers) c.update();
    if (this.tick % 20 === 0) this.checkVictory();
  }

  private checkVictory() {
    for (const p of this.players) {
      if (!p.alive) continue;
      const has = this.entities.some(e => e.alive && e.owner === p.id && e.isBuilding);
      if (!has) {
        p.alive = false;
        this.msg(p.id, 'Your forces have been annihilated', 'alert');
        // remove remaining units
        for (const e of this.entities) if (e.alive && e.owner === p.id) this.kill(e, 0, true);
      }
    }
    const teams = new Set(this.players.filter(p => p.alive).map(p => p.team));
    if (teams.size <= 1) {
      this.over = true;
      this.winner = this.players.find(p => p.alive)?.id ?? -1;
      this.emit({ t: 'gameover', winner: this.winner });
    }
  }

  updateSupply() {
    for (const p of this.players) { p.supplyUsed = 0; p.supplyCap = 0; }
    for (const e of this.entities) {
      if (!e.alive || e.owner < 0 || !e.def) continue;
      const p = this.players[e.owner];
      if (e.type === 'unit') p.supplyUsed += e.def.supply;
      if (e.built && e.def.provides) p.supplyCap += e.def.provides;
      if (e.isBuilding) {
        const q = e.queue[0];
        if (q && q.kind === 'unit' && q.started) p.supplyUsed += DEFS[q.id].supply;
        for (const egg of e.eggs) { const d = DEFS[egg.unit]; p.supplyUsed += d.supply * (d.pairs ?? 1); }
      }
    }
    for (const p of this.players) p.supplyCap = Math.min(p.supplyCap, MAX_SUPPLY);
  }

  private updatePower() {
    for (const e of this.entities) {
      if (!e.alive || !e.isBuilding || !e.def?.needsPower) continue;
      e.powered = this.poweredAt(e.owner, e.x, e.y);
    }
  }

  updateCreep() {
    this.creepDirty = false;
    this.creep.fill(0);
    const W = this.map.w, H = this.map.h;
    for (const e of this.entities) {
      if (!e.alive || !e.isBuilding || !e.built || !e.def?.creepRadius) continue;
      const r = e.def.creepRadius, bit = 1 << e.owner;
      for (let y = Math.max(0, Math.floor(e.y - r)); y <= Math.min(H - 1, Math.ceil(e.y + r)); y++)
        for (let x = Math.max(0, Math.floor(e.x - r)); x <= Math.min(W - 1, Math.ceil(e.x + r)); x++) {
          if ((x + 0.5 - e.x) ** 2 + (y + 0.5 - e.y) ** 2 <= r * r && this.map.terrain[y * W + x] === T_GROUND) this.creep[y * W + x] |= bit;
        }
    }
  }

  private circles = new Map<number, number[]>();
  private circle(r: number) {
    const k = Math.round(r * 2);
    let c = this.circles.get(k);
    if (!c) {
      c = [];
      const rr = k / 2;
      for (let dy = -Math.ceil(rr); dy <= Math.ceil(rr); dy++)
        for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) if (dx * dx + dy * dy <= rr * rr) c.push(dx, dy);
      this.circles.set(k, c);
    }
    return c;
  }

  updateFog() {
    const W = this.map.w, H = this.map.h;
    for (let p = 0; p < this.players.length; p++) this.visible[p].fill(0);
    for (const e of this.entities) {
      if (!e.alive || e.owner < 0 || !e.def || e.hidden) continue;
      const vis = this.visible[e.owner], exp = this.explored[e.owner];
      const c = this.circle(e.isBuilding && !e.built ? Math.min(e.def.sight, 5) : e.def.sight);
      const cx = Math.floor(e.x), cy = Math.floor(e.y);
      for (let i = 0; i < c.length; i += 2) {
        const x = cx + c[i], y = cy + c[i + 1];
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        vis[y * W + x] = 1; exp[y * W + x] = 1;
      }
    }
    // memory of structures/resources
    for (const e of this.entities) {
      if (!e.alive || e.type === 'unit') continue;
      for (let p = 0; p < this.players.length; p++) {
        if (e.seenMask & (1 << p)) continue;
        if (this.rectVisible(p, e)) e.seenMask |= 1 << p;
      }
    }
  }
  rectVisible(p: number, e: Entity) {
    const W = this.map.w, vis = this.visible[p];
    for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) if (vis[y * W + x]) return true;
    return false;
  }
  isVisibleTo(p: number, e: Entity) {
    if (e.owner === p) return true;
    if (e.isRect) return this.rectVisible(p, e);
    const tx = Math.floor(e.x), ty = Math.floor(e.y);
    if (!this.inBounds(tx, ty)) return false;
    return this.visible[p][ty * this.map.w + tx] === 1;
  }
  pointVisible(p: number, x: number, y: number) {
    const tx = Math.floor(x), ty = Math.floor(y);
    return this.inBounds(tx, ty) && this.visible[p][ty * this.map.w + tx] === 1;
  }

  // ------------------------------------------------------------------ buildings
  private updateBuilding(b: Entity) {
    const def = b.def!;
    const p = this.players[b.owner];
    if (!b.built) {
      let rate = DT / def.time;
      if (def.race === 'directorate') {
        const w = this.get(b.builder);
        if (!w || w.constructing !== b.id) { rate = 0; b.builder = 0; }
      }
      if (rate > 0) {
        b.progress += rate;
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * rate);
        b.shields = Math.min(b.maxShields, b.shields + b.maxShields * 0.9 * rate);
      }
      if (b.progress >= 1) this.completeBuilding(b);
      return;
    }
    // regen
    this.regen(b);
    if (def.weapon) this.updateTurret(b);
    if (def.larvaHost) this.updateLarva(b);
    // production
    const q = b.queue[0];
    if (q) {
      if (def.needsPower && !b.powered) return;
      if (q.kind === 'unit' && !q.started) {
        const ud = DEFS[q.id];
        if (p.supplyUsed + ud.supply <= p.supplyCap || ud.supply === 0) { q.started = true; p.supplyUsed += ud.supply; }
        else {
          if (!p.ai && this.tick - p.lastAlert > 20 * 8) {
            p.lastAlert = this.tick;
            this.msg(b.owner, def.race === 'kyrrh' ? 'Spawn more Drovers' : def.race === 'aethel' ? 'You must raise more Lumen Obelisks' : 'Supply depots needed: build Habitat Pods');
          }
          return;
        }
      }
      q.progress += DT;
      if (q.progress >= q.total) {
        b.queue.shift();
        if (q.kind === 'unit') this.produce(b, q.id);
        else if (q.kind === 'morph') this.finishMorph(b, q.id);
        else this.finishResearch(b.owner, q.id);
      }
    }
  }

  private updateLarva(n: Entity) {
    if (n.larva < 3) {
      n.larvaTimer += DT;
      if (n.larvaTimer >= 11) { n.larvaTimer = 0; n.larva++; }
    } else n.larvaTimer = 0;
    if (n.broodTimer > 0) {
      n.broodTimer -= DT;
      if (n.broodTimer <= 0) { n.larva = Math.min(19, n.larva + 3); this.emit({ t: 'ability', ability: 'broodDone', x: n.x, y: n.y, owner: n.owner, race: 'kyrrh' }); }
    }
    for (let i = n.eggs.length - 1; i >= 0; i--) {
      const egg = n.eggs[i];
      egg.progress += DT;
      if (egg.progress >= egg.total) {
        n.eggs.splice(i, 1);
        const d = DEFS[egg.unit];
        for (let k = 0; k < (d.pairs ?? 1); k++) this.produce(n, egg.unit);
      }
    }
  }

  private completeBuilding(b: Entity) {
    b.built = true; b.progress = 1;
    const def = b.def!;
    const p = this.players[b.owner];
    p.stats.buildings++;
    this.emit({ t: 'buildDone', x: b.x, y: b.y, unit: def.id, owner: b.owner, race: def.race, size: def.size });
    if (def.creepRadius) this.creepDirty = true;
    if (def.larvaHost) b.larva = Math.max(b.larva, 1);
    const w = this.get(b.builder);
    if (w && w.constructing === b.id) {
      w.constructing = 0;
      w.orders.shift();
      this.resumeWorker(w, def.gas ? b : undefined);
    }
    b.builder = 0;
    if (b.owner >= 0 && !p.ai) this.msg(b.owner, `${def.name} complete`, 'info');
  }

  private resumeWorker(w: Entity, gasB?: Entity) {
    if (w.orders.length) return;
    if (gasB) { w.orders.push({ type: 'gather', target: gasB.id, phase: 'toRes' }); w.lastGather = gasB.id; return; }
    const last = this.get(w.lastGather);
    const tgt = last ?? this.nearestMineral(w.x, w.y, 20, true);
    if (tgt) w.orders.push({ type: 'gather', target: tgt.id, phase: w.carry ? 'toDrop' : 'toRes' });
  }

  private produce(b: Entity, unitId: string) {
    const u = this.spawnUnitNear(b, unitId);
    const p = this.players[b.owner];
    p.stats.units++;
    this.emit({ t: 'spawn', x: u.x, y: u.y, unit: unitId, owner: b.owner, race: u.def!.race });
    const r = b.rally;
    if (u.def!.worker) {
      const rt = this.get(r?.target);
      if (rt && (rt.type === 'mineral' || (rt.def?.gas && rt.owner === b.owner))) { u.orders.push({ type: 'gather', target: rt.id, phase: 'toRes' }); return; }
      if (!r) {
        const m = this.nearestMineral(b.x, b.y, 14, true);
        if (m) u.orders.push({ type: 'gather', target: m.id, phase: 'toRes' });
        return;
      }
    }
    if (r) {
      const rt = this.get(r.target);
      if (rt && rt.owner === b.owner && rt.type === 'unit') u.orders.push({ type: 'follow', target: rt.id });
      else u.orders.push({ type: 'move', x: r.x, y: r.y });
    }
  }

  private finishResearch(owner: number, id: string) {
    const p = this.players[owner];
    const r = RESEARCH[id];
    p.researching.delete(id);
    if (r.kind === 'weapons') p.weapons++;
    else if (r.kind === 'armor') p.armor++;
    else if (r.kind === 'air') p.air++;
    else p.researched.add(id);
    this.emit({ t: 'research', owner, id, race: r.race });
    if (!p.ai) this.msg(owner, `Research complete: ${r.name}`, 'info');
  }

  private updateTurret(b: Entity) {
    const w = b.def!.weapon!;
    b.cooldown -= DT;
    let t = this.get(b.target);
    if (!t || !this.canTarget(b, t) || this.edgeDist(b, t) > w.range) {
      t = this.acquire(b, w.range);
      b.target = t?.id ?? 0;
    }
    if (t && b.cooldown <= 0) this.fire(b, t, w);
  }

  // ------------------------------------------------------------------ units
  private regen(e: Entity) {
    const def = e.def!;
    if (def.energy) e.energy = Math.min(def.energy, e.energy + 0.7875 * DT);
    if (e.maxShields && e.shields < e.maxShields && this.tick - e.lastHit > 7 * 20) e.shields = Math.min(e.maxShields, e.shields + 2 * DT);
    if (def.race === 'kyrrh' && e.hp < e.maxHp) {
      const r = (def.regen ?? 0.27) * (e.type === 'unit' && e.def?.id === 'carapid' && this.tick - e.lastHit > 60 ? 3 : 1);
      e.hp = Math.min(e.maxHp, e.hp + r * DT);
    }
  }

  speedOf(u: Entity) {
    let s = u.def!.speed;
    if (u.overdrive > 0) s *= 1.5;
    const p = this.players[u.owner];
    if (u.def!.id === 'skitterling' && p.researched.has('hastening')) s *= 1.6;
    if (u.def!.race === 'kyrrh' && !u.isAir) {
      const tx = Math.floor(u.x), ty = Math.floor(u.y);
      if (this.inBounds(tx, ty) && this.creep[ty * this.map.w + tx] & (1 << u.owner)) s *= u.def!.id === 'matron' ? 2.2 : 1.3;
    }
    return s;
  }

  private updateUnit(u: Entity) {
    const def = u.def!;
    u.vx = 0; u.vy = 0; u.moving = false;
    if (u.attackAnim > 0) u.attackAnim -= DT;
    u.cooldown -= DT;
    if (u.overdrive > 0) u.overdrive -= DT;
    if (u.phaseCd > 0) u.phaseCd -= DT;
    if (u.lanceCd > 0) u.lanceCd -= DT;
    this.regen(u);
    if (u.transition > 0) {
      u.transition -= DT;
      if (u.transition <= 0) { u.sieged = !u.sieged; u.transition = 0; }
      return;
    }
    if (u.channel) {
      const t = this.get(u.channel.target);
      if (!t) { u.channel = null; u.lanceCd = 10; }
      else {
        u.facing = Math.atan2(t.y - u.y, t.x - u.x);
        u.channel.t -= DT;
        if (u.channel.t <= 0) {
          u.channel = null; u.lanceCd = 71;
          this.emit({ t: 'ability', ability: 'solarlance', x: u.x, y: u.y, x2: t.x, y2: t.y, owner: u.owner, race: 'directorate' });
          this.applyDamage(t, 240, u, false);
          if (u.orders[0]?.type === 'ability') u.orders.shift();
        }
        return;
      }
    }
    if (def.id === 'mender') this.menderHeal(u);

    const o = u.orders[0];
    if (!o) { this.idle(u); return; }
    switch (o.type) {
      case 'move':
        if (this.moveTo(u, o.x!, o.y!, 0.3)) u.orders.shift();
        break;
      case 'follow': {
        const t = this.get(o.target);
        if (!t) { u.orders.shift(); break; }
        if (Math.hypot(t.x - u.x, t.y - u.y) > u.radius + t.radius + 1) this.moveTo(u, t.x, t.y, u.radius + t.radius + 0.8);
        break;
      }
      case 'amove': case 'patrol': {
        const w = this.weaponOf(u);
        let t = this.get(u.target);
        if (!t || !this.canTarget(u, t) || this.edgeDist(u, t) > def.sight + 1) {
          t = w ? this.acquire(u, Math.max(def.sight, w.range + 0.5)) : undefined;
          u.target = t?.id ?? 0;
        }
        if (t && w) { this.engage(u, t, w); break; }
        if (def.id === 'mender' && u.healTarget) break;
        if (this.moveTo(u, o.x!, o.y!, 0.5)) {
          if (o.type === 'patrol') { const nx = o.px!, ny = o.py!; o.px = o.x; o.py = o.y; o.x = nx; o.y = ny; u.path = null; }
          else u.orders.shift();
        }
        break;
      }
      case 'attack': {
        const t = this.get(o.target);
        const w = this.weaponOf(u);
        if (!t || !w || !this.canTarget(u, t, w)) { u.orders.shift(); u.target = 0; break; }
        u.target = t.id;
        if (!this.engage(u, t, w, true)) u.orders.shift();
        break;
      }
      case 'hold': {
        const w = this.weaponOf(u);
        if (!w) break;
        let t = this.get(u.target);
        if (!t || !this.canTarget(u, t) || this.edgeDist(u, t) > w.range) { t = this.acquire(u, w.range); u.target = t?.id ?? 0; }
        if (t) this.engage(u, t, w, false, true);
        break;
      }
      case 'gather': this.gather(u, o); break;
      case 'return': this.returnCargo(u); break;
      case 'build': this.buildOrder(u, o); break;
      case 'ability': this.abilityOrder(u, o); break;
    }
  }

  private idle(u: Entity) {
    const w = this.weaponOf(u);
    if (!w || u.def!.worker) return;
    let t = this.get(u.target);
    const lim = u.sieged ? w.range : Math.max(w.range + 1, Math.min(u.def!.sight, 8));
    if (!t || !this.canTarget(u, t) || this.edgeDist(u, t) > lim + 2) { t = this.acquire(u, lim); u.target = t?.id ?? 0; }
    if (t) this.engage(u, t, w, false, u.sieged);
  }

  /** Returns false if target cannot be engaged (e.g. inside min range for a static unit). */
  private engage(u: Entity, t: Entity, w: Weapon, explicit = false, stationary = false): boolean {
    const d = this.edgeDist(u, t);
    if (d <= w.range + 0.05 && d >= (w.minRange ?? 0)) {
      u.path = null;
      u.facing = Math.atan2(t.y - u.y, t.x - u.x);
      if (u.cooldown <= 0) this.fire(u, t, w);
      return true;
    }
    if (d < (w.minRange ?? 0)) { u.target = 0; return false; }
    if (stationary || u.sieged) { u.target = 0; return false; }
    this.moveTo(u, t.x, t.y, 0, t);
    return true;
  }

  acquire(a: Entity, range: number): Entity | undefined {
    const w = this.weaponOf(a);
    if (!w) return undefined;
    const near = this.hash.query(a.x, a.y, range + 3, this.tmp);
    let best: Entity | undefined, bs = Infinity;
    for (const t of near) {
      if (!this.canTarget(a, t, w)) continue;
      const d = this.edgeDist(a, t);
      if (d > range) continue;
      if (d < (w.minRange ?? 0)) continue;
      let s = d;
      if (t.isBuilding) s += t.def?.weapon ? 3 : 8;
      else if (!this.weaponOf(t)) s += 3;
      else if (t.def?.worker) s += 2;
      if (s < bs) { bs = s; best = t; }
    }
    return best;
  }

  /** Nearest visible-to-anyone enemy within range regardless of weapons (used by AI micro). */
  acquireAny(a: Entity, range: number, groundOnly = false, pred?: (e: Entity) => boolean): Entity | undefined {
    const near = this.hash.query(a.x, a.y, range + 3, this.tmp);
    let best: Entity | undefined, bd = Infinity;
    for (const t of near) {
      if (!t.alive || t.hidden || !t.def || !this.isEnemy(a.owner, t.owner)) continue;
      if (groundOnly && t.isAir) continue;
      if (pred && !pred(t)) continue;
      const d = this.edgeDist(a, t);
      if (d <= range && d < bd) { bd = d; best = t; }
    }
    return best;
  }

  private fire(a: Entity, t: Entity, w: Weapon) {
    const p = this.players[a.owner];
    a.cooldown = w.cooldown / (a.overdrive > 0 ? 1.5 : 1);
    a.attackAnim = 0.18;
    const race = a.def!.race;
    this.emit({ t: 'shot', x1: a.x, y1: a.y, x2: t.x, y2: t.y, proj: w.proj, owner: a.owner, src: a.id, tgt: t.id, race, air: t.isAir, unit: a.def!.id });
    let base = w.damage + w.perUpgrade * (a.isBuilding ? 0 : a.isAir ? p.air : p.weapons);
    if (w.bonus && t.def!.attrs.includes(w.bonus.attr)) base += w.bonus.amount;
    if (w.ramp) {
      if (a.rampTarget === t.id) a.rampStacks = Math.min(10, a.rampStacks + 1);
      else { a.rampTarget = t.id; a.rampStacks = 0; }
      base += a.rampStacks * 0.8;
    }
    const hits = w.hits ?? 1;
    for (let h = 0; h < hits; h++) this.applyDamage(t, base, a);
    if (w.splash) {
      const near = this.hash.query(t.x, t.y, w.splash + 2, this.tmp).slice();
      for (const o of near) {
        if (o === t || !o.alive || !this.canTarget(a, o, w)) continue;
        const d = this.edgeDist(t, o) + (o.isRect ? 0 : o.radius);
        if (d <= w.splash) for (let h = 0; h < hits; h++) this.applyDamage(o, base * (d < w.splash / 2 ? 1 : 0.5), a);
      }
    }
    if (w.bounce) {
      let last = t;
      const hitIds = new Set([t.id]);
      let dmg = base;
      for (let b = 0; b < w.bounce; b++) {
        dmg /= 3;
        const near = this.hash.query(last.x, last.y, 3, this.tmp).slice();
        const nxt = near.find(o => !hitIds.has(o.id) && this.canTarget(a, o, w) && Math.hypot(o.x - last.x, o.y - last.y) < 2);
        if (!nxt) break;
        this.emit({ t: 'shot', x1: last.x, y1: last.y, x2: nxt.x, y2: nxt.y, proj: 'glaive', owner: a.owner, src: a.id, tgt: nxt.id, race, air: nxt.isAir, unit: a.def!.id });
        this.applyDamage(nxt, dmg, a);
        hitIds.add(nxt.id); last = nxt;
      }
    }
  }

  applyDamage(t: Entity, amount: number, src?: Entity, useArmor = true) {
    if (!t.alive || !t.def) return;
    const tp = t.owner >= 0 ? this.players[t.owner] : null;
    t.lastHit = this.tick;
    let shieldHit = false;
    if (t.shields > 0) {
      const ab = Math.min(t.shields, amount);
      t.shields -= ab; amount -= ab; shieldHit = true;
    }
    if (amount > 0) {
      const armor = useArmor ? t.def.armor + (t.type === 'unit' && tp ? tp.armor + this.armorBonus(tp.id, t.def.id) : 0) : 0;
      amount = Math.max(0.5, amount - armor);
      t.hp -= amount;
    }
    this.emit({ t: 'hit', x: t.x, y: t.y, proj: src ? (this.weaponOf(src)?.proj ?? 'melee') : 'melee', shield: shieldHit, owner: t.owner });
    if (tp && src && tp.id !== src.owner) {
      tp.lastAttacked = { x: t.x, y: t.y, tick: this.tick };
      if (this.tick - tp.lastAlert > 20 * 12) {
        tp.lastAlert = this.tick;
        this.emit({ t: 'attacked', owner: tp.id, x: t.x, y: t.y });
      }
      // retaliate when idle
      if (t.type === 'unit' && !t.orders.length && !t.def.worker && src.alive && this.canTarget(t, src)) t.target = src.id;
    }
    if (t.hp <= 0) { if (src && this.isEnemy(src.owner, t.owner)) src.kills++; this.kill(t, src?.owner ?? -1); }
  }

  kill(e: Entity, killer: number, silent = false) {
    if (!e.alive) return;
    e.alive = false; e.hp = 0;
    if (e.owner >= 0 && !silent) {
      this.players[e.owner].stats.lost++;
      if (killer >= 0 && killer !== e.owner) this.players[killer].stats.kills++;
    }
    if (!silent || e.isBuilding) this.emit({ t: 'death', x: e.x, y: e.y, unit: e.def?.id ?? e.type, race: e.def?.race ?? 'directorate', owner: e.owner, radius: e.isRect ? e.w / 2 : e.radius, air: e.isAir, building: e.isBuilding });
    if (e.isRect) {
      if (!(e.isBuilding && e.def?.gas)) this.setOcc(e, 0);
      if (e.def?.creepRadius) this.creepDirty = true;
      if (e.geyser) { const g = this.get(e.geyser); if (g) g.gasBuilding = 0; }
      if (e.isBuilding) {
        const p = this.players[e.owner];
        for (const q of e.queue) if (q.kind === 'research') p.researching.delete(q.id);
      }
      if (e.def?.gas) {
        for (const u of this.entities) if (u.alive && u.hidden && u.orders[0]?.target === e.id) { this.popOutOfGas(u, e); u.orders.length = 0; }
      }
    }
    if (e.constructing) { const b = this.get(e.constructing); if (b) b.builder = 0; }
    if (e.type === 'unit' && e.orders[0]?.type === 'gather') {
      const r = this.get(e.orders[0].target);
      if (r && r.occupiedBy === e.id) r.occupiedBy = 0;
    }
  }

  // ------------------------------------------------------------------ movement
  /** Move toward (gx,gy). Returns true when arrived. `t` = entity being approached (arrival by edge distance). */
  moveTo(u: Entity, gx: number, gy: number, arrive: number, t?: Entity): boolean {
    if (u.sieged) return true;
    const dToGoal = t ? this.edgeDist(u, t) : Math.hypot(gx - u.x, gy - u.y);
    if (dToGoal <= arrive) { u.path = null; return true; }
    const speed = this.speedOf(u) * DT;
    let tx = gx, ty = gy;
    if (!u.isAir) {
      const goalMoved = Math.hypot(u.steerGX - gx, u.steerGY - gy) > (t ? 1.2 : 0.3);
      const reached = Math.hypot(u.steerX - u.x, u.steerY - u.y) < 0.35;
      if (goalMoved || reached || this.tick - u.steerTick >= 6) {
        u.steerTick = this.tick; u.steerGX = gx; u.steerGY = gy;
        const pad = Math.min(0.45, u.radius * 0.9);
        if (dToGoal < 40 && this.pf.lineClear(u.x, u.y, gx, gy, pad)) { u.steerX = gx; u.steerY = gy; u.steerMode = 0; u.path = null; }
        else {
          const field = this.flow.get(Math.floor(gx), Math.floor(gy), this.occVersion, this.tick);
          const st = field ? this.flow.steer(field, u.x, u.y, pad) : null;
          if (st) { u.steerX = st.x; u.steerY = st.y; u.steerMode = 1; u.path = null; }
          else {
            // unreachable goal: A* toward the closest reachable point
            u.steerMode = 2;
            if (!u.path || goalMoved) {
              u.path = this.pf.find(u.x, u.y, gx, gy, 20000) ?? [{ x: gx, y: gy }];
              u.pathIdx = 0;
            }
          }
        }
      }
      if (u.steerMode === 2 && u.path) {
        const path = u.path;
        while (u.pathIdx < path.length - 1 && Math.hypot(path[u.pathIdx].x - u.x, path[u.pathIdx].y - u.y) < 0.4) u.pathIdx++;
        const wp = path[Math.min(u.pathIdx, path.length - 1)];
        if (u.pathIdx >= path.length - 1 && Math.hypot(wp.x - u.x, wp.y - u.y) < 0.35) { u.path = null; if (!t) return true; }
        tx = wp.x; ty = wp.y;
      } else { tx = u.steerX; ty = u.steerY; }
    }
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) return true;
    const step = Math.min(speed, d);
    u.vx = (dx / d) * step; u.vy = (dy / d) * step;
    u.facing = Math.atan2(dy, dx);
    u.moving = true;
    // group arrival: touching an idle friend near the goal
    if (!t && dToGoal < 2.2) {
      const near = this.hash.query(u.x, u.y, 1.5, this.tmp);
      for (const o of near) {
        if (o === u || o.owner !== u.owner || o.type !== 'unit' || o.isAir !== u.isAir) continue;
        if (o.orders.length && o.orders[0].type !== 'hold') continue;
        if (Math.hypot(o.x - u.x, o.y - u.y) < o.radius + u.radius + 0.1 && Math.hypot(o.x - gx, o.y - gy) < 2.5) { u.path = null; u.vx = u.vy = 0; return true; }
      }
    }
    // stuck detection
    u.stuckTimer += DT;
    if (u.stuckTimer > 1.2) {
      const moved = Math.hypot(u.x - u.progX, u.y - u.progY);
      u.stuckTimer = 0; u.progX = u.x; u.progY = u.y;
      if (moved < this.speedOf(u) * 0.25) {
        u.stuckCount++;
        u.path = null;
        if (u.stuckCount >= 4 && !t) { u.stuckCount = 0; return true; }
        if (u.stuckCount >= 8) { u.stuckCount = 0; return true; }
      } else u.stuckCount = 0;
    }
    return false;
  }

  private separate() {
    for (const u of this.entities) {
      if (!u.alive || u.type !== 'unit' || u.hidden) continue;
      let nx = u.x + u.vx, ny = u.y + u.vy;
      const ghost = u.def!.worker && (u.orders[0]?.type === 'gather' || u.orders[0]?.type === 'return');
      const stat = u.sieged || u.orders[0]?.type === 'hold';
      if (!ghost) {
        const near = this.hash.query(u.x, u.y, u.radius + 1.6, this.tmp);
        for (const o of near) {
          if (o === u || !o.alive || o.type !== 'unit' || o.isAir !== u.isAir || o.hidden) continue;
          if (o.def!.worker && (o.orders[0]?.type === 'gather' || o.orders[0]?.type === 'return')) continue;
          const dx = u.x - o.x, dy = u.y - o.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const overlap = u.radius + o.radius - d;
          if (overlap <= 0) continue;
          if (stat) continue;
          const oStat = o.sieged || o.orders[0]?.type === 'hold';
          let share = oStat ? 1 : o.moving && !u.moving ? 0.7 : u.moving && !o.moving ? 0.3 : 0.5;
          if (u.isAir) share *= 0.25;
          const push = Math.min(overlap * share, 0.12);
          nx += (dx / d) * push; ny += (dy / d) * push;
        }
      }
      if (!u.isAir) {
        const p = this.depenetrate(nx, ny, Math.min(0.45, u.radius * 0.8));
        nx = p.x; ny = p.y;
      }
      u.x = Math.max(0.5, Math.min(this.map.w - 0.5, nx));
      u.y = Math.max(0.5, Math.min(this.map.h - 0.5, ny));
    }
  }

  /** Push a circle out of blocked tiles (lets units slide along walls and frees wedged units). */
  depenetrate(x: number, y: number, r: number): Pt {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++) {
          if (this.tileFree(tx, ty)) continue;
          const cx = Math.max(tx, Math.min(x, tx + 1)), cy = Math.max(ty, Math.min(y, ty + 1));
          const dx = x - cx, dy = y - cy;
          const d = Math.hypot(dx, dy);
          if (d < 1e-6) {
            const f = this.pf.nearestFree(Math.floor(x), Math.floor(y), 6);
            if (f) return { x: f.x + 0.5, y: f.y + 0.5 };
            return { x, y };
          }
          if (d < r) { x += (dx / d) * (r - d); y += (dy / d) * (r - d); moved = true; }
        }
      if (!moved) break;
    }
    return { x, y };
  }

  private circleFree(x: number, y: number, r: number) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (this.tileFree(tx, ty)) continue;
        const cx = Math.max(tx, Math.min(x, tx + 1)), cy = Math.max(ty, Math.min(y, ty + 1));
        if ((cx - x) ** 2 + (cy - y) ** 2 < r * r) return false;
      }
    return true;
  }

  // ------------------------------------------------------------------ economy
  private gather(u: Entity, o: Order) {
    const p = this.players[u.owner];
    if (o.phase === 'toDrop' || (u.carry > 0 && o.phase !== 'mining')) {
      o.phase = 'toDrop';
      const drop = this.nearestDropoff(u.owner, u.x, u.y);
      if (!drop) return;
      if (this.edgeDist(u, drop) < 0.45) {
        if (u.carryType === 'm') { p.minerals += u.carry; p.stats.minerals += u.carry; }
        else { p.gas += u.carry; p.stats.gas += u.carry; }
        this.emit({ t: 'gather', x: u.x, y: u.y, owner: u.owner, kind: u.carryType });
        u.carry = 0;
        o.phase = 'toRes';
        u.path = null;
      } else this.moveTo(u, drop.x, drop.y, 0.4, drop);
      return;
    }
    let r = this.get(o.target);
    if (!r || (r.isBuilding && (!r.built || r.owner !== u.owner))) {
      if (r?.isBuilding && !r.built) return; // wait for gas building
      const alt = this.nearestMineral(u.x, u.y, 12, true);
      if (!alt) { u.orders.shift(); return; }
      o.target = alt.id; r = alt; u.lastGather = alt.id;
    }
    if (o.phase === 'mining') {
      u.gatherTimer -= DT;
      if (r.isBuilding) u.hidden = true;
      if (u.gatherTimer <= 0) {
        if (r.type === 'mineral') {
          const take = Math.min(MINERAL_TRIP, r.amount);
          r.amount -= take;
          u.carry = take; u.carryType = 'm';
          r.occupiedBy = 0;
          if (r.amount <= 0) this.kill(r, -1, true);
        } else {
          const g = this.get(r.geyser);
          const take = g ? Math.min(GAS_TRIP, g.amount) : 0;
          if (g) g.amount -= take;
          u.carry = take; u.carryType = 'g';
          r.occupiedBy = 0;
          const drop = this.nearestDropoff(u.owner, r.x, r.y);
          this.popOutOfGas(u, r);
          if (drop) {
            const ang = Math.atan2(drop.y - r.y, drop.x - r.x);
            const px = r.x + Math.cos(ang) * 2.1, py = r.y + Math.sin(ang) * 2.1;
            if (this.tileFree(Math.floor(px), Math.floor(py))) { u.x = px; u.y = py; }
          }
          if (take === 0) { u.orders.shift(); return; }
        }
        o.phase = 'toDrop';
        u.path = null;
      }
      return;
    }
    // toRes
    const d = this.edgeDist(u, r);
    if (d < 0.45) {
      const occ = this.get(r.occupiedBy);
      if (occ && occ !== u && occ.orders[0]?.target === r.id && occ.orders[0]?.phase === 'mining') {
        if (r.type === 'mineral') {
          // try another free patch close by
          let best: Entity | undefined, bd = 6;
          for (const m of this.entities) {
            if (!m.alive || m.type !== 'mineral' || m === r) continue;
            if (m.occupiedBy && this.get(m.occupiedBy)) continue;
            const dd = Math.hypot(m.x - r.x, m.y - r.y);
            if (dd < bd) { bd = dd; best = m; }
          }
          if (best && this.rng() < 0.08) { o.target = best.id; u.lastGather = best.id; }
        }
        return; // wait
      }
      r.occupiedBy = u.id;
      o.phase = 'mining';
      u.gatherTimer = r.type === 'mineral' ? MINE_TIME : GAS_TIME;
      u.facing = Math.atan2(r.y - u.y, r.x - u.x);
      if (r.isBuilding) u.hidden = true;
      u.path = null;
    } else this.moveTo(u, r.x, r.y, 0.4, r);
  }

  private returnCargo(u: Entity) {
    if (!u.carry) {
      u.orders.shift();
      const last = this.get(u.lastGather);
      if (last && !u.orders.length) u.orders.push({ type: 'gather', target: last.id, phase: 'toRes' });
      return;
    }
    const drop = this.nearestDropoff(u.owner, u.x, u.y);
    if (!drop) { u.orders.shift(); return; }
    if (this.edgeDist(u, drop) < 0.45) {
      const p = this.players[u.owner];
      if (u.carryType === 'm') { p.minerals += u.carry; p.stats.minerals += u.carry; } else { p.gas += u.carry; p.stats.gas += u.carry; }
      u.carry = 0;
    } else this.moveTo(u, drop.x, drop.y, 0.4, drop);
  }

  private buildOrder(u: Entity, o: Order) {
    const p = this.players[u.owner];
    if (o.phase === 'construct') {
      const b = this.get(o.target ?? u.constructing);
      if (!b || b.built) { u.constructing = 0; u.orders.shift(); this.resumeWorker(u); return; }
      if (b.builder && b.builder !== u.id && this.get(b.builder)?.constructing === b.id) { u.orders.shift(); return; }
      if (this.edgeDist(u, b) > 0.6) { this.moveTo(u, b.x, b.y, 0.5, b); return; }
      b.builder = u.id; u.constructing = b.id;
      u.facing = Math.atan2(b.y - u.y, b.x - u.x);
      u.attackAnim = (this.tick % 12) < 3 ? 0.1 : u.attackAnim;
      return;
    }
    const def = DEFS[o.bType!];
    const rect = { tx: o.tx!, ty: o.ty!, s: def.size };
    const cx = rect.tx + rect.s / 2, cy = rect.ty + rect.s / 2;
    const ex = Math.max(rect.tx, Math.min(u.x, rect.tx + rect.s)), ey = Math.max(rect.ty, Math.min(u.y, rect.ty + rect.s));
    const d = Math.hypot(u.x - ex, u.y - ey) - u.radius;
    if (d > 0.7) { this.moveTo(u, cx, cy, 0.3 + rect.s / 2); if (Math.hypot(u.x - cx, u.y - cy) > rect.s / 2 + 1.2 || u.moving) return; }
    // arrived: place
    const err = this.canPlace(u.owner, def.id, rect.tx, rect.ty, u.id);
    const miss = this.missingReq(u.owner, def);
    if (err || miss || p.minerals < def.cost.m || p.gas < def.cost.g) {
      if (!p.ai) this.msg(u.owner, err ?? (miss ? `Requires ${DEFS[miss].name}` : p.minerals < def.cost.m ? 'Not enough crystal' : 'Not enough flux'));
      u.orders.shift(); this.resumeWorker(u); return;
    }
    p.minerals -= def.cost.m; p.gas -= def.cost.g;
    const b = this.spawnBuilding(u.owner, def.id, rect.tx, rect.ty, false);
    this.emit({ t: 'buildStart', x: b.x, y: b.y, unit: def.id, owner: u.owner, race: def.race, size: def.size });
    if (def.race === 'directorate') {
      this.pushUnitsOut(b, u.id);
      // step builder to the edge
      if (u.x > b.tx && u.x < b.tx + b.w && u.y > b.ty && u.y < b.ty + b.h) {
        const t = this.pf.nearestFree(Math.floor(u.x), Math.floor(u.y), 6);
        if (t) { u.x = t.x + 0.5; u.y = t.y + 0.5; }
      }
      b.builder = u.id; u.constructing = b.id;
      o.phase = 'construct'; o.target = b.id;
    } else if (def.race === 'kyrrh') {
      this.pushUnitsOut(b, u.id);
      this.kill(u, -1, true);
    } else {
      this.pushUnitsOut(b, u.id);
      if (u.x > b.tx && u.x < b.tx + b.w && u.y > b.ty && u.y < b.ty + b.h) {
        const t = this.pf.nearestFree(Math.floor(u.x), Math.floor(u.y), 6);
        if (t) { u.x = t.x + 0.5; u.y = t.y + 0.5; }
      }
      u.orders.shift();
      this.resumeWorker(u);
    }
  }

  private abilityOrder(u: Entity, o: Order) {
    const t = this.get(o.target);
    const ab = ABILITIES[o.ability!];
    if (!t) { u.orders.shift(); return; }
    if (this.edgeDist(u, t) > (ab.range ?? 1)) { this.moveTo(u, t.x, t.y, ab.range ?? 1, t); return; }
    u.path = null;
    if (o.ability === 'spawnbrood') {
      if (u.energy >= 25 && t.broodTimer <= 0) {
        u.energy -= 25; t.broodTimer = 29;
        this.emit({ t: 'ability', ability: 'spawnbrood', x: t.x, y: t.y, owner: u.owner, race: 'kyrrh' });
      }
      u.orders.shift();
    } else if (o.ability === 'solarlance') {
      if (u.lanceCd > 0) { u.orders.shift(); return; }
      u.channel = { target: t.id, t: 2 };
      this.emit({ t: 'ability', ability: 'lanceCharge', x: u.x, y: u.y, x2: t.x, y2: t.y, owner: u.owner, race: 'directorate' });
    }
  }

  private menderHeal(u: Entity) {
    u.healTarget = 0;
    if (u.energy < 1) return;
    const near = this.hash.query(u.x, u.y, 5, this.tmp);
    let best: Entity | undefined, bm = 0;
    for (const o of near) {
      if (o === u || o.owner !== u.owner || o.type !== 'unit' || !o.def!.attrs.includes('bio') || o.hp >= o.maxHp) continue;
      if (this.edgeDist(u, o) > 4) continue;
      const missing = o.maxHp - o.hp;
      if (missing > bm) { bm = missing; best = o; }
    }
    if (!best) return;
    const heal = Math.min(12.6 * DT, best.maxHp - best.hp);
    best.hp += heal;
    u.energy -= heal / 3;
    u.healTarget = best.id;
  }
}
