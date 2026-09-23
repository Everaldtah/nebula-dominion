import { describe, expect, it } from 'vitest';
import { ABILITIES, BUILD_MENUS, DEFS, LARVA_UNITS, RACES, RESEARCH, Race } from '../../src/sim/data';
import { Entity, Game } from '../../src/sim/game';
import { attachAI } from '../../src/sim/ai';
import { generateMap, T_GROUND } from '../../src/sim/map';
import { Pathfinder } from '../../src/sim/pathfinding';

const run = (g: Game, seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.step(); };
const mk = (a: Race = 'directorate', b: Race = 'kyrrh', seed = 7) => new Game({ seed, players: [{ race: a }, { race: b }] });
function unit(g: Game, owner: number, id: string, x: number, y: number) {
  const e = new Entity(owner, 'unit', DEFS[id], x, y);
  g.addEntity(e);
  return e;
}
/** Clear an arena: remove everything near (x,y). */
function freeSpot(g: Game) {
  // centre of the map is carved open
  return { x: g.map.w / 2, y: g.map.h / 2 };
}

const SC2_NAMES = ['marine', 'marauder', 'reaper', 'ghost', 'hellion', 'hellbat', 'widow mine', 'siege tank', 'cyclone', 'thor', 'viking', 'medivac',
  'liberator', 'raven', 'banshee', 'battlecruiser', 'scv', 'zergling', 'baneling', 'roach', 'ravager', 'hydralisk', 'lurker', 'infestor', 'swarm host',
  'ultralisk', 'mutalisk', 'corruptor', 'brood lord', 'viper', 'overlord', 'overseer', 'queen', 'drone', 'larva', 'probe', 'zealot', 'stalker', 'sentry',
  'adept', 'high templar', 'dark templar', 'archon', 'immortal', 'colossus', 'disruptor', 'observer', 'warp prism', 'phoenix', 'void ray', 'oracle',
  'tempest', 'carrier', 'mothership', 'nexus', 'pylon', 'gateway', 'hatchery', 'command center', 'barracks', 'factory', 'starport', 'terran', 'zerg', 'protoss',
  'spawning pool', 'assimilator', 'refinery', 'extractor pool', 'vespene', 'mineral field', 'supply depot', 'forge', 'cybernetics', 'robotics', 'stargate'];

describe('data', () => {
  it('every unit/building has original (non-SC2) names', () => {
    const word = (n: string, s: string) => (' ' + s.toLowerCase().replace(/[^a-z]+/g, ' ') + ' ').includes(' ' + n + ' ');
    for (const d of Object.values(DEFS)) {
      for (const n of SC2_NAMES) expect(word(n, d.name), `${d.name} vs ${n}`).toBe(false);
    }
    for (const r of Object.values(RACES)) for (const n of SC2_NAMES) expect(word(n, r.name)).toBe(false);
    expect(word('thor', 'Thorn Colony')).toBe(false);
    expect(word('marine', 'Space Marine')).toBe(true);
  });
  it('three races, each with a worker, main, supply, gas and at least 6 combat units', () => {
    for (const race of ['directorate', 'kyrrh', 'aethel'] as Race[]) {
      const rd = RACES[race];
      expect(DEFS[rd.worker].worker).toBe(true);
      expect(DEFS[rd.main].dropoff).toBe(true);
      expect(DEFS[rd.supply].provides).toBeGreaterThan(0);
      expect(DEFS[rd.gasBuilding].gas).toBe(true);
      const combat = Object.values(DEFS).filter(d => d.race === race && d.kind === 'unit' && d.weapon && !d.worker);
      expect(combat.length).toBeGreaterThanOrEqual(6);
    }
  });
  it('all references resolve and every combat unit is producible', () => {
    for (const d of Object.values(DEFS)) {
      for (const r of d.requires ?? []) expect(DEFS[r], `${d.id} requires ${r}`).toBeDefined();
      for (const t of d.trains ?? []) expect(DEFS[t]).toBeDefined();
      for (const r of d.researches ?? []) expect(RESEARCH[r]).toBeDefined();
      for (const a of d.abilities ?? []) expect(ABILITIES[a]).toBeDefined();
      if (d.kind === 'unit') {
        const producer = d.larva || Object.values(DEFS).some(b => b.trains?.includes(d.id));
        expect(producer, `${d.id} producible`).toBe(true);
      }
    }
    for (const race of Object.keys(BUILD_MENUS) as Race[]) {
      const all = [...BUILD_MENUS[race].basic, ...BUILD_MENUS[race].advanced];
      const buildings = Object.values(DEFS).filter(d => d.race === race && d.kind === 'building' && !d.morphFrom).map(d => d.id);
      expect(new Set(all)).toEqual(new Set(buildings));
      // hotkeys unique within a menu
      for (const menu of [BUILD_MENUS[race].basic, BUILD_MENUS[race].advanced]) {
        const keys = menu.map(id => DEFS[id].hotkey);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
    for (const b of Object.values(DEFS).filter(d => d.kind === 'building')) {
      const keys = [...(b.trains ?? []), ...(b.larvaHost ? LARVA_UNITS : [])].map(u => DEFS[u].hotkey)
        .concat((b.researches ?? []).map(r => RESEARCH[r].hotkey)).concat(b.morphTo ? [DEFS[b.morphTo].hotkey] : []);
      expect(new Set(keys).size, `${b.id} hotkeys`).toBe(keys.length);
    }
  });
});

describe('map', () => {
  it('is point symmetric and all bases are connected', () => {
    const m = generateMap(99);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++)
      expect(m.terrain[y * m.w + x]).toBe(m.terrain[(m.h - 1 - y) * m.w + (m.w - 1 - x)]);
    const occ = new Uint8Array(m.w * m.h);
    for (const r of m.resources) for (let y = r.ty; y < r.ty + r.h; y++) for (let x = r.tx; x < r.tx + r.w; x++) occ[y * m.w + x] = 1;
    const pf = new Pathfinder(m.w, m.h, i => m.terrain[i] !== T_GROUND || occ[i] === 1);
    for (const b of m.bases) {
      const p = pf.find(m.bases[0].x, m.bases[0].y + 4, b.x, b.y + 4, 30000);
      expect(p).not.toBeNull();
      const end = p![p!.length - 1];
      expect(Math.hypot(end.x - b.x, end.y - b.y - 4)).toBeLessThan(2);
    }
    expect(m.resources.filter(r => r.kind === 'mineral').length).toBe(80);
    expect(m.resources.filter(r => r.kind === 'geyser').length).toBe(20);
  });
  it('works across several seeds', () => {
    for (const seed of [1, 2, 3, 42, 1337]) {
      const g = mk('aethel', 'directorate', seed);
      expect(g.entities.filter(e => e.def?.worker).length).toBe(24);
    }
  });
});

describe('pathfinding', () => {
  it('routes around obstacles', () => {
    const w = 20, h = 20;
    const blocked = new Uint8Array(w * h);
    for (let y = 0; y < 18; y++) blocked[y * w + 10] = 1;
    const pf = new Pathfinder(w, h, i => blocked[i] === 1);
    const p = pf.find(2.5, 2.5, 17.5, 2.5)!;
    expect(p).not.toBeNull();
    expect(p[p.length - 1]).toEqual({ x: 17.5, y: 2.5 });
    expect(p.some(pt => pt.y > 17)).toBe(true);
  });
  it('returns a partial path to an enclosed goal', () => {
    const w = 20, h = 20;
    const blocked = new Uint8Array(w * h);
    for (let i = 0; i < w; i++) { blocked[5 * w + i] = 1; }
    const pf = new Pathfinder(w, h, i => blocked[i] === 1);
    const p = pf.find(2.5, 15.5, 2.5, 1.5)!;
    expect(p).not.toBeNull();
    expect(p[p.length - 1].y).toBeGreaterThan(5);
  });
});

describe('economy', () => {
  for (const race of ['directorate', 'kyrrh', 'aethel'] as Race[]) {
    it(`${race}: 12 workers mine crystal at a realistic rate`, () => {
      const g = mk(race, race === 'kyrrh' ? 'aethel' : 'kyrrh');
      const start = g.players[0].minerals;
      run(g, 60);
      const gained = g.players[0].minerals - start;
      // 12 workers ~ 40-80 per worker per game-minute
      expect(gained).toBeGreaterThan(400);
      expect(gained).toBeLessThan(1100);
    });
  }
  it('gas harvesting via a flux building', () => {
    const g = mk('directorate');
    const main = g.unitsOf(0, e => e.def?.id === 'bastion')[0];
    const geyser = g.entities.filter(e => e.type === 'geyser').sort((a, b) => Math.hypot(a.x - main.x, a.y - main.y) - Math.hypot(b.x - main.x, b.y - main.y))[0];
    g.players[0].minerals = 1000;
    const workers = g.unitsOf(0, e => !!e.def?.worker);
    g.issue({ c: 'build', ids: [workers[0].id], bType: 'extractor', tx: geyser.tx, ty: geyser.ty }, 0);
    run(g, 40);
    const ex = g.unitsOf(0, e => e.def?.id === 'extractor')[0];
    expect(ex).toBeDefined();
    expect(ex.built).toBe(true);
    g.issue({ c: 'smart', ids: workers.slice(1, 4).map(w => w.id), x: ex.x, y: ex.y, target: ex.id }, 0);
    run(g, 40);
    expect(g.players[0].gas).toBeGreaterThan(60);
  });
  for (const race of ['directorate', 'kyrrh', 'aethel'] as Race[]) {
    it(`${race}: right-clicking the vent under your flux building harvests flux (UI picks the vent)`, () => {
      const g = mk(race, race === 'kyrrh' ? 'aethel' : 'kyrrh');
      const main = g.unitsOf(0, e => !!e.def?.dropoff)[0];
      const geyser = g.entities.filter(e => e.type === 'geyser').sort((a, b) => Math.hypot(a.x - main.x, a.y - main.y) - Math.hypot(b.x - main.x, b.y - main.y))[0];
      const gb = g.spawnBuilding(0, RACES[race].gasBuilding, geyser.tx, geyser.ty, true);
      expect(geyser.gasBuilding).toBe(gb.id);
      const workers = g.unitsOf(0, e => !!e.def?.worker).slice(0, 3);
      // target the VENT id, as the old click-picking did
      g.issue({ c: 'smart', ids: workers.map(w => w.id), x: geyser.x, y: geyser.y, target: geyser.id }, 0);
      for (const w of workers) { expect(w.orders[0]?.type).toBe('gather'); expect(w.orders[0]?.target).toBe(gb.id); }
      run(g, 30);
      expect(g.players[0].gas).toBeGreaterThanOrEqual(40);
    });
  }
  it('vehicles accelerate and turn gradually; infantry pivots fast', () => {
    const g = mk('directorate', 'kyrrh');
    const c = freeSpot(g);
    const j = unit(g, 0, 'juggernaut', c.x, c.y); j.facing = 0;
    const t = unit(g, 0, 'trooper', c.x, c.y + 3); t.facing = 0;
    g.issue({ c: 'move', ids: [j.id], x: c.x - 10, y: c.y }, 0);
    g.issue({ c: 'move', ids: [t.id], x: c.x - 10, y: c.y + 3 }, 0);
    run(g, 0.3);
    expect(Math.abs(Math.abs(t.facing) - Math.PI)).toBeLessThan(0.2);
    expect(Math.abs(Math.abs(j.facing) - Math.PI)).toBeGreaterThan(1.0);
    expect(j.curSpeed).toBeLessThan(1);
    run(g, 3);
    expect(Math.abs(Math.abs(j.facing) - Math.PI)).toBeLessThan(0.3);
    expect(j.curSpeed).toBeGreaterThan(1.5);
  });
  it('mineral patches deplete and are removed', () => {
    const g = mk();
    const m = g.entities.find(e => e.type === 'mineral')!;
    m.amount = 5;
    const w = g.unitsOf(0, e => !!e.def?.worker)[0];
    g.issue({ c: 'smart', ids: [w.id], x: m.x, y: m.y, target: m.id }, 0);
    run(g, 30);
    expect(m.alive).toBe(false);
    expect(g.tileFree(m.tx, m.ty)).toBe(true);
  });
});

describe('production & tech', () => {
  it('training costs resources, takes time, and respects supply', () => {
    const g = mk('directorate');
    const p = g.players[0];
    const main = g.unitsOf(0, e => e.def?.id === 'bastion')[0];
    p.minerals = 500;
    g.issue({ c: 'train', ids: [main.id], unit: 'rigger' }, 0);
    expect(p.minerals).toBe(450);
    expect(main.queue.length).toBe(1);
    run(g, 11);
    expect(g.unitsOf(0, e => !!e.def?.worker).length).toBe(12);
    run(g, 2);
    expect(g.unitsOf(0, e => !!e.def?.worker).length).toBe(13);
    // supply block
    p.minerals = 5000;
    for (let i = 0; i < 5; i++) g.issue({ c: 'train', ids: [main.id], unit: 'rigger' }, 0);
    run(g, 80);
    expect(p.supplyUsed).toBeLessThanOrEqual(p.supplyCap);
    expect(g.unitsOf(0, e => !!e.def?.worker).length).toBe(15);
  });
  it('cancel refunds', () => {
    const g = mk('directorate');
    const p = g.players[0];
    const main = g.unitsOf(0, e => e.def?.id === 'bastion')[0];
    p.minerals = 100;
    g.issue({ c: 'train', ids: [main.id], unit: 'rigger' }, 0);
    g.issue({ c: 'cancel', id: main.id }, 0);
    expect(p.minerals).toBe(100);
  });
  it('tech requirements are enforced', () => {
    const g = mk('directorate');
    g.players[0].minerals = 2000;
    const w = g.unitsOf(0, e => !!e.def?.worker)[0];
    g.events.length = 0;
    g.issue({ c: 'build', ids: [w.id], bType: 'arsenal', tx: 30, ty: 100 }, 0);
    expect(g.events.some(e => e.t === 'msg' && e.text.includes('Requires'))).toBe(true);
  });
  it('directorate construction requires the builder to stay', () => {
    const g = mk('directorate');
    const p = g.players[0];
    p.minerals = 1000;
    const w = g.unitsOf(0, e => !!e.def?.worker)[0];
    const spot = findSpot(g, 0, 'habitat');
    g.issue({ c: 'build', ids: [w.id], bType: 'habitat', tx: spot.tx, ty: spot.ty }, 0);
    run(g, 8);
    const hab = g.unitsOf(0, e => e.def?.id === 'habitat')[0];
    expect(hab).toBeDefined();
    expect(hab.built).toBe(false);
    const prog = hab.progress;
    g.issue({ c: 'stop', ids: [w.id] }, 0);
    run(g, 5);
    expect(hab.progress).toBeCloseTo(prog, 3);
    g.issue({ c: 'smart', ids: [w.id], x: hab.x, y: hab.y, target: hab.id }, 0);
    run(g, 30);
    expect(hab.built).toBe(true);
    expect(p.supplyCap).toBe(23);
  });
  it('kyrrh: larva regenerate, eggs hatch pairs, grubs are consumed by buildings, creep required', () => {
    const g = mk('kyrrh', 'directorate');
    const p = g.players[0];
    const nest = g.unitsOf(0, e => e.def?.id === 'nest')[0];
    expect(nest.larva).toBe(3);
    p.minerals = 2000;
    // supply 12/14: only two grubs fit
    g.issue({ c: 'train', ids: [nest.id], unit: 'grub' }, 0);
    g.issue({ c: 'train', ids: [nest.id], unit: 'grub' }, 0);
    g.events.length = 0;
    g.issue({ c: 'train', ids: [nest.id], unit: 'grub' }, 0);
    expect(g.events.some(e => e.t === 'msg' && e.text.includes('Drovers'))).toBe(true);
    expect(nest.larva).toBe(1);
    expect(nest.eggs.length).toBe(2);
    g.issue({ c: 'train', ids: [nest.id], unit: 'drover' }, 0);
    expect(nest.larva).toBe(0);
    run(g, 12.5);
    expect(g.unitsOf(0, e => e.def?.id === 'grub').length).toBe(14);
    expect(nest.larva).toBe(1);
    run(g, 6);
    expect(g.players[0].supplyCap).toBe(22);
    // skitterling requires mire
    run(g, 25);
    g.issue({ c: 'train', ids: [nest.id], unit: 'skitterling' }, 0);
    expect(nest.eggs.length).toBe(0);
    // build mire on creep
    const w = g.unitsOf(0, e => e.def?.id === 'grub')[0];
    const offCreep = g.canPlace(0, 'mire', 60, 60);
    expect(offCreep).toBe('Must build on creep');
    const spot = findSpot(g, 0, 'mire');
    g.issue({ c: 'build', ids: [w.id], bType: 'mire', tx: spot.tx, ty: spot.ty }, 0);
    run(g, 10);
    expect(w.alive).toBe(false);
    run(g, 50);
    expect(g.hasBuilt(0, 'mire')).toBe(true);
    const before = g.unitsOf(0, e => e.def?.id === 'skitterling').length;
    g.issue({ c: 'train', ids: [nest.id], unit: 'skitterling' }, 0);
    run(g, 18);
    expect(g.unitsOf(0, e => e.def?.id === 'skitterling').length).toBe(before + 2);
  });
  it('aethel: structures need a Lumen field, lose production when unpowered', () => {
    const g = mk('aethel', 'directorate');
    const p = g.players[0];
    p.minerals = 2000;
    expect(g.canPlace(0, 'portal', 60, 60)).toBe('Must be placed in a Lumen field');
    const w = g.unitsOf(0, e => !!e.def?.worker)[0];
    const spot = findSpot(g, 0, 'obelisk');
    g.issue({ c: 'build', ids: [w.id], bType: 'obelisk', tx: spot.tx, ty: spot.ty }, 0);
    run(g, 30);
    const ob = g.unitsOf(0, e => e.def?.id === 'obelisk')[0];
    expect(ob.built).toBe(true);
    // worker is free during construction (it went back to mining)
    expect(w.orders[0]?.type).toBe('gather');
    const pspot = findSpot(g, 0, 'portal');
    expect(pspot).toBeTruthy();
    g.issue({ c: 'build', ids: [w.id], bType: 'portal', tx: pspot.tx, ty: pspot.ty }, 0);
    run(g, 55);
    const portal = g.unitsOf(0, e => e.def?.id === 'portal')[0];
    expect(portal.built).toBe(true);
    g.issue({ c: 'train', ids: [portal.id], unit: 'vindicator' }, 0);
    run(g, 5);
    g.kill(ob, 1);
    run(g, 1);
    expect(portal.powered).toBe(false);
    const prog = portal.queue[0].progress;
    run(g, 5);
    expect(portal.queue[0].progress).toBe(prog);
  });
  it('research: weapon upgrades increase damage, armor upgrades reduce it', () => {
    const g = mk('directorate', 'directorate');
    const c = freeSpot(g);
    const t = unit(g, 0, 'trooper', c.x, c.y);
    const target = unit(g, 1, 'breacher', c.x + 3, c.y);
    target.hp = target.maxHp = 100000;
    const fire = () => { const h = target.hp; (g as any).fire(t, target, DEFS.trooper.weapon); return h - target.hp; };
    expect(fire()).toBe(5); // 6 - 1 armor
    g.players[0].weapons = 2;
    expect(fire()).toBe(7);
    g.players[1].armor = 1;
    expect(fire()).toBe(6);
  });
  it('research queue completes and applies', () => {
    const g = mk('directorate', 'kyrrh');
    const p = g.players[0];
    p.minerals = 1000; p.gas = 1000;
    const main = g.unitsOf(0, e => e.def?.id === 'bastion')[0];
    const ars = g.spawnBuilding(0, 'arsenal', Math.round(main.x) - 1, Math.round(main.y) - 10, true);
    g.issue({ c: 'research', ids: [ars.id], research: 'dir_weapons' }, 0);
    expect(p.researching.has('dir_weapons')).toBe(true);
    expect(p.minerals).toBe(900);
    run(g, 81);
    expect(p.weapons).toBe(1);
    g.events.length = 0;
    g.issue({ c: 'research', ids: [ars.id], research: 'dir_weapons' }, 0);
    expect(g.events.some(e => e.t === 'msg' && e.text.includes('Tier 2'))).toBe(true);
    main.def = DEFS.citadel;
    const before = p.minerals;
    g.issue({ c: 'research', ids: [ars.id], research: 'dir_weapons' }, 0);
    expect(before - p.minerals).toBe(150); // level 2 costs 150
  });
});

function findSpot(g: Game, pid: number, id: string) {
  const main = g.unitsOf(pid, e => !!e.def?.dropoff || e.def?.id === 'obelisk').sort((a, b) => (b.def?.id === 'obelisk' ? 1 : 0) - (a.def?.id === 'obelisk' ? 1 : 0))[0];
  const cx = g.map.w / 2, cy = g.map.h / 2;
  const s = DEFS[id].size;
  const cands: { tx: number; ty: number; d: number }[] = [];
  for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
    const tx = Math.round(main.x + dx - s / 2), ty = Math.round(main.y + dy - s / 2);
    cands.push({ tx, ty, d: Math.hypot(tx + s / 2 - cx, ty + s / 2 - cy) });
  }
  cands.sort((a, b) => a.d - b.d);
  const ok = cands.find(c => !g.canPlace(pid, id, c.tx, c.ty, -1));
  if (!ok) throw new Error('no spot for ' + id);
  return ok;
}

describe('tech tiers', () => {
  for (const race of ['directorate', 'kyrrh', 'aethel'] as Race[]) {
    it(`${race}: main base morphs T1 -> T2 -> T3, unlocking tier buildings, giant units and upgrade levels`, () => {
      const g = mk(race, race === 'kyrrh' ? 'aethel' : 'kyrrh');
      const p = g.players[0];
      p.minerals = p.gas = 20000;
      const main = g.unitsOf(0, e => !!e.def?.dropoff)[0];
      const t1 = main.def!;
      const t2 = DEFS[t1.morphTo!], t3 = DEFS[t2.morphTo!];
      expect(t2.tier).toBe(2); expect(t3.tier).toBe(3);
      // T2 requires a tier-1 tech building
      g.events.length = 0;
      g.issue({ c: 'morph', ids: [main.id], to: t2.id }, 0);
      expect(main.queue.length).toBe(0);
      let x = 60;
      const place = (id: string) => { const b = g.spawnBuilding(0, id, x, 64, true); x += 4; return b; };
      for (const r of t2.requires!) place(r);
      g.issue({ c: 'morph', ids: [main.id], to: t2.id }, 0);
      expect(main.queue[0]?.kind).toBe('morph');
      run(g, t2.time + 1);
      expect(main.def!.id).toBe(t2.id);
      expect(main.maxHp).toBe(t2.hp);
      expect(g.tierOf(0)).toBe(2);
      expect(g.hasBuilt(0, t1.id)).toBe(true); // higher tiers satisfy lower requirements
      // leveled upgrade: level 2 needs T2, level 3 needs T3
      const chamber = Object.values(DEFS).find(d => d.race === race && d.researches?.some(r => RESEARCH[r].kind === 'weapons'))!;
      const weaponsId = chamber.researches!.find(r => RESEARCH[r].kind === 'weapons')!;
      const ch = place(chamber.id);
      p.weapons = 2;
      g.issue({ c: 'research', ids: [ch.id], research: weaponsId }, 0);
      expect(ch.queue.length).toBe(0);
      for (const r of t3.requires!) if (!g.hasBuilt(0, r)) { for (const rr of DEFS[r].requires ?? []) if (!g.hasBuilt(0, rr)) place(rr); place(r); }
      g.issue({ c: 'morph', ids: [main.id], to: t3.id }, 0);
      run(g, t3.time + 1);
      expect(main.def!.id).toBe(t3.id);
      expect(g.tierOf(0)).toBe(3);
      g.issue({ c: 'research', ids: [ch.id], research: weaponsId }, 0);
      expect(ch.queue.length).toBe(1);
      // tier-3 building unlocks the giant unit
      const giant = { directorate: 'titan', kyrrh: 'gravemaw', aethel: 'hierophant' }[race];
      const gdef = DEFS[giant];
      expect(gdef.attrs).toContain('massive');
      expect(g.reqsMet(0, gdef)).toBe(false);
      for (const r of gdef.requires!) { const rd = DEFS[r]; for (const rr of rd.requires ?? []) if (!g.hasBuilt(0, rr)) place(rr); place(r); }
      expect(g.reqsMet(0, gdef)).toBe(true);
    });
  }
  it('air weapon upgrades apply to air units only; armor research boosts giants', () => {
    const g = mk('directorate', 'directorate');
    const c = freeSpot(g);
    const wasp = unit(g, 0, 'wasp', c.x, c.y);
    const tr = unit(g, 0, 'trooper', c.x, c.y + 2);
    const tgt = unit(g, 1, 'titan', c.x + 3, c.y);
    tgt.hp = tgt.maxHp = 100000;
    const hit = (a: any) => { const h = tgt.hp; (g as any).fire(a, tgt, a.def.weapon); return h - tgt.hp; };
    const w0 = hit(wasp), t0 = hit(tr);
    g.players[0].air = 1;
    expect(hit(wasp)).toBe(w0 + 2); // 2 hits x +1
    expect(hit(tr)).toBe(t0);
    g.players[1].researched.add('titanium');
    expect(hit(tr)).toBe(Math.max(0.5, t0 - 2));
  });
});

describe('combat', () => {
  it('shields absorb before hp, armor applies to hp damage', () => {
    const g = mk('aethel', 'directorate');
    const c = freeSpot(g);
    const v = unit(g, 0, 'vindicator', c.x, c.y);
    g.applyDamage(v, 30);
    expect(v.shields).toBe(20);
    expect(v.hp).toBe(100);
    g.applyDamage(v, 30); // 20 shield, 10 - 1 armor = 9
    expect(v.shields).toBe(0);
    expect(v.hp).toBe(91);
  });
  it('shields regenerate after 7s out of combat, kyrrh regenerate hp', () => {
    const g = mk('aethel', 'kyrrh');
    const c = freeSpot(g);
    const v = unit(g, 0, 'vindicator', c.x, c.y);
    const k = unit(g, 1, 'carapid', c.x + 20, c.y);
    g.applyDamage(v, 40);
    g.applyDamage(k, 60);
    run(g, 5);
    expect(v.shields).toBe(10);
    run(g, 5);
    expect(v.shields).toBeGreaterThan(10);
    expect(k.hp).toBeGreaterThan(145 - 59 + 5);
  });
  it('bonus damage vs armored', () => {
    const g = mk('directorate', 'kyrrh');
    const c = freeSpot(g);
    const b = unit(g, 0, 'breacher', c.x, c.y);
    const light = unit(g, 1, 'skitterling', c.x + 3, c.y);
    const arm = unit(g, 1, 'carapid', c.x + 3, c.y + 3);
    (g as any).fire(b, light, DEFS.breacher.weapon);
    (g as any).fire(b, arm, DEFS.breacher.weapon);
    expect(light.hp).toBe(25);
    expect(arm.hp).toBe(145 - 19);
  });
  it('ground-only weapons cannot hit air', () => {
    const g = mk('kyrrh', 'directorate');
    const c = freeSpot(g);
    const s = unit(g, 0, 'skitterling', c.x, c.y);
    const wasp = unit(g, 1, 'wasp', c.x + 1, c.y);
    expect(g.canTarget(s, wasp)).toBe(false);
    const q = unit(g, 0, 'quillback', c.x, c.y + 2);
    expect(g.canTarget(q, wasp)).toBe(true);
  });
  it('units auto-acquire, fight, and die; kills are counted', () => {
    const g = mk('directorate', 'kyrrh');
    const c = freeSpot(g);
    const troopers = Array.from({ length: 6 }, (_, i) => unit(g, 0, 'trooper', c.x - 3, c.y - 2 + i * 0.8));
    const lings = Array.from({ length: 4 }, (_, i) => unit(g, 1, 'skitterling', c.x + 5, c.y - 1 + i * 0.8));
    run(g, 15);
    const aliveT = troopers.filter(t => t.alive).length;
    const aliveL = lings.filter(l => l.alive).length;
    expect(aliveL).toBe(0);
    expect(aliveT).toBeGreaterThan(0);
    expect(g.players[0].stats.kills).toBe(4);
  });
  it('attack-move engages enemies en route', () => {
    const g = mk('aethel', 'kyrrh');
    const c = freeSpot(g);
    const s = unit(g, 0, 'seeker', c.x - 6, c.y);
    const enemy = unit(g, 1, 'grub', c.x + 2, c.y);
    g.issue({ c: 'amove', ids: [s.id], x: c.x + 12, y: c.y }, 0);
    run(g, 12);
    expect(enemy.alive).toBe(false);
  });
  it('splash hits clustered enemies', () => {
    const g = mk('directorate', 'kyrrh');
    const c = freeSpot(g);
    const j = unit(g, 0, 'juggernaut', c.x - 8, c.y);
    j.sieged = true;
    const group = Array.from({ length: 4 }, (_, i) => unit(g, 1, 'skitterling', c.x + (i % 2) * 0.5, c.y + Math.floor(i / 2) * 0.5));
    group.forEach(u => { u.hp = u.maxHp = 1000; });
    run(g, 0.2);
    const damaged = group.filter(u => u.hp < 1000).length;
    expect(damaged).toBeGreaterThanOrEqual(3);
  });
  it('siege mode: transition, range and immobility', () => {
    const g = mk('directorate', 'kyrrh');
    const c = freeSpot(g);
    const j = unit(g, 0, 'juggernaut', c.x, c.y);
    g.issue({ c: 'ability', ids: [j.id], ability: 'siege' }, 0);
    run(g, 3);
    expect(j.sieged).toBe(true);
    g.issue({ c: 'move', ids: [j.id], x: c.x + 5, y: c.y }, 0);
    run(g, 1);
    expect(Math.hypot(j.x - c.x, j.y - c.y)).toBeLessThan(0.3);
    expect(g.weaponOf(j)!.range).toBe(13);
    g.issue({ c: 'ability', ids: [j.id], ability: 'unsiege' }, 0);
    run(g, 3);
    expect(j.sieged).toBe(false);
  });
  it('overdrive, phase step and solar lance', () => {
    const g = mk('directorate', 'aethel');
    const c = freeSpot(g);
    const t = unit(g, 0, 'trooper', c.x, c.y);
    g.issue({ c: 'ability', ids: [t.id], ability: 'overdrive' }, 0);
    expect(t.overdrive).toBe(0); // research required
    g.players[0].researched.add('overdrive');
    g.issue({ c: 'ability', ids: [t.id], ability: 'overdrive' }, 0);
    expect(t.overdrive).toBe(11);
    expect(t.hp).toBe(35);
    expect(g.speedOf(t)).toBeCloseTo(2.25 * 1.5);

    const s = unit(g, 1, 'seeker', c.x + 10, c.y + 5);
    g.players[1].researched.add('phasestep');
    g.issue({ c: 'ability', ids: [s.id], ability: 'phase', x: c.x + 10, y: c.y + 12 }, 1);
    expect(s.y).toBeGreaterThan(c.y + 11);
    expect(s.phaseCd).toBe(10);

    const d = unit(g, 0, 'dreadnought', c.x - 5, c.y - 5);
    const victim = unit(g, 1, 'strider', c.x - 5, c.y + 3);
    victim.hp = victim.maxHp = 1000; victim.shields = 0;
    g.issue({ c: 'ability', ids: [d.id], ability: 'solarlance', target: victim.id }, 0);
    run(g, 2.2);
    expect(victim.hp).toBeLessThanOrEqual(1000 - 239);
    expect(d.lanceCd).toBeGreaterThan(60);
  });
  it('matron spawn brood adds 3 larva', () => {
    const g = mk('kyrrh', 'directorate');
    const nest = g.unitsOf(0, e => e.def?.id === 'nest')[0];
    const m = unit(g, 0, 'matron', nest.x, nest.y + 4);
    m.energy = 30;
    g.issue({ c: 'ability', ids: [m.id], ability: 'spawnbrood', target: nest.id }, 0);
    run(g, 3);
    expect(nest.broodTimer).toBeGreaterThan(0);
    const l = nest.larva;
    run(g, 29);
    expect(nest.larva).toBeGreaterThanOrEqual(l + 3);
  });
  it('mender heals bio units', () => {
    const g = mk('directorate', 'kyrrh');
    const c = freeSpot(g);
    const m = unit(g, 0, 'mender', c.x, c.y);
    const t = unit(g, 0, 'trooper', c.x + 1, c.y);
    t.hp = 10;
    run(g, 2);
    expect(t.hp).toBeGreaterThan(30);
    expect(m.energy).toBeLessThan(75);
  });
});

describe('movement & fog', () => {
  it('ground units path across the map and do not stack', () => {
    const g = mk('aethel', 'kyrrh');
    const units = Array.from({ length: 10 }, (_, i) => unit(g, 0, 'vindicator', 30 + (i % 5), 100 + Math.floor(i / 5)));
    const goal = { x: g.map.w / 2, y: g.map.h / 2 };
    g.issue({ c: 'move', ids: units.map(u => u.id), x: goal.x, y: goal.y }, 0);
    run(g, 45);
    for (const u of units) expect(Math.hypot(u.x - goal.x, u.y - goal.y)).toBeLessThan(4);
    for (const u of units) expect(u.orders.length).toBe(0);
    for (const a of units) for (const b of units) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.5);
    for (const u of units) expect(g.tileFree(Math.floor(u.x), Math.floor(u.y))).toBe(true);
  });
  it('fog: enemy base hidden at start, revealed by scouting', () => {
    const g = mk();
    const enemyMain = g.unitsOf(1, e => e.isBuilding)[0];
    expect(g.isVisibleTo(0, enemyMain)).toBe(false);
    const w = g.unitsOf(0, e => !!e.def?.worker)[0];
    g.issue({ c: 'move', ids: [w.id], x: enemyMain.x - 6, y: enemyMain.y + 6 }, 0);
    run(g, 90);
    expect(g.isVisibleTo(0, enemyMain)).toBe(true);
    expect(enemyMain.seenMask & 1).toBe(1);
  });
});

describe('AI & full games', () => {
  const matchups: [Race, Race][] = [['directorate', 'kyrrh'], ['kyrrh', 'aethel'], ['aethel', 'directorate'], ['directorate', 'directorate']];
  for (const [a, b] of matchups) {
    it(`AI ${a} vs AI ${b} plays to a finish`, () => {
      const g = new Game({ seed: 11, players: [{ race: a, ai: 'hard' }, { race: b, ai: 'hard' }] });
      attachAI(g);
      let maxArmy = 0, maxBuildings = 0;
      const minutes = 28;
      for (let t = 0; t < minutes * 60 * 20 && !g.over; t++) {
        g.step();
        if (t % 200 === 0) {
          maxArmy = Math.max(maxArmy, g.entities.filter(e => e.alive && e.type === 'unit' && !e.def!.worker).length);
          maxBuildings = Math.max(maxBuildings, g.entities.filter(e => e.alive && e.isBuilding).length);
        }
        g.events.length = 0;
      }
      expect(maxArmy).toBeGreaterThan(15);
      expect(maxBuildings).toBeGreaterThan(12);
      expect(g.over).toBe(true);
      expect(g.winner).toBeGreaterThanOrEqual(0);
    });
  }
  it('is deterministic for a seed', () => {
    const play = () => {
      const g = new Game({ seed: 5, players: [{ race: 'aethel', ai: 'normal' }, { race: 'kyrrh', ai: 'normal' }] });
      attachAI(g);
      for (let i = 0; i < 20 * 60 * 4; i++) { g.step(); g.events.length = 0; }
      return JSON.stringify(g.players.map(p => [p.minerals, p.gas, p.supplyUsed, p.stats]));
    };
    expect(play()).toBe(play());
  });
});
