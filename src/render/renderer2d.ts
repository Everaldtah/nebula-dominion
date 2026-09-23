import { DEFS } from '../sim/data';
import { DT } from '../sim/data';
import type { Entity, Game } from '../sim/game';
import { drawBuilding, drawGeyser, drawMineral, TILE, UNIT_ART } from './sprites';
import { TerrainRenderer } from './terrain';
import { atlas } from './atlas';

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
  spectator?: boolean;
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
    if (this.frame % 3 === 1 && !v.spectator) this.updateFog(me);
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
      if (!v.spectator && !(e.seenMask & (1 << me)) && !g.explored[me][Math.floor(e.y) * g.map.w + Math.floor(e.x)]) continue;
      if (e.type === 'mineral') {
        if (atlas.has('mineral')) {
          const flip = e.id % 2 === 1;
          const k = 0.75 + 0.25 * Math.min(1, e.amount / 1500);
          c.save(); c.translate(e.x * TILE, e.y * TILE); c.scale(flip ? -k : k, k);
          atlas.draw(c, 'mineral', 0, 0, 0, 0, 0);
          c.restore();
        } else drawMineral(c, e.tx * TILE, e.ty * TILE, e.amount, e.id, t);
      } else if (!g.get(e.gasBuilding)) {
        if (!atlas.draw(c, 'geyser', e.x * TILE, e.y * TILE, 0, 0, 0)) drawGeyser(c, e.tx * TILE, e.ty * TILE, t, e.amount);
        if (e.amount > 0) this.vent(e.x, e.y, t + e.id);
      }
    }

    // buildings + ground units share one depth-sorted pass (3D sprites overlap)
    const drawables: { y: number; e: Entity }[] = [];
    const air: Entity[] = [];
    for (const e of g.entities) {
      if (!e.alive || !e.def || e.hidden) continue;
      if (e.isBuilding) {
        if (!inView(e.x, e.y, e.w)) continue;
        if (!v.spectator && e.owner !== me && !(e.seenMask & (1 << me))) continue;
        drawables.push({ y: e.ty + e.h - 0.35, e });
      } else if (e.type === 'unit') {
        if (!inView(e.x, e.y, e.radius + 2)) continue;
        if (!v.spectator && e.owner !== me && !g.isVisibleTo(me, e)) continue;
        if (e.isAir) air.push(e); else drawables.push({ y: e.y, e });
      }
    }
    // selection rings on the ground first
    for (const { e } of drawables) this.ring(e, v);
    drawables.sort((a, b) => a.y - b.y);
    for (const { e } of drawables) {
      if (e.isBuilding) this.drawBuildingEntity(e, t);
      else this.drawUnit(e, v, t);
    }
    // heal beams
    for (const { e } of drawables) {
      if (e.healTarget) {
        const h = g.get(e.healTarget);
        if (h) { c.strokeStyle = `rgba(60,255,140,${0.5 + 0.3 * Math.sin(t * 20)})`; c.lineWidth = 2; c.beginPath(); c.moveTo(e.x * TILE, e.y * TILE - 10); c.lineTo(h.x * TILE, h.y * TILE - 10); c.stroke(); }
      }
    }
    for (const e of air) {
      // ground shadow under the flyer
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.beginPath(); c.ellipse(e.x * TILE + 8, e.y * TILE + 6, e.radius * TILE * 0.95, e.radius * TILE * 0.55, 0, 0, Math.PI * 2); c.fill();
      this.ring(e, v);
    }
    air.sort((a, b) => a.y - b.y);
    for (const e of air) this.drawUnit(e, v, t, atlas.has(e.def!.id) ? 0 : -12);

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
      if (!v.spectator && e.type === 'unit' && e.owner !== me && !g.isVisibleTo(me, e)) continue;
      if (!v.spectator && e.isBuilding && e.owner !== me && !(e.seenMask & (1 << me))) continue;
      const r = e.isRect ? e.w / 2 : e.radius;
      if (!inView(e.x, e.y, r + 1)) continue;
      this.bars(e, r, e.isAir ? -12 : 0, me);
    }

    // fog
    c.imageSmoothingEnabled = true;
    if (!v.spectator) c.drawImage(this.fog, 0, 0, g.map.w * TILE, g.map.h * TILE);

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

  private ring(e: Entity, v: ViewState) {
    const c = this.c;
    if (!(v.selected.has(e.id) || v.hover === e.id)) return;
    const col = v.spectator ? (this.game.players[e.owner]?.color ?? '#ffe04a') : e.owner === v.me ? '#3dff6e' : e.owner < 0 ? '#ffe04a' : '#ff4040';
    c.strokeStyle = col;
    c.lineWidth = v.selected.has(e.id) ? 2 : 1;
    const rx = e.isRect ? e.w * TILE * 0.6 : e.radius * TILE * 1.2, ry = rx * 0.62;
    c.beginPath(); c.ellipse(e.x * TILE, e.isRect ? e.y * TILE + e.h * TILE * 0.12 : e.y * TILE, rx, ry, 0, 0, Math.PI * 2); c.stroke();
  }

  private drawBuildingEntity(e: Entity, t: number) {
    const c = this.c, g = this.game, def = e.def!;
    const team = Math.max(0, e.owner) % 2;
    const frame = Math.floor((t + e.id * 0.37) * 1.5);
    if (def.gas) { const gy = g.get(e.geyser); if (gy) { if (!atlas.draw(c, 'geyser', gy.x * TILE, gy.y * TILE, 0, 0, 0)) drawGeyser(c, e.tx * TILE, e.ty * TILE, t, gy.amount); } }
    if (atlas.has(def.id)) {
      const px = e.x * TILE, py = e.y * TILE;
      if (!e.built) {
        const p = e.progress;
        if (def.race === 'directorate') {
          atlas.draw(c, def.id, px, py, 0, 0, team, 0.9, Math.max(0.08, p));
          this.scaffold(e, p);
        } else if (def.race === 'kyrrh') {
          c.save(); c.translate(px, py); const k = 0.55 + 0.45 * p; c.scale(k, k);
          atlas.draw(c, def.id, 0, 0, 0, 0, team, 0.55 + 0.45 * p); c.restore();
          c.globalAlpha = 0.5 * (1 - p); c.fillStyle = '#5a2352'; c.beginPath(); c.ellipse(px, py, e.w * TILE * 0.5, e.w * TILE * 0.38, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
        } else {
          atlas.draw(c, def.id, px, py, 0, 0, team, 0.25 + 0.6 * p);
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = 0.35 + 0.15 * Math.sin(t * 6); c.fillStyle = '#5ef0ff';
          c.beginPath(); c.ellipse(px, py, e.w * TILE * 0.55, e.w * TILE * 0.42, 0, 0, Math.PI * 2); c.fill();
          c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        }
      } else {
        atlas.draw(c, def.id, px, py, 0, frame, team);
        if (def.race === 'aethel' && def.needsPower && !e.powered) {
          c.fillStyle = 'rgba(0,0,30,0.45)'; c.beginPath(); c.ellipse(px, py, e.w * TILE * 0.5, e.w * TILE * 0.4, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#ff5050'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillText('UNPOWERED', px, py);
        }
        if (def.larvaHost) this.larva(e, t);
      }
    } else {
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(e.tx * TILE + 4, e.ty * TILE + 6, e.w * TILE, e.h * TILE);
      drawBuilding(c, def.id, def.race, e.tx * TILE, e.ty * TILE, def.size, g.players[e.owner].color, {
        t: t + e.id, progress: e.progress, built: e.built, working: e.queue.length > 0 || e.eggs.length > 0, powered: e.powered, seed: e.id % 7,
        larva: e.larva, eggs: e.eggs.length, broodPulse: e.broodTimer > 0,
      });
    }
    if (e.hp < e.maxHp * 0.35 && e.built) this.smoke(e.x, e.y, t + e.id, def.race);
  }

  private scaffold(e: Entity, p: number) {
    const c = this.c;
    const x = e.tx * TILE, y = e.ty * TILE, w = e.w * TILE;
    c.strokeStyle = 'rgba(255,190,90,0.55)'; c.lineWidth = 1.2;
    const lift = w * 0.5 * p;
    for (let i = 0; i <= 4; i++) { const px = x + (i / 4) * w; c.beginPath(); c.moveTo(px, y + w); c.lineTo(px, y + w - lift - w * 0.35); c.stroke(); }
    for (let j = 0; j < 3; j++) { const py = y + w - (j / 2) * (lift + w * 0.35); c.beginPath(); c.moveTo(x, py); c.lineTo(x + w, py); c.stroke(); }
    if (Math.random() < 0.35) { c.fillStyle = '#fff3a0'; c.fillRect(x + Math.random() * w, y + w - Math.random() * (lift + 10), 2, 2); }
  }

  private larva(e: Entity, t: number) {
    const c = this.c;
    const cx = e.x * TILE, cy = e.y * TILE, r = e.w * TILE * 0.5;
    for (let i = 0; i < Math.min(e.larva, 19); i++) {
      const a = i * 2.39 + e.id, rr = r * 1.02 + (i % 3) * 4;
      const lx = cx + Math.cos(a) * rr, ly = cy + Math.sin(a) * rr * 0.7 + Math.sin(t * 5 + i) * 1.2;
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(lx + 1, ly + 2, 4, 2.2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d8c79a'; c.strokeStyle = '#6a5a3a'; c.lineWidth = 1;
      c.beginPath(); c.ellipse(lx, ly, 4.2, 2.5, a + Math.sin(t * 6 + i) * 0.4, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    for (let i = 0; i < Math.min(e.eggs.length, 19); i++) {
      const a = i * 2.39 + e.id + 1.2;
      const ex = cx + Math.cos(a) * r * 1.1, ey = cy + Math.sin(a) * r * 0.8;
      c.fillStyle = '#6a3a5e'; c.strokeStyle = '#2a1025'; c.beginPath(); c.ellipse(ex, ey - 3, 5, 6.5, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = `rgba(200,255,90,${0.25 + 0.2 * Math.sin(t * 4 + i)})`; c.beginPath(); c.arc(ex, ey - 4, 2.5, 0, Math.PI * 2); c.fill();
    }
  }

  private vent(x: number, y: number, t: number) {
    const c = this.c;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.35 + i / 3) % 1;
      c.globalAlpha = (1 - ph) * 0.25;
      c.fillStyle = '#9fe8b8';
      c.beginPath(); c.arc(x * TILE + Math.sin(i * 3 + t) * 6, y * TILE - 10 - ph * 34, 6 + ph * 14, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }

  private drawUnit(e: Entity, v: ViewState, t: number, lift = 0) {
    const c = this.c, g = this.game;
    const def = e.def!;
    const sid = def.id === 'juggernaut' && (e.sieged ? e.transition <= 1.35 : e.transition > 1.35) && atlas.has('juggernaut_sieged') ? 'juggernaut_sieged' : def.id;
    const team = Math.max(0, e.owner) % 2;
    const m = atlas.meta(sid);
    if (m) {
      const frame = m.air > 0 ? Math.floor((t + e.id * 0.31) * 5) : e.moving || e.curSpeed > 0.05 ? Math.floor(e.walkPhase / 1.35) : 0;
      const bob = m.air > 0 ? Math.sin(t * 2 + e.id) * 2 : 0;
      // team-coloured ground glow so sides stay readable whatever the model's palette
      const tc = this.teamGlow(g.players[e.owner]?.color ?? '#ffffff');
      const gr = e.radius * TILE * 1.25;
      c.globalAlpha = m.air > 0 ? 0.35 : 0.55;
      c.drawImage(tc, e.x * TILE - gr, e.y * TILE - gr * 0.62, gr * 2, gr * 1.24);
      c.globalAlpha = 1;
      atlas.draw(c, sid, e.x * TILE, e.y * TILE + bob, e.facing, frame, team);
      if (e.attackAnim > 0.05) this.flashAt(e.x * TILE + Math.cos(e.facing) * e.radius * TILE * 1.1, e.y * TILE - (m.air * TILE * 0.7 + m.height * TILE * 0.4) + Math.sin(e.facing) * e.radius * TILE * 0.8, def.race);
      if (e.overdrive > 0) { c.globalAlpha = 0.3; c.fillStyle = '#ff3030'; c.beginPath(); c.arc(e.x * TILE, e.y * TILE - 8, e.radius * TILE * 1.2, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
      if (e.channel) this.flashAt(e.x * TILE + Math.cos(e.facing) * 40, e.y * TILE - m.air * TILE * 0.7, 'directorate', 1.8);
    } else {
      const px = e.x * TILE, py = e.y * TILE + lift + (e.isAir ? Math.sin(t * 2 + e.id) * 2 : 0);
      const r = e.radius * TILE;
      const art = UNIT_ART[def.id];
      c.save();
      c.translate(px, py);
      c.rotate(e.facing);
      art?.(c, r, g.players[e.owner]?.color ?? '#ccc', {
        t: t + e.id * 0.37, moving: e.moving, attacking: e.attackAnim > 0.05, sieged: e.sieged, transition: e.transition,
        carry: e.carry ? e.carryType : null, working: !!e.constructing || (e.orders[0]?.type === 'gather' && e.orders[0].phase === 'mining'),
        seed: e.id, overdrive: e.overdrive > 0, channel: !!e.channel,
      });
      c.restore();
    }
    if (e.carry && m) { c.fillStyle = e.carryType === 'm' ? '#6fd6ff' : '#5dffa0'; c.beginPath(); c.arc(e.x * TILE - 6, e.y * TILE - 14, 3, 0, Math.PI * 2); c.fill(); }
    if (g.tick - e.lastHit < 3 && e.shields > 0) {
      c.strokeStyle = 'rgba(120,200,255,0.8)'; c.lineWidth = 2;
      c.beginPath(); c.arc(e.x * TILE, e.y * TILE - (m ? m.height * TILE * 0.3 + m.air * TILE * 0.7 : 0), e.radius * TILE * 1.25, 0, Math.PI * 2); c.stroke();
    }
    if (e.bornTick > g.tick - 12) { c.globalAlpha = (1 - (g.tick - e.bornTick) / 12) * 0.8; c.fillStyle = '#fff'; c.beginPath(); c.arc(e.x * TILE, e.y * TILE - 6, e.radius * TILE * 1.3, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    void v;
  }

  private teamGlows = new Map<string, HTMLCanvasElement>();
  private teamGlow(color: string) {
    let cv = this.teamGlows.get(color);
    if (!cv) {
      cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const x = cv.getContext('2d')!;
      const gr = x.createRadialGradient(32, 32, 8, 32, 32, 32);
      gr.addColorStop(0, color + 'aa'); gr.addColorStop(0.6, color + '55'); gr.addColorStop(1, color + '00');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      this.teamGlows.set(color, cv);
    }
    return cv;
  }
  private glowCache = new Map<string, HTMLCanvasElement>();
  private flashAt(x: number, y: number, race: string, scale = 1) {
    const col = race === 'kyrrh' ? '200,255,90' : race === 'aethel' ? '94,240,255' : '255,210,120';
    let gl = this.glowCache.get(col);
    if (!gl) {
      gl = document.createElement('canvas'); gl.width = gl.height = 64;
      const cx = gl.getContext('2d')!;
      const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, `rgba(${col},0.9)`); gr.addColorStop(1, `rgba(${col},0)`);
      cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
      this.glowCache.set(col, gl);
    }
    const c = this.c;
    c.globalCompositeOperation = 'lighter';
    const s = 22 * scale;
    c.drawImage(gl, x - s / 2, y - s / 2, s, s);
    c.globalCompositeOperation = 'source-over';
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
