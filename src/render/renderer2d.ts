import { DEFS } from '../sim/data';
import { DT } from '../sim/data';
import type { Entity, Game } from '../sim/game';
import { drawBuilding, drawGeyser, drawMineral, TILE, UNIT_ART } from './sprites';
import { TerrainRenderer } from './terrain';

export interface Camera { x: number; y: number; zoom: number; w: number; h: number }
export interface Ghost { defId: string; tx: number; ty: number; valid: boolean }
export interface ViewState {
  cam: Camera;
  me: number;
  selected: Set<number>;
  hover: number;
  drag: { x0: number; y0: number; x1: number; y1: number } | null;
  ghost: Ghost | null;
  markers: { x: number; y: number; t: number; color: string }[];
  targeting: string | null;
}

export class Renderer2D {
  terrain: TerrainRenderer;
  private fog: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private fogImg: ImageData;
  private creep: HTMLCanvasElement;
  private creepCtx: CanvasRenderingContext2D;
  private creepImg: ImageData;
  private frame = 0;
  time = 0;
  dpr = 1;

  constructor(public c: CanvasRenderingContext2D, public game: Game) {
    this.terrain = new TerrainRenderer(game.map);
    const { w, h } = game.map;
    this.fog = document.createElement('canvas'); this.fog.width = w; this.fog.height = h;
    this.fogCtx = this.fog.getContext('2d')!;
    this.fogImg = this.fogCtx.createImageData(w, h);
    this.creep = document.createElement('canvas'); this.creep.width = w; this.creep.height = h;
    this.creepCtx = this.creep.getContext('2d')!;
    this.creepImg = this.creepCtx.createImageData(w, h);
  }

  private updateFog(me: number) {
    const g = this.game, vis = g.visible[me], exp = g.explored[me], d = this.fogImg.data;
    for (let i = 0; i < vis.length; i++) {
      d[i * 4] = 4; d[i * 4 + 1] = 6; d[i * 4 + 2] = 12;
      d[i * 4 + 3] = vis[i] ? 0 : exp[i] ? 150 : 245;
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
  }
  private updateCreep() {
    const cr = this.game.creep, d = this.creepImg.data;
    for (let i = 0; i < cr.length; i++) {
      const on = cr[i] !== 0;
      d[i * 4] = 92; d[i * 4 + 1] = 30; d[i * 4 + 2] = 86; d[i * 4 + 3] = on ? 175 : 0;
    }
    this.creepCtx.putImageData(this.creepImg, 0, 0);
  }

  render(v: ViewState, dt: number) {
    const c = this.c, g = this.game, cam = v.cam, me = v.me;
    this.time += dt;
    this.frame++;
    const t = this.time;
    if (this.frame % 3 === 1) this.updateFog(me);
    if (this.frame % 15 === 1) this.updateCreep();

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#05070d';
    c.fillRect(0, 0, cam.w, cam.h);
    const z = cam.zoom * this.dpr;
    c.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z);
    const x0 = cam.x, y0 = cam.y, x1 = cam.x + cam.w / cam.zoom, y1 = cam.y + cam.h / cam.zoom;
    const inView = (x: number, y: number, r: number) => x * TILE + r * TILE > x0 && x * TILE - r * TILE < x1 && y * TILE + r * TILE > y0 && y * TILE - r * TILE < y1;

    this.terrain.draw(c, x0, y0, x1, y1);
    // creep
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 0.85 + 0.1 * Math.sin(t * 1.3);
    c.drawImage(this.creep, 0, 0, g.map.w * TILE, g.map.h * TILE);
    c.globalAlpha = 1;

    // power fields
    const sel = [...v.selected].map(id => g.get(id)).filter(Boolean) as Entity[];
    const showPower = (v.ghost && DEFS[v.ghost.defId].needsPower) || (v.ghost?.defId === 'obelisk') || sel.some(e => e.def?.id === 'obelisk');
    if (showPower) {
      for (const e of g.entities) {
        if (!e.alive || e.owner !== me || !e.def?.powerRadius || !e.built) continue;
        c.beginPath(); c.arc(e.x * TILE, e.y * TILE, e.def.powerRadius * TILE, 0, Math.PI * 2);
        c.fillStyle = 'rgba(94,240,255,0.10)'; c.fill();
        c.strokeStyle = 'rgba(94,240,255,0.5)'; c.lineWidth = 2; c.stroke();
      }
    }

    // resources
    for (const e of g.entities) {
      if (!e.alive || (e.type !== 'mineral' && e.type !== 'geyser')) continue;
      if (!inView(e.x, e.y, 3)) continue;
      if (!(e.seenMask & (1 << me)) && !g.explored[me][Math.floor(e.y) * g.map.w + Math.floor(e.x)]) continue;
      if (e.type === 'mineral') drawMineral(c, e.tx * TILE, e.ty * TILE, e.amount, e.id, t);
      else if (!g.get(e.gasBuilding)) drawGeyser(c, e.tx * TILE, e.ty * TILE, t, e.amount);
    }

    // selection circles for buildings + buildings
    for (const e of g.entities) {
      if (!e.alive || !e.isBuilding || !inView(e.x, e.y, e.w)) continue;
      if (e.owner !== me && !(e.seenMask & (1 << me))) continue;
      const def = e.def!;
      if (v.selected.has(e.id) || v.hover === e.id) {
        c.strokeStyle = e.owner === me ? '#3dff6e' : '#ff4040';
        c.lineWidth = v.selected.has(e.id) ? 2 : 1;
        c.beginPath(); c.ellipse(e.x * TILE, e.y * TILE + 2, e.w * TILE * 0.62, e.w * TILE * 0.5, 0, 0, Math.PI * 2); c.stroke();
      }
      if (def.gas) { const gy = g.get(e.geyser); if (gy) drawGeyser(c, e.tx * TILE, e.ty * TILE, t, gy.amount); }
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(e.tx * TILE + 4, e.ty * TILE + 6, e.w * TILE, e.h * TILE);
      drawBuilding(c, def.id, def.race, e.tx * TILE, e.ty * TILE, def.size, g.players[e.owner].color, {
        t: t + e.id, progress: e.progress, built: e.built, working: e.queue.length > 0 || e.eggs.length > 0, powered: e.powered, seed: e.id % 7,
        larva: e.larva, eggs: e.eggs.length, broodPulse: e.broodTimer > 0,
      });
      if (e.hp < e.maxHp * 0.35 && e.built) this.smoke(e.x, e.y, t + e.id, def.race);
    }

    // units: ground then air
    const ground: Entity[] = [], air: Entity[] = [];
    for (const e of g.entities) {
      if (!e.alive || e.type !== 'unit' || e.hidden) continue;
      if (!inView(e.x, e.y, e.radius + 1)) continue;
      if (e.owner !== me && !g.isVisibleTo(me, e)) continue;
      (e.isAir ? air : ground).push(e);
    }
    ground.sort((a, b) => a.y - b.y);
    for (const e of ground) this.drawUnit(e, v, t);
    // heal beams / channel beams
    for (const e of [...ground, ...air]) {
      if (e.healTarget) {
        const h = g.get(e.healTarget);
        if (h) { c.strokeStyle = `rgba(60,255,140,${0.5 + 0.3 * Math.sin(t * 20)})`; c.lineWidth = 2; c.beginPath(); c.moveTo(e.x * TILE, e.y * TILE); c.lineTo(h.x * TILE, h.y * TILE); c.stroke(); }
      }
    }
    for (const e of air) {
      // shadow
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath(); c.ellipse(e.x * TILE + 10, e.y * TILE + 22, e.radius * TILE * 0.9, e.radius * TILE * 0.5, 0, 0, Math.PI * 2); c.fill();
    }
    air.sort((a, b) => a.y - b.y);
    for (const e of air) this.drawUnit(e, v, t, -12);

    // rally lines of selected own buildings
    for (const e of sel) {
      if (e.owner !== me || !e.isBuilding || !e.rally) continue;
      c.setLineDash([6, 6]); c.strokeStyle = 'rgba(80,255,120,0.7)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(e.x * TILE, e.y * TILE); c.lineTo(e.rally.x * TILE, e.rally.y * TILE); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#50ff78'; c.beginPath(); c.arc(e.rally.x * TILE, e.rally.y * TILE, 4, 0, Math.PI * 2); c.fill();
    }
    // waypoint lines for selected own units
    for (const e of sel) {
      if (e.owner !== me || e.type !== 'unit' || !e.orders.length) continue;
      c.strokeStyle = 'rgba(80,255,120,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(e.x * TILE, e.y * TILE);
      for (const o of e.orders) {
        let px = o.x, py = o.y;
        if (o.target) { const tt = g.get(o.target); if (tt) { px = tt.x; py = tt.y; } }
        if (o.type === 'build' && o.tx !== undefined) { px = o.tx + DEFS[o.bType!].size / 2; py = o.ty! + DEFS[o.bType!].size / 2; }
        if (px === undefined || py === undefined) continue;
        c.lineTo(px * TILE, py * TILE);
      }
      c.stroke();
    }

    // bars
    for (const e of g.entities) {
      if (!e.alive || !e.def || e.hidden || e.type === 'mineral' || e.type === 'geyser') continue;
      const show = v.selected.has(e.id) || v.hover === e.id || e.hp < e.maxHp || (e.maxShields && e.shields < e.maxShields) || (e.isBuilding && !e.built) || (e.isBuilding && e.queue.length);
      if (!show) continue;
      if (e.type === 'unit' && e.owner !== me && !g.isVisibleTo(me, e)) continue;
      if (e.isBuilding && e.owner !== me && !(e.seenMask & (1 << me))) continue;
      const r = e.isRect ? e.w / 2 : e.radius;
      if (!inView(e.x, e.y, r + 1)) continue;
      this.bars(e, r, e.isAir ? -12 : 0, me);
    }

    // fog
    c.imageSmoothingEnabled = true;
    c.drawImage(this.fog, 0, 0, g.map.w * TILE, g.map.h * TILE);

    // ghost
    if (v.ghost) {
      const def = DEFS[v.ghost.defId];
      const gx = v.ghost.tx * TILE, gy = v.ghost.ty * TILE, s = def.size;
      c.globalAlpha = 0.55;
      drawBuilding(c, def.id, def.race, gx, gy, s, g.players[me].color, { t, progress: 1, built: true, working: false, powered: true, seed: 1 });
      c.globalAlpha = 1;
      for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
        c.fillStyle = v.ghost.valid ? 'rgba(60,255,110,0.25)' : 'rgba(255,50,50,0.35)';
        c.fillRect(gx + xx * TILE + 1, gy + yy * TILE + 1, TILE - 2, TILE - 2);
      }
      if (def.powerRadius) { c.beginPath(); c.arc(gx + s * TILE / 2, gy + s * TILE / 2, def.powerRadius * TILE, 0, Math.PI * 2); c.strokeStyle = 'rgba(94,240,255,0.7)'; c.lineWidth = 2; c.stroke(); }
      if (def.weapon) { c.beginPath(); c.arc(gx + s * TILE / 2, gy + s * TILE / 2, (def.weapon.range + s / 2) * TILE, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,90,90,0.5)'; c.lineWidth = 1; c.stroke(); }
    }

    // click markers
    for (const m of v.markers) {
      const k = m.t / 0.5;
      c.strokeStyle = m.color; c.globalAlpha = 1 - k; c.lineWidth = 2;
      c.beginPath(); c.ellipse(m.x * TILE, m.y * TILE, 14 * (1 - k * 0.6), 9 * (1 - k * 0.6), 0, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }

    // drag box (screen space)
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (v.drag) {
      const { x0: a, y0: b, x1: cc, y1: d } = v.drag;
      c.strokeStyle = '#3dff6e'; c.lineWidth = 1; c.fillStyle = 'rgba(61,255,110,0.08)';
      c.fillRect(Math.min(a, cc), Math.min(b, d), Math.abs(cc - a), Math.abs(d - b));
      c.strokeRect(Math.min(a, cc) + 0.5, Math.min(b, d) + 0.5, Math.abs(cc - a), Math.abs(d - b));
    }
  }

  private smoke(x: number, y: number, t: number, race: string) {
    const c = this.c;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.5 + i / 3) % 1;
      c.globalAlpha = (1 - ph) * 0.4;
      c.fillStyle = race === 'kyrrh' ? '#7a3a2a' : race === 'aethel' ? '#8fe8ff' : '#333';
      c.beginPath(); c.arc(x * TILE + Math.sin(i * 2 + t) * 8, y * TILE - ph * 40, 6 + ph * 12, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  private drawUnit(e: Entity, v: ViewState, t: number, lift = 0) {
    const c = this.c, g = this.game;
    const px = e.x * TILE, py = e.y * TILE + lift + (e.isAir ? Math.sin(t * 2 + e.id) * 2 : 0);
    const r = e.radius * TILE;
    if (v.selected.has(e.id) || v.hover === e.id) {
      c.strokeStyle = e.owner === v.me ? '#3dff6e' : e.owner < 0 ? '#ffe04a' : '#ff4040';
      c.lineWidth = v.selected.has(e.id) ? 2 : 1;
      c.beginPath(); c.ellipse(px, e.y * TILE + r * 0.35, r * 1.15, r * 0.8, 0, 0, Math.PI * 2); c.stroke();
    }
    const art = UNIT_ART[e.def!.id];
    c.save();
    c.translate(px, py);
    c.rotate(e.facing);
    const flash = g.tick - e.lastHit < 3;
    art?.(c, r, g.players[e.owner]?.color ?? '#ccc', {
      t: t + e.id * 0.37, moving: e.moving, attacking: e.attackAnim > 0.05, sieged: e.sieged, transition: e.transition,
      carry: e.carry ? e.carryType : null, working: !!e.constructing || (e.orders[0]?.type === 'gather' && e.orders[0].phase === 'mining'),
      seed: e.id, overdrive: e.overdrive > 0, channel: !!e.channel,
    });
    c.restore();
    if (flash && e.shields > 0) {
      c.strokeStyle = 'rgba(120,200,255,0.8)'; c.lineWidth = 2;
      c.beginPath(); c.arc(px, py, r * 1.2, 0, Math.PI * 2); c.stroke();
    }
    if (e.bornTick > g.tick - 12) { c.globalAlpha = 1 - (g.tick - e.bornTick) / 12; c.fillStyle = '#fff'; c.beginPath(); c.arc(px, py, r * 1.3, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    void DT;
  }

  private bars(e: Entity, r: number, lift: number, me: number) {
    const c = this.c;
    const w = Math.max(22, r * 2 * TILE * 0.9);
    const x = e.x * TILE - w / 2;
    let y = (e.isRect ? e.ty * TILE - 8 : e.y * TILE - r * TILE - 9) + lift;
    const frac = e.hp / e.maxHp;
    const col = e.owner !== me ? (frac > 0.5 ? '#ff5a5a' : '#ff2020') : frac > 0.6 ? '#3dff6e' : frac > 0.3 ? '#ffd23d' : '#ff3d3d';
    if (e.maxShields) {
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(x - 1, y - 5, w + 2, 4);
      c.fillStyle = '#4ab8ff'; c.fillRect(x, y - 4, w * (e.shields / e.maxShields), 2);
    }
    c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(x - 1, y - 1, w + 2, 5);
    c.fillStyle = col; c.fillRect(x, y, w * frac, 3);
    y += 4;
    if (e.def!.energy && e.owner === me) {
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(x - 1, y, w + 2, 4);
      c.fillStyle = '#d06aff'; c.fillRect(x, y + 1, w * (e.energy / e.def!.energy), 2);
      y += 4;
    }
    if (e.isBuilding && e.owner === me) {
      let p = -1;
      if (!e.built) p = e.progress;
      else if (e.queue[0]) p = e.queue[0].progress / e.queue[0].total;
      if (p >= 0) { c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(x - 1, y, w + 2, 4); c.fillStyle = '#ffe07a'; c.fillRect(x, y + 1, w * p, 2); }
    }
  }
}
