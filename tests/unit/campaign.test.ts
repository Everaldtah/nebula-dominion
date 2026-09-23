import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { attachAI, AIController } from '../../src/sim/ai';
import { MISSIONS, unlocked } from '../../src/campaign/missions';
import { CampaignController } from '../../src/campaign/controller';
import { DEFS } from '../../src/sim/data';

function setupMission(id: string) {
  const m = MISSIONS.find(x => x.id === id)!;
  const g = new Game({ seed: m.seed, players: [{ race: m.race }, { race: m.enemy, ai: m.difficulty }] });
  attachAI(g);
  const log: string[] = [];
  let result = '';
  const c = new CampaignController(m, g, { say: l => log.push(l.text), objectives: () => {}, win: () => { result = 'win'; }, lose: r => { result = 'lose:' + r; } });
  c.setup();
  const tick = (sec: number) => { for (let i = 0; i < sec * 20; i++) { g.step(); g.events.length = 0; if (i % 10 === 0) c.update(0.5); } };
  return { m, g, c, log, tick, result: () => result };
}

describe('campaign', () => {
  it('has 9 missions in 3 acts, all referencing valid units and structures', () => {
    expect(MISSIONS.length).toBe(9);
    for (const m of MISSIONS) {
      for (const b of [...(m.bans ?? []), ...(m.enemyBans ?? []), ...(m.start?.buildings ?? []), ...(m.protect ?? [])]) expect(DEFS[b], `${m.id}: ${b}`).toBeDefined();
      for (const [u] of [...(m.start?.units ?? []), ...(m.waves ?? []).flatMap(w => w.units)]) expect(DEFS[u], `${m.id}: ${u}`).toBeDefined();
      for (const o of m.objectives) if (o.type === 'have') expect(DEFS[o.id]).toBeDefined();
    }
    expect(unlocked(MISSIONS[0], new Set())).toBe(true);
    expect(unlocked(MISSIONS[1], new Set())).toBe(false);
    expect(unlocked(MISSIONS[1], new Set(['m1']))).toBe(true);
  });
  it('mission setup applies resources, bans, starting army and buildings, passive AI', () => {
    const { g } = setupMission('m2');
    expect(g.players[0].minerals).toBe(400);
    expect(g.players[0].banned.has('skyport')).toBe(true);
    expect(g.reqsMet(0, DEFS.skyport)).toBe(false);
    expect(g.countOf(0, 'trooper')).toBe(8);
    expect(g.hasBuilt(0, 'musterhall')).toBe(true);
    expect(g.hasBuilt(0, 'arsenal')).toBe(true);
    expect((g.controllers.find(x => (x as AIController).pid === 1) as AIController).passive).toBe(true);
    g.events.length = 0;
    g.issue({ c: 'build', ids: [g.unitsOf(0, e => !!e.def?.worker)[0].id], bType: 'skyport', tx: 30, ty: 100 }, 0);
    expect(g.events.some(e => e.t === 'msg' && e.text === 'Not available in this mission')).toBe(true);
  });
  it('survival mission: scripted waves attack and the timer completes the mission', () => {
    const { g, c, tick, result, log } = setupMission('m2');
    tick(65);
    const enemyArmy = g.unitsOf(1, e => e.type === 'unit' && !e.def!.worker);
    expect(enemyArmy.length).toBeGreaterThan(4); // first wave spawned
    expect(enemyArmy.some(u => u.orders[0]?.type === 'amove')).toBe(true);
    expect(log.length).toBeGreaterThan(0); // comms fired
    c.elapsed = 419;
    tick(2);
    expect(result()).toBe('win');
  });
  it('protect objective: losing the main base fails the mission', () => {
    const { g, tick, result } = setupMission('m2');
    for (const e of g.entities) if (e.alive && e.owner === 0 && e.def?.id === 'bastion') g.kill(e, 1);
    tick(1);
    expect(result()).toMatch(/^lose/);
  });
  it('multi-objective mission completes only when every primary objective is done', () => {
    const { g, c, tick, result } = setupMission('m1');
    for (const e of g.entities) if (e.alive && e.owner === 1 && e.isBuilding) g.kill(e, 0);
    tick(1);
    expect(result()).toBe(''); // troopers not trained yet (engine ends the game separately)
    const main = g.unitsOf(0, e => !!e.def?.dropoff)[0];
    for (let i = 0; i < 6; i++) g.spawnUnitNear(main, 'trooper');
    c.update(1);
    expect(result()).toBe('win');
  });
});
