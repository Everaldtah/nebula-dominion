import { DEFS, LARVA_UNITS, RACES, RESEARCH, Race, researchCost } from './data';
import { Entity, Game } from './game';

interface Step { id: string; count: number; workers: number }
interface Plan { steps: Step[]; army: [string, number][]; research: string[] }

const S = (id: string, count: number, workers: number): Step => ({ id, count, workers });
const PLANS: Record<Race, Plan> = {
  directorate: {
    steps: [
      S('musterhall', 1, 13), S('extractor', 1, 15), S('arsenal', 1, 17), S('musterhall', 2, 19), S('extractor', 2, 20),
      S('citadel', 1, 21), S('bastion', 2, 23), S('foundry', 1, 24), S('musterhall', 3, 26), S('extractor', 3, 28),
      S('skyport', 1, 30), S('turret', 1, 30), S('stronghold', 1, 33), S('extractor', 4, 35), S('fusionworks', 1, 37),
      S('foundry', 2, 40), S('bastion', 3, 44), S('extractor', 6, 48), S('musterhall', 5, 50),
    ],
    army: [['trooper', 5], ['breacher', 2.5], ['mender', 1], ['scorcher', 1.2], ['juggernaut', 2], ['wasp', 1.2], ['dreadnought', 0.8], ['titan', 1]],
    research: ['overdrive', 'dir_weapons', 'dir_armor', 'dir_air', 'titanium'],
  },
  kyrrh: {
    steps: [
      S('mire', 1, 14), S('siphon', 1, 15), S('nest', 2, 17), S('warren', 1, 19), S('mutagen', 1, 22), S('siphon', 2, 25),
      S('sanctum', 1, 24), S('quillden', 1, 26), S('thorn', 1, 26), S('siphon', 3, 30), S('aerie', 1, 32),
      S('throne', 1, 34), S('siphon', 4, 36), S('cavern', 1, 38), S('elderaerie', 1, 40), S('nest', 3, 42), S('siphon', 6, 48),
    ],
    army: [['skitterling', 3], ['carapid', 3.5], ['quillback', 3], ['wyvern', 1.5], ['behemoth', 1], ['gravemaw', 0.8]],
    research: ['hastening', 'kyr_weapons', 'kyr_armor', 'kyr_air', 'chitin'],
  },
  aethel: {
    steps: [
      S('portal', 1, 13), S('tap', 1, 15), S('resonance', 1, 17), S('tap', 2, 25), S('portal', 2, 21), S('crucible', 1, 22),
      S('radiantcore', 1, 23), S('core', 2, 24), S('makerforge', 1, 26), S('portal', 3, 28), S('spire', 1, 28), S('tap', 3, 32),
      S('skyforge', 1, 34), S('exaltedcore', 1, 36), S('tap', 4, 38), S('archive', 1, 40), S('core', 3, 44), S('tap', 6, 48), S('portal', 5, 50),
    ],
    army: [['vindicator', 3.5], ['seeker', 3.5], ['bulwark', 1.5], ['strider', 1], ['radiant', 1], ['empyrean', 0.6], ['hierophant', 0.8]],
    research: ['phasestep', 'aet_weapons', 'aet_armor', 'aet_air', 'aegis'],
  },
};

const DIFF = {
  easy: { think: 40, wave: 18, waveStep: 6, maxWorkers: 26, micro: false, maxWave: 40 },
  normal: { think: 20, wave: 16, waveStep: 8, maxWorkers: 44, micro: true, maxWave: 70 },
  hard: { think: 10, wave: 18, waveStep: 10, maxWorkers: 62, micro: true, maxWave: 110 },
};

export class AIController {
  plan: Plan;
  cfg: (typeof DIFF)['normal'];
  state: 'build' | 'attack' | 'defend' = 'build';
  threshold: number;
  attackSent = 0;
  lastAttackOrder = 0;
  lastWaveEnd = 0;
  /** Campaign: never launch attack waves (scripted waves do the attacking). */
  passive = false;
  siegeHold = new Map<number, number>();
  constructor(public game: Game, public pid: number, public level: 'easy' | 'normal' | 'hard') {
    this.plan = PLANS[game.players[pid].race];
    this.cfg = DIFF[level];
    this.threshold = this.cfg.wave;
  }
  get p() { return this.game.players[this.pid]; }
  get race() { return this.p.race; }

  update() {
    const g = this.game;
    if (!this.p.alive || g.over) return;
    if (this.cfg.micro && g.tick % 5 === 0) this.micro();
    if ((g.tick + this.pid * 3) % this.cfg.think !== 0) return;
    this.economy();
    this.macro();
    this.army();
  }

  // --------------------------------------------------------------- queries
  mine(pred?: (e: Entity) => boolean) { return this.game.unitsOf(this.pid, pred); }
  workers() { return this.mine(e => !!e.def?.worker); }
  dropoffs(built = true) { return this.mine(e => !!e.def?.dropoff && (!built || e.built)); }
  armyUnits() { return this.mine(e => e.type === 'unit' && !e.def!.worker && e.def!.id !== 'drover' && e.def!.id !== 'matron'); }
  armySupply() { return this.armyUnits().reduce((s, u) => s + u.def!.supply, 0); }
  count(id: string) {
    let n = this.game.countOf(this.pid, id);
    // pending builds (workers en route)
    for (const w of this.workers()) for (const o of w.orders) if (o.type === 'build' && o.bType === id && o.phase !== 'construct') n++;
    for (const nest of this.mine(e => !!e.def?.larvaHost)) for (const egg of nest.eggs) if (egg.unit === id) n++;
    for (const b of this.mine(e => e.isBuilding)) for (const q of b.queue) if (q.id === id) n++;
    return n;
  }
  afford(m: number, g: number) { return this.p.minerals >= m && this.p.gas >= g; }
  home() { return this.dropoffs(false)[0] ?? this.mine(e => e.isBuilding)[0]; }

  // --------------------------------------------------------------- economy
  private economy() {
    const g = this.game;
    const drops = this.dropoffs();
    const workers = this.workers();
    // gas saturation
    const gasB = this.mine(e => !!e.def?.gas && e.built);
    for (const gb of gasB) {
      const n = workers.filter(w => w.orders[0]?.type === 'gather' && w.orders[0].target === gb.id).length;
      const geyser = g.get(gb.geyser);
      if (!geyser || geyser.amount <= 0) continue;
      for (let k = n; k < 3; k++) {
        const cand = workers.find(w => w.orders[0]?.type === 'gather' && g.get(w.orders[0].target)?.type === 'mineral' && !w.carry && Math.hypot(w.x - gb.x, w.y - gb.y) < 16);
        if (!cand) break;
        g.giveOrder(cand, { type: 'gather', target: gb.id, phase: 'toRes' });
        cand.lastGather = gb.id;
      }
    }
    // idle workers + base saturation
    const perBase = new Map<number, number>();
    for (const d of drops) perBase.set(d.id, 0);
    for (const w of workers) {
      const o = w.orders[0];
      if (o?.type === 'gather') {
        const r = g.get(o.target);
        if (r?.type === 'mineral') {
          const d = g.nearestDropoff(this.pid, r.x, r.y);
          if (d) perBase.set(d.id, (perBase.get(d.id) ?? 0) + 1);
        }
      }
    }
    for (const w of workers) {
      if (w.orders.length) continue;
      const target = drops.filter(d => g.nearestMineral(d.x, d.y, 12)).sort((a, b) => (perBase.get(a.id) ?? 0) - (perBase.get(b.id) ?? 0))[0];
      const m = target ? g.nearestMineral(target.x, target.y, 12, true) : g.nearestMineral(w.x, w.y, 60, true);
      if (m) {
        g.giveOrder(w, { type: 'gather', target: m.id, phase: w.carry ? 'toDrop' : 'toRes' });
        w.lastGather = m.id;
        if (target) perBase.set(target.id, (perBase.get(target.id) ?? 0) + 1);
      }
    }
    // resume abandoned construction (builder killed or pulled away)
    for (const b of this.mine(e => e.isBuilding && !e.built && e.def!.race === 'directorate')) {
      const bw = g.get(b.builder);
      if (bw && bw.constructing === b.id) continue;
      if (workers.some(w => w.orders[0]?.type === 'build' && w.orders[0].target === b.id)) continue;
      const w = workers.filter(w => !w.constructing && !w.hidden && w.orders[0]?.type !== 'build').sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
      if (w) g.giveOrder(w, { type: 'build', target: b.id, phase: 'construct' });
    }
    // oversaturation transfer
    for (const d of drops) {
      const n = perBase.get(d.id) ?? 0;
      if (n <= 17) continue;
      const under = drops.find(o => o !== d && (perBase.get(o.id) ?? 0) < 14 && g.nearestMineral(o.x, o.y, 12));
      if (!under) continue;
      const movers = workers.filter(w => w.orders[0]?.type === 'gather' && Math.hypot(w.x - d.x, w.y - d.y) < 12 && g.get(w.orders[0].target)?.type === 'mineral').slice(0, n - 16);
      for (const w of movers) {
        const m = g.nearestMineral(under.x, under.y, 12, true);
        if (m) { g.giveOrder(w, { type: 'gather', target: m.id, phase: 'toRes' }); w.lastGather = m.id; }
      }
    }
  }

  // --------------------------------------------------------------- macro
  private macro() {
    const g = this.game, p = this.p, race = this.race;
    const rd = RACES[race];
    const workers = this.workers();
    const nWorkers = workers.length;
    const bases = this.dropoffs().length;
    const targetWorkers = Math.min(this.cfg.maxWorkers, 16 * Math.max(1, bases) + 3 * this.mine(e => !!e.def?.gas).length + 6);
    const nests = this.mine(e => !!e.def?.larvaHost && e.built);
    const prodBuildings = this.mine(e => e.isBuilding && !!e.def?.trains && !e.def.dropoff).length;

    // 1. supply
    const pendingSupply = this.mine(e => e.isBuilding && !e.built && !!e.def?.provides).reduce((s, e) => s + e.def!.provides!, 0)
      + this.count(rd.supply) * 0 + this.pendingSupplyUnits();
    const margin = 3 + prodBuildings * 2 + bases * 2 + nests.length * 2;
    if (p.supplyCap < 200 && p.supplyCap + pendingSupply - p.supplyUsed <= margin && pendingSupply < 16) {
      const sd = DEFS[rd.supply];
      if (this.afford(sd.cost.m, 0)) {
        if (race === 'kyrrh') { const n = nests.find(n => n.larva > 0); if (n) g.issue({ c: 'train', ids: [n.id], unit: 'drover' }, this.pid); }
        else this.buildStructure(rd.supply);
      }
      if (p.supplyUsed >= p.supplyCap) return;
    }

    // 2. build steps (tech, expansions, main-base tier upgrades)
    let saving = { m: 0, g: 0 };
    let morphWait = false;
    for (const step of this.plan.steps) {
      if (this.count(step.id) >= step.count) continue;
      if (nWorkers < Math.min(step.workers, this.cfg.maxWorkers - 2) && g.time < 60 * 12) break;
      const def = DEFS[step.id];
      if (!g.reqsMet(this.pid, def)) continue;
      if (def.morphFrom) {
        const main = this.mine(e => e.isBuilding && e.built && e.def?.id === def.morphFrom)[0];
        if (!main) continue;
        if (!this.afford(def.cost.m, def.cost.g)) { saving = { m: def.cost.m, g: def.cost.g }; morphWait = true; break; }
        if (main.queue.length) { morphWait = true; break; }
        g.issue({ c: 'morph', ids: [main.id], to: def.id }, this.pid);
        break;
      }
      if (this.afford(def.cost.m, def.cost.g)) { this.buildStructure(step.id); }
      else saving = { m: def.cost.m, g: def.cost.g };
      break;
    }

    // 3. workers
    if (nWorkers < targetWorkers) {
      if (race === 'kyrrh') {
        const armyCount = this.armySupply();
        const wantArmy = this.state === 'defend' || (armyCount < this.threshold * 0.4 && g.time > 240);
        for (const n of nests) if (n.larva > 0 && this.afford(50, 0) && (!wantArmy || g.rng() < 0.3)) g.issue({ c: 'train', ids: [n.id], unit: 'grub' }, this.pid);
      } else {
        for (const d of this.dropoffs()) if (d.queue.length < 1 && this.afford(50, 0) && !(morphWait && d.def?.morphTo)) g.issue({ c: 'train', ids: [d.id], unit: rd.worker }, this.pid);
      }
    }

    // late game: add production when floating
    if (p.minerals > 600 && g.time > 60 * 4 && this.mine(e => e.isBuilding && !e.built).length < 2) {
      const prod = race === 'directorate' ? 'musterhall' : race === 'aethel' ? 'portal' : 'nest';
      if (this.count(prod) < 8) this.buildStructure(prod);
    }
    // Matrons: one per nest
    if (race === 'kyrrh' && g.hasBuilt(this.pid, 'mire')) {
      const matrons = this.count('matron');
      if (matrons < Math.min(nests.length, 3)) {
        const n = nests.find(n => n.queue.length === 0);
        if (n && this.afford(150 + saving.m, 0)) g.issue({ c: 'train', ids: [n.id], unit: 'matron' }, this.pid);
      }
    }

    // 4. research
    if (g.time > 150) {
      for (const rid of this.plan.research) {
        const r = RESEARCH[rid];
        if (!g.researchAvailable(this.pid, rid)) continue;
        if (g.tierOf(this.pid) < g.researchTierNeeded(this.pid, rid)) continue;
        const lvl = g.researchLevel(this.pid, rid);
        const c = researchCost(r, lvl);
        const b = this.mine(e => e.isBuilding && e.built && e.def?.id === r.at && e.queue.length === 0)[0];
        if (b && this.afford(c.m + saving.m, c.g + saving.g)) g.issue({ c: 'research', ids: [b.id], research: rid }, this.pid);
      }
    }

    // 5. army
    const options = this.plan.army.filter(([id]) => g.reqsMet(this.pid, DEFS[id]));
    if (!options.length) return;
    const bioCount = this.mine(e => e.type === 'unit' && !!e.def?.attrs.includes('bio') && !e.def.worker).length;
    const pick = () => {
      let tot = 0;
      const weights = options.map(([id, w]) => {
        let ww = w;
        if (id === 'mender' && this.count('mender') * 6 > bioCount) ww = 0;
        const d = DEFS[id];
        if (p.gas < d.cost.g) ww *= 0.1;
        else if (p.gas > 500 && d.cost.g >= 100) ww *= 3;
        tot += ww;
        return ww;
      });
      let r = g.rng() * tot;
      for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) return options[i][0]; }
      return options[0][0];
    };
    if (race === 'kyrrh') {
      for (const n of nests) {
        let guard = 4;
        while (n.larva > 0 && guard-- > 0) {
          const id = pick();
          const d = DEFS[id];
          if (!this.afford(d.cost.m + saving.m, d.cost.g + saving.g)) break;
          if (nWorkers < targetWorkers && g.rng() < 0.35 && this.state !== 'defend') break;
          g.issue({ c: 'train', ids: [n.id], unit: id }, this.pid);
        }
      }
    } else {
      const prods = this.mine(e => e.isBuilding && e.built && !!e.def?.trains && !e.def.dropoff && e.queue.length < 2 && e.powered);
      for (const b of prods) {
        const ids = options.map(o => o[0]).filter(id => b.def!.trains!.includes(id));
        if (!ids.length) continue;
        let id = pick();
        if (!ids.includes(id)) id = ids[Math.floor(g.rng() * ids.length)];
        const d = DEFS[id];
        if (this.afford(d.cost.m + saving.m, d.cost.g + saving.g)) g.issue({ c: 'train', ids: [b.id], unit: id }, this.pid);
      }
    }
  }

  private pendingSupplyUnits() {
    let s = 0;
    for (const n of this.mine(e => !!e.def?.larvaHost)) for (const egg of n.eggs) if (egg.unit === 'drover') s += 8;
    return s;
  }

  // --------------------------------------------------------------- placement
  buildStructure(id: string): boolean {
    const g = this.game;
    const def = DEFS[id];
    const workers = this.workers().filter(w => !w.constructing && !w.hidden && !w.orders.some(o => o.type === 'build'));
    if (!workers.length) return false;
    const spot = this.findSpot(id);
    if (!spot) return false;
    const cx = spot.tx + def.size / 2, cy = spot.ty + def.size / 2;
    workers.sort((a, b) => (a.carry - b.carry) * 3 + Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    g.issue({ c: 'build', ids: [workers[0].id], bType: id, tx: spot.tx, ty: spot.ty }, this.pid);
    return true;
  }

  findSpot(id: string): { tx: number; ty: number } | null {
    const g = this.game;
    const def = DEFS[id];
    if (def.gas) {
      for (const d of this.dropoffs()) {
        const gs = g.entities.filter(e => e.alive && e.type === 'geyser' && !g.get(e.gasBuilding) && Math.hypot(e.x - d.x, e.y - d.y) < 12 && e.amount > 0);
        const pending = new Set(this.workers().flatMap(w => w.orders.filter(o => o.type === 'build').map(o => `${o.tx},${o.ty}`)));
        const free = gs.find(e => !pending.has(`${e.tx},${e.ty}`));
        if (free) return { tx: free.tx, ty: free.ty };
      }
      return null;
    }
    if (def.dropoff) {
      const main = this.home();
      if (!main) return null;
      const taken = (b: { x: number; y: number }) => g.entities.some(e => e.alive && e.isBuilding && e.def?.dropoff && Math.hypot(e.x - b.x, e.y - b.y) < 6);
      const pending = this.workers().some(w => w.orders.some(o => o.type === 'build' && DEFS[o.bType!]?.dropoff));
      if (pending) return null;
      const bases = g.map.bases.filter(b => !taken(b)).sort((a, b) => Math.hypot(a.x - main.x, a.y - main.y) - Math.hypot(b.x - main.x, b.y - main.y));
      for (const b of bases) {
        const tx = Math.round(b.x - 2.5), ty = Math.round(b.y - 2.5);
        if (!g.canPlace(this.pid, id, tx, ty, -1)) return { tx, ty };
      }
      return null;
    }
    // anchor: main base, or obelisk (power), or nest (creep)
    let anchors: Entity[] = this.dropoffs(false);
    if (def.needsPower) anchors = this.mine(e => e.def?.id === 'obelisk' && e.built);
    if (!anchors.length) return null;
    const pendingRects = this.workers().flatMap(w => w.orders.filter(o => o.type === 'build' && o.phase !== 'construct').map(o => ({ tx: o.tx!, ty: o.ty!, s: DEFS[o.bType!].size })));
    for (let a = 0; a < anchors.length; a++) {
      const anc = anchors[(a + Math.floor(g.rng() * anchors.length)) % anchors.length];
      const minerals = g.entities.filter(e => e.alive && (e.type === 'mineral' || e.type === 'geyser') && Math.hypot(e.x - anc.x, e.y - anc.y) < 13);
      let mdx = 0, mdy = 0;
      for (const m of minerals) { mdx += m.x - anc.x; mdy += m.y - anc.y; }
      const ml = Math.hypot(mdx, mdy) || 1; mdx /= ml; mdy /= ml;
      const tries: { tx: number; ty: number; d: number }[] = [];
      const R = def.needsPower ? 6 : id === 'obelisk' ? 11 : 13;
      const minR = def.needsPower ? 1.5 : def.id === 'thorn' || def.id === 'turret' || def.id === 'spire' ? 4 : 5;
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > R || d < minR + (anc.def?.dropoff ? 2.5 : 0)) continue;
          if (minerals.length && (dx * mdx + dy * mdy) / (d || 1) > -0.05) continue;
          tries.push({ tx: Math.round(anc.x + dx - def.size / 2), ty: Math.round(anc.y + dy - def.size / 2), d: d + g.rng() * 3 });
        }
      tries.sort((a, b) => a.d - b.d);
      for (const t of tries) {
        if (g.canPlace(this.pid, id, t.tx, t.ty, -1)) continue;
        if (!this.ringFree(t.tx, t.ty, def.size)) continue;
        if (pendingRects.some(r => t.tx < r.tx + r.s + 1 && t.tx + def.size + 1 > r.tx && t.ty < r.ty + r.s + 1 && t.ty + def.size + 1 > r.ty)) continue;
        return { tx: t.tx, ty: t.ty };
      }
    }
    return null;
  }

  private ringFree(tx: number, ty: number, s: number) {
    const g = this.game, W = g.map.w;
    for (let y = ty - 1; y <= ty + s; y++)
      for (let x = tx - 1; x <= tx + s; x++) {
        if (x >= tx && x < tx + s && y >= ty && y < ty + s) continue;
        if (!g.inBounds(x, y)) return false;
        if (g.occ[y * W + x] !== 0) return false;
      }
    return true;
  }

  // --------------------------------------------------------------- army
  private enemyTarget(from: { x: number; y: number }): { x: number; y: number } | null {
    const g = this.game;
    let best: Entity | undefined, bd = Infinity;
    for (const e of g.entities) {
      if (!e.alive || !e.isBuilding || !g.isEnemy(this.pid, e.owner)) continue;
      const d = Math.hypot(e.x - from.x, e.y - from.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return { x: best.x, y: best.y };
    return null;
  }

  private rallyPoint() {
    const g = this.game;
    const home = this.home();
    if (!home) return { x: g.map.w / 2, y: g.map.h / 2 };
    const cx = g.map.w / 2, cy = g.map.h / 2;
    const dx = cx - home.x, dy = cy - home.y, L = Math.hypot(dx, dy) || 1;
    const x = home.x + (dx / L) * 12, y = home.y + (dy / L) * 12;
    const t = g.pf.nearestFree(Math.floor(x), Math.floor(y), 8);
    return t ? { x: t.x + 0.5, y: t.y + 0.5 } : { x, y };
  }

  private army() {
    const g = this.game;
    const army = this.armyUnits();
    const supply = army.reduce((s, u) => s + u.def!.supply, 0);
    const la = this.p.lastAttacked;
    const threatened = la && g.tick - la.tick < 20 * 6 && this.mine(e => e.isBuilding).some(b => Math.hypot(b.x - la.x, b.y - la.y) < 18);

    // matron injects
    for (const m of this.mine(e => e.def?.id === 'matron')) {
      if (m.energy >= 25 && !m.orders.length) {
        const n = this.mine(e => !!e.def?.larvaHost && e.built && e.broodTimer <= 0).sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
        if (n) g.issue({ c: 'ability', ids: [m.id], ability: 'spawnbrood', target: n.id }, this.pid);
      }
    }

    if (threatened && this.state !== 'attack') {
      this.state = 'defend';
      const defenders = army.filter(u => Math.hypot(u.x - la!.x, u.y - la!.y) < 45);
      g.issue({ c: 'amove', ids: defenders.map(u => u.id), x: la!.x, y: la!.y }, this.pid);
      // pull workers when the army can't hold alone
      const threat = g.entities.filter(e => e.alive && e.type === 'unit' && g.isEnemy(this.pid, e.owner) && Math.hypot(e.x - la!.x, e.y - la!.y) < 10).reduce((n, e) => n + e.def!.supply, 0);
      const local = defenders.reduce((n, u) => n + u.def!.supply, 0);
      if (threat > local + 2) {
        const pulls = this.workers().filter(w => !w.hidden && !w.constructing && Math.hypot(w.x - la!.x, w.y - la!.y) < 12).slice(0, Math.min(12, Math.ceil(threat * 1.5)));
        if (pulls.length) g.issue({ c: 'amove', ids: pulls.map(w => w.id), x: la!.x, y: la!.y }, this.pid);
      }
      const matrons = this.mine(e => e.def?.id === 'matron' && !e.orders.length);
      if (matrons.length) g.issue({ c: 'amove', ids: matrons.map(u => u.id), x: la!.x, y: la!.y }, this.pid);
      return;
    }
    if (this.state === 'defend' && !threatened) this.state = 'build';

    if (this.state === 'build') {
      const rp = this.rallyPoint();
      const idle = army.filter(u => !u.orders.length && Math.hypot(u.x - rp.x, u.y - rp.y) > 6 && !u.sieged);
      if (idle.length) g.issue({ c: 'amove', ids: idle.map(u => u.id), x: rp.x, y: rp.y }, this.pid);
      const maxed = (this.p.supplyUsed >= 185 || (this.p.supplyUsed >= this.p.supplyCap - 2 && this.p.supplyCap < 200)) && supply >= this.cfg.wave * 0.75;
      const reachable = Math.max(this.cfg.wave, (Math.min(200, this.p.supplyCap + 16) - this.workers().length) * 0.7);
      const stale = g.tick - this.lastWaveEnd > 20 * 60 * 3 && supply >= this.cfg.wave;
      if (!this.passive && (supply >= Math.min(this.threshold, reachable) || maxed || stale)) {
        this.state = 'attack';
        this.attackSent = supply;
        this.lastAttackOrder = 0;
      }
    }
    if (this.state === 'attack') {
      if (supply < Math.max(4, this.attackSent * 0.3)) {
        this.state = 'build';
        if (this.attackSent >= this.threshold * 0.6) this.threshold = Math.min(this.cfg.maxWave, this.threshold + this.cfg.waveStep);
        this.lastWaveEnd = g.tick;
        const rp = this.rallyPoint();
        g.issue({ c: 'move', ids: army.filter(u => !u.sieged).map(u => u.id), x: rp.x, y: rp.y }, this.pid);
        return;
      }
      if (g.tick - this.lastAttackOrder > 20 * 4) {
        this.lastAttackOrder = g.tick;
        let cx = 0, cy = 0;
        for (const u of army) { cx += u.x; cy += u.y; }
        cx /= army.length || 1; cy /= army.length || 1;
        const tgt = this.enemyTarget({ x: cx, y: cy });
        if (!tgt) return;
        const movers = army.filter(u => !u.sieged && (!u.orders.length || u.orders[0].type === 'amove'));
        // stragglers regroup toward the main blob first
        const ids = movers.map(u => u.id);
        if (ids.length) g.issue({ c: 'amove', ids, x: tgt.x, y: tgt.y }, this.pid);
        // new units keep joining the wave
        this.attackSent = Math.max(this.attackSent * 0.98, supply);
      }
    }
  }

  // --------------------------------------------------------------- micro
  private micro() {
    const g = this.game;
    for (const u of this.armyUnits()) {
      const id = u.def!.id;
      if (id === 'juggernaut' && this.p.race === 'directorate') {
        const enemyNear = g.acquireAny(u, u.sieged ? 13.5 : 11, true);
        if (!u.sieged && u.transition <= 0 && enemyNear) g.issue({ c: 'ability', ids: [u.id], ability: 'siege' }, this.pid);
        if (u.sieged && u.transition <= 0) {
          if (enemyNear) this.siegeHold.set(u.id, g.tick);
          else if (g.tick - (this.siegeHold.get(u.id) ?? 0) > 20 * 4) g.issue({ c: 'ability', ids: [u.id], ability: 'unsiege' }, this.pid);
        }
      } else if ((id === 'trooper' || id === 'breacher') && this.p.researched.has('overdrive')) {
        if (u.overdrive <= 0 && u.hp > u.maxHp * 0.7 && u.target && g.get(u.target) && g.edgeDist(u, g.get(u.target)!) < 7) g.issue({ c: 'ability', ids: [u.id], ability: 'overdrive' }, this.pid);
      } else if (id === 'dreadnought' && u.lanceCd <= 0 && !u.channel) {
        const t = g.acquireAny(u, 10, false, e => e.maxHp >= 150 && e.type === 'unit');
        if (t) g.issue({ c: 'ability', ids: [u.id], ability: 'solarlance', target: t.id }, this.pid);
      } else if (id === 'seeker' && this.p.researched.has('phasestep') && u.phaseCd <= 0 && u.shields <= 1 && u.hp < u.maxHp * 0.5) {
        const home = this.home();
        if (home) {
          const dx = home.x - u.x, dy = home.y - u.y, L = Math.hypot(dx, dy) || 1;
          g.doPhase(u, u.x + (dx / L) * 8, u.y + (dy / L) * 8);
        }
      }
    }
  }
}

export function attachAI(game: Game) {
  game.players.forEach(p => { if (p.ai) game.controllers.push(new AIController(game, p.id, p.ai)); });
}
export { LARVA_UNITS };
