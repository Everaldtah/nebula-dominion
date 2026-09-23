// Runs a campaign mission on top of a normal Game: setup, objectives, scripted waves and dialogue.
import { DEFS } from '../sim/data';
import { AIController } from '../sim/ai';
import type { Game } from '../sim/game';
import type { Line, Mission, Objective } from './missions';

export interface CampaignHooks {
  say(line: Line): void;
  objectives(html: string): void;
  win(): void;
  lose(reason: string): void;
}

export class CampaignController {
  elapsed = 0;
  done = new Set<number>();
  private waveNext: number[];
  private waveCount: number[];
  private fired = new Set<number>();
  private check = 0;
  finished = false;
  constructor(public m: Mission, public g: Game, private hooks: CampaignHooks, public me = 0, public foe = 1) {
    this.waveNext = (m.waves ?? []).map(w => w.from);
    this.waveCount = (m.waves ?? []).map(() => 0);
  }

  setup() {
    const g = this.g, m = this.m, p = g.players[this.me], e = g.players[this.foe];
    if (m.start?.minerals !== undefined) p.minerals = m.start.minerals;
    if (m.start?.gas !== undefined) p.gas = m.start.gas;
    for (const b of m.bans ?? []) p.banned.add(b);
    for (const b of m.enemyBans ?? []) e.banned.add(b);
    const placer = new AIController(g, this.me, 'normal');
    for (const id of m.start?.buildings ?? []) {
      const spot = placer.findSpot(id);
      if (spot) g.spawnBuilding(this.me, id, spot.tx, spot.ty, true);
    }
    const main = g.unitsOf(this.me, x => !!x.def?.dropoff)[0];
    for (const [id, n] of m.start?.units ?? []) for (let i = 0; i < n; i++) g.spawnUnitNear(main, id);
    const foePlacer = new AIController(g, this.foe, 'normal');
    for (const id of m.start?.enemyBuildings ?? []) { const s = foePlacer.findSpot(id); if (s) g.spawnBuilding(this.foe, id, s.tx, s.ty, true); }
    const emain = g.unitsOf(this.foe, x => !!x.def?.dropoff)[0];
    for (const [id, n] of m.start?.enemyUnits ?? []) for (let i = 0; i < n; i++) g.spawnUnitNear(emain, id);
    const ai = g.controllers.find(c => (c as AIController).pid === this.foe) as AIController | undefined;
    if (ai && m.enemyPassive) ai.passive = true;
    g.updateCreep(); g.updateSupply();
    this.render();
  }

  private objectiveDone(o: Objective): boolean {
    const g = this.g;
    switch (o.type) {
      case 'destroyAll': return !g.players[this.foe].alive;
      case 'destroy': return !g.entities.some(x => x.alive && x.owner === this.foe && o.targets.includes(x.def?.id ?? ''));
      case 'survive': return this.elapsed >= o.seconds;
      case 'have': return g.countOf(this.me, o.id, false) >= o.count;
      case 'tier': return g.tierOf(this.me) >= o.n;
      case 'gather': return g.players[this.me].stats.minerals >= o.minerals;
    }
  }

  update(dt: number) {
    if (this.finished) return;
    const g = this.g, m = this.m;
    this.elapsed += dt;
    // dialogue events
    (m.events ?? []).forEach((ev, i) => { if (!this.fired.has(i) && this.elapsed >= ev.at) { this.fired.add(i); this.hooks.say(ev); } });
    // scripted waves
    (m.waves ?? []).forEach((w, i) => {
      if (this.elapsed < this.waveNext[i] || this.elapsed > w.until) return;
      this.waveNext[i] += w.every;
      this.spawnWave(w.units, 1 + (w.grow ?? 0) * this.waveCount[i]++);
    });
    this.check -= dt;
    if (this.check > 0) return;
    this.check = 0.5;
    m.objectives.forEach((o, i) => { if (!this.done.has(i) && this.objectiveDone(o)) this.done.add(i); });
    this.render();
    if (m.protect && !g.entities.some(x => x.alive && x.owner === this.me && m.protect!.includes(x.def?.id ?? ''))) {
      this.finished = true; this.hooks.lose('The structure you had to protect was destroyed.'); return;
    }
    if (!g.players[this.me].alive) { this.finished = true; this.hooks.lose('Your forces were annihilated.'); return; }
    const primaries = m.objectives.map((o, i) => [o, i] as const).filter(([o]) => !o.optional);
    if (primaries.every(([, i]) => this.done.has(i))) { this.finished = true; this.hooks.win(); }
  }

  private spawnWave(units: [string, number][], scale: number) {
    const g = this.g;
    const src = g.unitsOf(this.foe, x => !!x.def?.dropoff)[0] ?? g.unitsOf(this.foe, x => x.isBuilding)[0];
    const dst = g.unitsOf(this.me, x => !!x.def?.dropoff)[0] ?? g.unitsOf(this.me, x => x.isBuilding)[0];
    if (!src || !dst) return;
    const ids: number[] = [];
    for (const [id, n] of units) {
      if (!DEFS[id]) continue;
      const count = Math.max(1, Math.round(n * scale));
      for (let i = 0; i < count; i++) ids.push(g.spawnUnitNear(src, id).id);
    }
    g.issue({ c: 'amove', ids, x: dst.x, y: dst.y }, this.foe);
  }

  render() {
    const m = this.m;
    const rows = m.objectives.map((o, i) => {
      const ok = this.done.has(i);
      let extra = '';
      if (o.type === 'survive' && !ok) { const left = Math.max(0, o.seconds - this.elapsed); extra = ` <b>${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b>`; }
      if (o.type === 'have' && !ok) extra = ` <b>${Math.min(o.count, this.g.countOf(this.me, o.id, false))}/${o.count}</b>`;
      return `<li class="${ok ? 'ok' : ''} ${o.optional ? 'opt' : ''}">${ok ? '✔' : o.optional ? '◇' : '◆'} ${o.label}${extra}</li>`;
    });
    this.hooks.objectives(`<div class="obj-title">${m.title}</div><ul>${rows.join('')}</ul>`);
  }
}
