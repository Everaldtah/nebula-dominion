import * as THREE from 'three';
import { audio } from './audio/audio';
import { AIController, attachAI } from './sim/ai';
import { DEFS, DT, Race, RACES, RESEARCH, TICK_RATE, TIER_NAMES } from './sim/data';
import { Entity, Game, GameEvent } from './sim/game';
import { FX3D } from './render/fx3d';
import { MenuScene, Portrait3D } from './render/portrait3d';
import { Camera, Renderer2D, ViewState } from './render/renderer2d';
import { drawIcon, TILE } from './render/sprites';
import { Btn, buildCard, iconFor } from './ui/commands';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const RACE_LIST: Race[] = ['directorate', 'kyrrh', 'aethel'];

class App {
  canvas = $<HTMLCanvasElement>('game');
  ctx = this.canvas.getContext('2d')!;
  fx = new FX3D($<HTMLCanvasElement>('fx'));
  menuScene = new MenuScene();
  portrait: Portrait3D | null = null;
  mode: 'menu' | 'game' = 'menu';
  game: Game | null = null;
  r2d: Renderer2D | null = null;
  me = 0;
  race: Race = 'directorate';
  speed = 1.4;
  paused = false;
  acc = 0;
  last = performance.now();
  cam: Camera = { x: 0, y: 0, zoom: 1.25, w: innerWidth, h: innerHeight };
  view!: ViewState;
  cardMode: 'main' | 'basic' | 'advanced' = 'main';
  targeting: string | null = null;
  card: Btn[] = [];
  groups = new Map<number, number[]>();
  lastGroupTap = { n: -1, t: 0 };
  mouse = { x: 0, y: 0, inside: false };
  dragStart: { x: number; y: number } | null = null;
  panStart: { x: number; y: number; cx: number; cy: number } | null = null;
  keys = new Set<string>();
  lastAlert: { x: number; y: number } | null = null;
  lastClick = { t: 0, id: 0 };
  hudTimer = 0;
  cardKey = '';
  shotRate = 0;
  mmTerrain: HTMLCanvasElement | null = null;
  mmPings: { x: number; y: number; t: number }[] = [];
  endShown = false;
  perf = { sim: 0, r2d: 0, fx: 0, hud: 0, mm: 0, frame: 0, fps: 60, show: false };
  cfg = { opp: 'random', diff: 'normal' as 'easy' | 'normal' | 'hard', seed: 42 };

  constructor() {
    this.resize();
    addEventListener('resize', () => this.resize());
    this.buildMenu();
    this.bindInput();
    this.bindUI();
    requestAnimationFrame(t => this.frame(t));
    (window as any).__nd = this; // exposed for automated browser tests
    (window as any).__ndAI = AIController;
    (window as any).__ndDEFS = DEFS;
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
    this.cam.w = innerWidth; this.cam.h = innerHeight;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.fx.resize(innerWidth, innerHeight);
    this.dpr = dpr;
  }
  dpr = 1;

  // =============================================================== MENU
  buildMenu() {
    const picks = $('race-picks');
    picks.innerHTML = '';
    for (const r of RACE_LIST) {
      const rd = RACES[r];
      const card = document.createElement('div');
      card.className = 'race-card' + (r === this.race ? ' sel' : '');
      card.style.setProperty('--rc', rd.accent);
      const cv = document.createElement('canvas'); cv.width = 300; cv.height = 90;
      const c = cv.getContext('2d')!;
      const showcase = { directorate: ['trooper', 'juggernaut', 'titan', 'dreadnought'], kyrrh: ['skitterling', 'carapid', 'behemoth', 'gravemaw'], aethel: ['vindicator', 'seeker', 'hierophant', 'empyrean'] }[r];
      showcase.forEach((u, i) => { c.save(); c.translate(i * 75, 5); drawIcon(c, u, r, 80, rd.accent); c.restore(); });
      card.appendChild(cv);
      card.insertAdjacentHTML('beforeend', `<h4>${rd.name}</h4><p>${rd.tagline}</p>`);
      card.onclick = () => { this.race = r; audio.unlock(); audio.ui('click'); this.buildMenu(); };
      picks.appendChild(card);
    }
  }

  bindUI() {
    $('start-btn').onclick = () => { audio.unlock(); audio.ui('confirm'); this.startGame(); };
    $('howto-btn').onclick = () => { audio.unlock(); audio.ui('open'); $('howto').classList.remove('hidden'); };
    $('settings-btn').onclick = () => { audio.unlock(); audio.ui('open'); this.openSettings(); };
    document.querySelectorAll<HTMLElement>('[data-close]').forEach(b => b.onclick = () => { audio.ui('click'); $(b.dataset.close!).classList.add('hidden'); if (b.dataset.close === 'settings') this.paused = false; });
    document.querySelectorAll<HTMLInputElement>('[data-vol]').forEach(inp => {
      const k = inp.dataset.vol as keyof typeof audio.volumes;
      inp.value = String(audio.volumes[k]);
      inp.oninput = () => { audio.volumes[k] = +inp.value; audio.applyVolumes(); };
    });
    $<HTMLSelectElement>('speed-sel').onchange = e => { this.speed = +(e.target as HTMLSelectElement).value; };
    $('menu-btn').onclick = () => this.openSettings();
    $('resume-btn').onclick = () => { $('settings').classList.add('hidden'); this.paused = false; };
    $('surrender-btn').onclick = () => {
      if (!this.game || this.game.over) return;
      $('settings').classList.add('hidden'); this.paused = false;
      for (const e of this.game.entities) if (e.alive && e.owner === this.me && e.isBuilding) this.game.kill(e, 1);
    };
    $('again-btn').onclick = () => { $('end').classList.add('hidden'); this.startGame(); };
    $('tomenu-btn').onclick = () => { $('end').classList.add('hidden'); this.toMenu(); };
    $('idle-btn').onclick = () => this.selectIdleWorker();
    $('army-btn').onclick = () => this.selectArmy();
    const mm = $<HTMLCanvasElement>('minimap');
    const mmMove = (ev: MouseEvent) => {
      if (!this.game) return;
      const r = mm.getBoundingClientRect();
      const tx = ((ev.clientX - r.left) / r.width) * this.game.map.w, ty = ((ev.clientY - r.top) / r.height) * this.game.map.h;
      return { tx, ty };
    };
    let mmDrag = false;
    mm.addEventListener('mousedown', ev => {
      const p = mmMove(ev); if (!p) return;
      ev.preventDefault();
      if (ev.button === 0 && this.targeting) { this.execTarget(p.tx, p.ty, ev.shiftKey); return; }
      if (ev.button === 0) { mmDrag = true; this.centerOn(p.tx, p.ty); }
      if (ev.button === 2) this.smartAt(p.tx, p.ty, ev.shiftKey, 0);
    });
    addEventListener('mousemove', ev => { if (mmDrag) { const p = mmMove(ev); if (p) this.centerOn(p.tx, p.ty); } });
    addEventListener('mouseup', () => { mmDrag = false; });
    mm.addEventListener('contextmenu', e => e.preventDefault());
  }

  openSettings() {
    const inGame = this.mode === 'game' && this.game && !this.game.over;
    $('pause-buttons').classList.toggle('hidden', !inGame);
    $('settings').classList.remove('hidden');
    if (inGame) this.paused = true;
  }

  toMenu() {
    this.mode = 'menu';
    this.game = null; this.r2d = null;
    this.fx.clear();
    $('hud').classList.add('hidden');
    $('menu').classList.remove('hidden');
    audio.playMusic('menu');
  }

  startGame() {
    const opp = ($<HTMLSelectElement>('opp-race').value) as Race | 'random';
    const oppRace: Race = opp === 'random' ? RACE_LIST[Math.floor(Math.random() * 3)] : opp;
    const diff = $<HTMLSelectElement>('difficulty').value as 'easy' | 'normal' | 'hard';
    const seed = Math.max(1, Math.min(99999, +$<HTMLInputElement>('seed').value || 42));
    this.cfg = { opp, diff, seed };
    this.game = new Game({ seed, players: [{ race: this.race, name: 'You' }, { race: oppRace, ai: diff, name: `${RACES[oppRace].name} (${diff})` }] });
    attachAI(this.game);
    this.r2d = new Renderer2D(this.ctx, this.game);
    this.mmTerrain = this.r2d.terrain.minimapImage(200);
    this.fx.clear();
    if (!this.portrait) this.portrait = new Portrait3D($<HTMLCanvasElement>('portrait'));
    this.view = { cam: this.cam, me: this.me, selected: new Set(), hover: 0, drag: null, ghost: null, markers: [], targeting: null };
    this.groups.clear();
    this.targeting = null; this.cardMode = 'main';
    this.endShown = false;
    this.paused = false;
    const main = this.game.unitsOf(this.me, e => !!e.def?.dropoff)[0];
    this.centerOn(main.x, main.y + 3);
    this.mode = 'game';
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    audio.playMusic(this.race);
    this.flash(`${RACES[this.race].name} vs ${RACES[oppRace].name}. Destroy every enemy structure.`, 'info');
  }

  // =============================================================== CAMERA
  get viewH() { return this.cam.h - 222; }
  centerOn(tx: number, ty: number) {
    this.cam.x = tx * TILE - this.cam.w / this.cam.zoom / 2;
    this.cam.y = ty * TILE - this.viewH / this.cam.zoom / 2 + 19 / this.cam.zoom;
    this.clampCam();
  }
  clampCam() {
    if (!this.game) return;
    const W = this.game.map.w * TILE, H = this.game.map.h * TILE;
    this.cam.x = Math.max(-100, Math.min(W - this.cam.w / this.cam.zoom + 100, this.cam.x));
    this.cam.y = Math.max(-140, Math.min(H - this.viewH / this.cam.zoom + 60, this.cam.y));
  }
  screenToTile(sx: number, sy: number) { return { x: (sx / this.cam.zoom + this.cam.x) / TILE, y: (sy / this.cam.zoom + this.cam.y) / TILE }; }

  // =============================================================== INPUT
  bindInput() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousemove', ev => { this.mouse.x = ev.clientX; this.mouse.y = ev.clientY; this.mouse.inside = true; if (this.dragStart && this.view) this.view.drag = { x0: this.dragStart.x, y0: this.dragStart.y, x1: ev.clientX, y1: ev.clientY }; if (this.panStart) { this.cam.x = this.panStart.cx - (ev.clientX - this.panStart.x) / this.cam.zoom; this.cam.y = this.panStart.cy - (ev.clientY - this.panStart.y) / this.cam.zoom; this.clampCam(); } });
    document.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    cv.addEventListener('mousedown', ev => {
      audio.unlock();
      if (this.mode !== 'game' || !this.game) return;
      const p = this.screenToTile(ev.clientX, ev.clientY);
      if (ev.button === 1) { ev.preventDefault(); this.panStart = { x: ev.clientX, y: ev.clientY, cx: this.cam.x, cy: this.cam.y }; return; }
      if (ev.button === 2) {
        if (this.targeting) { this.cancelTarget(); return; }
        this.smartAt(p.x, p.y, ev.shiftKey, this.pick(p.x, p.y)?.id ?? 0);
        return;
      }
      if (ev.button === 0) {
        if (this.targeting) { this.execTarget(p.x, p.y, ev.shiftKey); return; }
        this.dragStart = { x: ev.clientX, y: ev.clientY };
      }
    });
    addEventListener('mouseup', ev => {
      if (ev.button === 1) this.panStart = null;
      if (ev.button !== 0 || !this.dragStart || !this.game) return;
      const d = this.dragStart;
      this.dragStart = null; this.view.drag = null;
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) this.clickSelect(ev.clientX, ev.clientY, ev.shiftKey, ev.ctrlKey);
      else this.boxSelect(d.x, d.y, ev.clientX, ev.clientY, ev.shiftKey);
    });
    cv.addEventListener('wheel', ev => {
      if (this.mode !== 'game') return;
      const before = this.screenToTile(ev.clientX, ev.clientY);
      this.cam.zoom = Math.max(0.55, Math.min(1.8, this.cam.zoom * (ev.deltaY < 0 ? 1.1 : 0.9)));
      this.cam.x = before.x * TILE - ev.clientX / this.cam.zoom;
      this.cam.y = before.y * TILE - ev.clientY / this.cam.zoom;
      this.clampCam();
    }, { passive: true });
    addEventListener('keydown', ev => this.onKey(ev));
    addEventListener('keyup', ev => this.keys.delete(ev.key));
    addEventListener('blur', () => this.keys.clear());
  }

  onKey(ev: KeyboardEvent) {
    audio.unlock();
    if ((ev.target as HTMLElement)?.tagName === 'INPUT' || (ev.target as HTMLElement)?.tagName === 'SELECT') return;
    this.keys.add(ev.key);
    if (this.mode !== 'game' || !this.game) return;
    const k = ev.key;
    if (k === 'F10' || (k === 'Escape' && !this.targeting && this.cardMode === 'main' && !this.card.some(b => b.hotkey === 'Escape' && b.enabled))) { ev.preventDefault(); if ($('settings').classList.contains('hidden')) this.openSettings(); else { $('settings').classList.add('hidden'); this.paused = false; } return; }
    if (this.paused) return;
    if (k === 'Escape') {
      if (this.targeting) { this.cancelTarget(); return; }
      if (this.cardMode !== 'main') { this.cardMode = 'main'; this.cardKey = ''; return; }
      const b = this.card.find(b => b.hotkey === 'Escape' && b.enabled); if (b) { b.run(); audio.ui('click'); } return;
    }
    if (k === 'F9') { ev.preventDefault(); this.perf.show = !this.perf.show; $('perf').classList.toggle('hidden', !this.perf.show); return; }
    if (k === 'F1') { ev.preventDefault(); this.selectIdleWorker(); return; }
    if (k === 'F2') { ev.preventDefault(); this.selectArmy(); return; }
    if (k === ' ') { ev.preventDefault(); if (this.lastAlert) this.centerOn(this.lastAlert.x, this.lastAlert.y); return; }
    if (k === 'Tab') { ev.preventDefault(); return; }
    if (/^[0-9]$/.test(k)) {
      ev.preventDefault();
      const n = +k;
      if (ev.ctrlKey) { this.groups.set(n, [...this.view.selected]); this.flash(`Control group ${n} set`, 'info'); return; }
      if (ev.shiftKey) { const cur = this.groups.get(n) ?? []; this.groups.set(n, [...new Set([...cur, ...this.view.selected])]); return; }
      const ids = (this.groups.get(n) ?? []).filter(id => this.game!.get(id));
      if (!ids.length) return;
      this.setSelection(ids);
      const now = performance.now();
      if (this.lastGroupTap.n === n && now - this.lastGroupTap.t < 350) { const e = this.game.get(ids[0])!; this.centerOn(e.x, e.y); }
      this.lastGroupTap = { n, t: now };
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const key = k.length === 1 ? k.toUpperCase() : k;
    const b = this.card.find(b => b.hotkey === key && b.id);
    if (b) { ev.preventDefault(); if (b.enabled) { b.run(); audio.ui('click'); } else audio.ui('error'); this.cardKey = ''; }
  }

  pick(tx: number, ty: number): Entity | undefined {
    const g = this.game!;
    let best: Entity | undefined, bd = Infinity;
    for (const e of g.entities) {
      if (!e.alive || e.hidden) continue;
      if (e.type === 'unit') {
        if (e.owner !== this.me && !g.isVisibleTo(this.me, e)) continue;
        const yy = e.isAir ? ty + 12 / TILE : ty;
        const d = Math.hypot(e.x - tx, e.y - yy);
        if (d < e.radius + 0.25 && d < bd) { bd = d; best = e; }
      }
    }
    if (best) return best;
    // structures take priority over the resource they sit on (flux buildings cover their vent)
    let res: Entity | undefined;
    for (const e of g.entities) {
      if (!e.alive || e.type === 'unit') continue;
      if (e.owner !== this.me && !(e.seenMask & (1 << this.me))) continue;
      if (tx >= e.tx && tx < e.tx + e.w && ty >= e.ty && ty < e.ty + e.h) {
        if (e.isBuilding) return e;
        res = e;
      }
    }
    return res;
  }

  setSelection(ids: number[]) {
    this.view.selected = new Set(ids);
    this.cardMode = 'main';
    this.cancelTarget(false);
    this.cardKey = '';
    const first = this.game!.get(ids[0]);
    if (first && first.owner === this.me && first.type === 'unit') audio.unitVoice(first.def!.race, first.def!.id, 'select', first.radius);
    else if (first?.isBuilding) audio.ui('click');
  }

  clickSelect(sx: number, sy: number, shift: boolean, ctrl: boolean) {
    const p = this.screenToTile(sx, sy);
    const e = this.pick(p.x, p.y);
    if (!e) { if (!shift) this.setSelection([]); return; }
    const now = performance.now();
    const dbl = this.lastClick.id === e.id && now - this.lastClick.t < 350;
    this.lastClick = { t: now, id: e.id };
    if ((ctrl || dbl) && e.owner === this.me) {
      const same = this.onScreen().filter(o => o.owner === this.me && o.def?.id === e.def?.id).map(o => o.id);
      this.setSelection(shift ? [...this.view.selected, ...same] : same);
      return;
    }
    if (shift && e.owner === this.me) {
      const s = new Set(this.view.selected);
      if (s.has(e.id)) s.delete(e.id); else s.add(e.id);
      this.setSelection([...s].filter(id => this.game!.get(id)?.owner === this.me));
      return;
    }
    this.setSelection([e.id]);
  }

  onScreen(): Entity[] {
    const g = this.game!;
    const x0 = this.cam.x / TILE, y0 = this.cam.y / TILE, x1 = x0 + this.cam.w / this.cam.zoom / TILE, y1 = y0 + this.viewH / this.cam.zoom / TILE;
    return g.entities.filter(e => e.alive && e.def && !e.hidden && e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1);
  }

  boxSelect(ax: number, ay: number, bx: number, by: number, shift: boolean) {
    const a = this.screenToTile(Math.min(ax, bx), Math.min(ay, by)), b = this.screenToTile(Math.max(ax, bx), Math.max(ay, by));
    const g = this.game!;
    const inBox = g.entities.filter(e => e.alive && !e.hidden && e.owner === this.me && e.def && e.x + e.radius >= a.x && e.x - e.radius <= b.x && e.y + e.radius >= a.y && e.y - e.radius <= b.y);
    let ids = inBox.filter(e => e.type === 'unit').map(e => e.id);
    if (!ids.length) ids = inBox.filter(e => e.isBuilding).map(e => e.id);
    if (shift) ids = [...new Set([...this.view.selected, ...ids])];
    if (ids.length || !shift) this.setSelection(ids);
  }

  selectedEntities(): Entity[] { return [...this.view.selected].map(id => this.game!.get(id)).filter((e): e is Entity => !!e); }
  ownSelected() { return this.selectedEntities().filter(e => e.owner === this.me); }

  selectIdleWorker() {
    if (!this.game) return;
    const idle = this.game.unitsOf(this.me, e => !!e.def?.worker && !e.orders.length && !e.hidden);
    if (!idle.length) return;
    const cur = this.selectedEntities()[0];
    const i = Math.max(0, idle.findIndex(w => w === cur) + 1) % idle.length;
    this.setSelection([idle[i].id]);
    this.centerOn(idle[i].x, idle[i].y);
  }
  selectArmy() {
    if (!this.game) return;
    this.setSelection(this.game.unitsOf(this.me, e => e.type === 'unit' && !e.def!.worker && e.def!.id !== 'drover').map(e => e.id));
  }

  issue(cmd: any) {
    if (!this.game) return;
    this.game.issue(cmd, this.me);
  }

  voiceFor(kind: 'move' | 'attack') {
    const u = this.ownSelected().find(e => e.type === 'unit');
    if (u) audio.unitVoice(u.def!.race, u.def!.id, kind, u.radius);
  }

  smartAt(tx: number, ty: number, shift: boolean, targetId: number) {
    const own = this.ownSelected();
    if (!own.length) return;
    const t = this.game!.get(targetId);
    const enemy = t && this.game!.isEnemy(this.me, t.owner);
    this.issue({ c: 'smart', ids: own.map(e => e.id), x: tx, y: ty, target: targetId || undefined, queue: shift });
    this.view.markers.push({ x: tx, y: ty, t: 0, color: enemy ? '#ff4040' : '#3dff6e' });
    if (own.some(e => e.type === 'unit')) this.voiceFor(enemy ? 'attack' : 'move');
    else audio.ui('click');
  }

  target(kind: string) {
    if (kind.startsWith('build:')) {
      this.targeting = kind;
      document.body.classList.add('targeting');
      return;
    }
    this.targeting = kind;
    document.body.classList.add('targeting');
    this.cardKey = '';
  }
  cancelTarget(sound = true) {
    if (!this.targeting) return;
    this.targeting = null;
    this.view.ghost = null;
    document.body.classList.remove('targeting');
    if (this.cardMode !== 'main') this.cardMode = 'main';
    this.cardKey = '';
    if (sound) audio.ui('click');
  }

  execTarget(tx: number, ty: number, shift: boolean) {
    const kind = this.targeting!;
    const own = this.ownSelected();
    const ids = own.map(e => e.id);
    const t = this.pick(tx, ty);
    const g = this.game!;
    if (kind.startsWith('build:')) {
      const id = kind.slice(6);
      const gh = this.view.ghost;
      if (!gh) return;
      if (!gh.valid) { audio.ui('error'); const err = g.canPlace(this.me, id, gh.tx, gh.ty, -1); if (err) this.flash(err, 'error'); return; }
      this.issue({ c: 'build', ids: own.filter(e => e.def?.worker).map(e => e.id), bType: id, tx: gh.tx, ty: gh.ty, queue: shift });
      audio.event('place', DEFS[id].race);
      this.voiceFor('move');
      if (!shift) this.cancelTarget(false);
      return;
    }
    switch (kind) {
      case 'move': this.issue(t && t.owner === this.me && t.type === 'unit' ? { c: 'smart', ids, x: tx, y: ty, target: t.id, queue: shift } : { c: 'move', ids, x: tx, y: ty, queue: shift }); this.view.markers.push({ x: tx, y: ty, t: 0, color: '#3dff6e' }); this.voiceFor('move'); break;
      case 'amove':
        if (t && g.isEnemy(this.me, t.owner)) this.issue({ c: 'attack', ids, target: t.id, queue: shift });
        else this.issue({ c: 'amove', ids, x: tx, y: ty, queue: shift });
        this.view.markers.push({ x: tx, y: ty, t: 0, color: '#ff4040' }); this.voiceFor('attack'); break;
      case 'patrol': this.issue({ c: 'patrol', ids, x: tx, y: ty, queue: shift }); this.view.markers.push({ x: tx, y: ty, t: 0, color: '#8fd0ff' }); this.voiceFor('move'); break;
      case 'gather': if (t && (t.type === 'mineral' || (t.def?.gas && t.owner === this.me))) { this.issue({ c: 'smart', ids, x: tx, y: ty, target: t.id, queue: shift }); this.voiceFor('move'); } else { audio.ui('error'); this.flash('Must target crystal or your flux structure', 'error'); return; } break;
      case 'rally': this.issue({ c: 'rally', ids, x: tx, y: ty, target: t?.id }); this.view.markers.push({ x: tx, y: ty, t: 0, color: '#8fffb0' }); audio.ui('confirm'); break;
      default:
        if (kind.startsWith('ab:')) {
          const ab = kind.slice(3);
          this.issue({ c: 'ability', ids, ability: ab, x: tx, y: ty, target: t?.id, queue: shift });
          this.voiceFor('attack');
        }
    }
    this.cancelTarget(false);
  }

  // =============================================================== LOOP
  frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.mode === 'menu') {
      this.menuScene.render(this.fx.renderer, innerWidth, innerHeight, dt);
      audio.playMusic('menu');
    } else if (this.game && this.r2d) {
      this.updateGame(dt);
    }
    requestAnimationFrame(t => this.frame(t));
  }

  updateGame(dt: number) {
    const g = this.game!, r2d = this.r2d!;
    // camera scroll
    const sp = 900 * dt / this.cam.zoom;
    if (this.keys.has('ArrowLeft')) this.cam.x -= sp;
    if (this.keys.has('ArrowRight')) this.cam.x += sp;
    if (this.keys.has('ArrowUp')) this.cam.y -= sp;
    if (this.keys.has('ArrowDown')) this.cam.y += sp;
    if (this.mouse.inside && document.hasFocus() && !this.dragStart && !this.panStart) {
      const m = 6;
      if (this.mouse.x < m) this.cam.x -= sp; else if (this.mouse.x > this.cam.w - m) this.cam.x += sp;
      if (this.mouse.y < m) this.cam.y -= sp; else if (this.mouse.y > this.cam.h - m) this.cam.y += sp;
    }
    this.clampCam();

    const pt0 = performance.now();
    if (!this.paused && !g.over) {
      this.acc += dt * this.speed * TICK_RATE;
      let n = 0;
      while (this.acc >= 1 && n < 10) { g.step(); this.acc -= 1; n++; }
      if (n >= 10) this.acc = 0;
    }
    this.processEvents();
    const pt1 = performance.now();
    // selection cleanup
    for (const id of this.view.selected) if (!g.get(id)) this.view.selected.delete(id);
    // ghost
    if (this.targeting?.startsWith('build:')) {
      const id = this.targeting.slice(6), def = DEFS[id];
      const p = this.screenToTile(this.mouse.x, this.mouse.y);
      let tx = Math.round(p.x - def.size / 2), ty = Math.round(p.y - def.size / 2);
      if (def.gas) {
        const gy = g.entities.find(e => e.alive && e.type === 'geyser' && p.x >= e.tx - 1 && p.x < e.tx + 4 && p.y >= e.ty - 1 && p.y < e.ty + 4);
        if (gy) { tx = gy.tx; ty = gy.ty; }
      }
      this.view.ghost = { defId: id, tx, ty, valid: !g.canPlace(this.me, id, tx, ty, -1) };
    } else this.view.ghost = null;
    const hp = this.mouse.inside ? this.screenToTile(this.mouse.x, this.mouse.y) : null;
    this.view.hover = hp ? this.pick(hp.x, hp.y)?.id ?? 0 : 0;
    for (const m of this.view.markers) m.t += dt;
    this.view.markers = this.view.markers.filter(m => m.t < 0.5);
    this.view.targeting = this.targeting;

    // render
    r2d.dpr = this.dpr;
    r2d.render({ ...this.view, cam: this.cam }, dt);
    const pt2 = performance.now();
    this.fx.render(this.cam, this.paused ? 0 : dt);
    const pt3 = performance.now();
    // audio listener
    audio.listener = { x: this.cam.x / TILE, y: this.cam.y / TILE, w: this.cam.w / this.cam.zoom / TILE, h: this.viewH / this.cam.zoom / TILE };
    this.shotRate *= Math.pow(0.5, dt);
    audio.intensity = Math.min(1, this.shotRate / 12);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.1; this.updateHUD(); }
    const pt4 = performance.now();
    this.drawMinimap(dt);
    this.portrait?.render(dt);
    const pt5 = performance.now();
    const k = 0.1, P = this.perf;
    P.sim += (pt1 - pt0 - P.sim) * k; P.r2d += (pt2 - pt1 - P.r2d) * k; P.fx += (pt3 - pt2 - P.fx) * k;
    P.hud += (pt4 - pt3 - P.hud) * k; P.mm += (pt5 - pt4 - P.mm) * k; P.frame += (pt5 - pt0 - P.frame) * k;
    P.fps += (1 / Math.max(dt, 1e-3) - P.fps) * k;
    if (P.show) $('perf').textContent = `FPS ${P.fps.toFixed(0)} | frame ${P.frame.toFixed(1)}ms  sim ${P.sim.toFixed(1)}  2D ${P.r2d.toFixed(1)}  3D ${P.fx.toFixed(1)}  hud ${P.hud.toFixed(1)}  map ${P.mm.toFixed(1)} | ${g.entities.length} ents`;
  }

  // Renderer2D draws with its own transform; wrap to support devicePixelRatio.
  processEvents() {
    const g = this.game!;
    const me = this.me;
    const vis = (x: number, y: number) => g.pointVisible(me, x, y);
    for (const ev of g.events) {
      this.fx.handle(ev, vis);
      this.eventAudio(ev, vis);
      switch (ev.t) {
        case 'msg': if (ev.owner === me) { this.flash(ev.text, ev.kind); if (ev.kind === 'error') audio.ui('error'); } break;
        case 'attacked':
          if (ev.owner === me) {
            this.lastAlert = { x: ev.x, y: ev.y };
            this.mmPings.push({ x: ev.x, y: ev.y, t: 0 });
            const onScreen = this.onScreenPoint(ev.x, ev.y);
            if (!onScreen) { this.flash('Your forces are under attack!', 'alert'); audio.event('alert', this.race); }
          }
          break;
        case 'spawn': if (ev.owner === me) audio.unitVoice(ev.race, ev.unit, 'ready', DEFS[ev.unit].radius); break;
        case 'research': if (ev.owner === me) audio.event('research', ev.race); break;
        case 'gameover': this.showEnd(ev.winner); break;
      }
    }
    g.events.length = 0;
  }

  onScreenPoint(x: number, y: number) {
    const px = x * TILE, py = y * TILE;
    return px >= this.cam.x && px <= this.cam.x + this.cam.w / this.cam.zoom && py >= this.cam.y && py <= this.cam.y + this.viewH / this.cam.zoom;
  }

  eventAudio(ev: GameEvent, vis: (x: number, y: number) => boolean) {
    switch (ev.t) {
      case 'shot': if (vis(ev.x1, ev.y1) || vis(ev.x2, ev.y2)) { audio.weapon(ev.proj, ev.race, ev.unit, ev.x1, ev.y1); if (this.onScreenPoint(ev.x1, ev.y1)) this.shotRate += 1; } break;
      case 'hit': if (vis(ev.x, ev.y)) audio.impact(ev.shield, ev.x, ev.y); break;
      case 'death': if (vis(ev.x, ev.y) && ev.unit !== 'mineral') audio.death(ev.race, ev.radius, ev.building, ev.x, ev.y); break;
      case 'buildStart': if (vis(ev.x, ev.y)) audio.event('buildStart', ev.race, ev.x, ev.y); break;
      case 'buildDone': if (ev.owner === this.me) audio.event('buildDone', ev.race, ev.x, ev.y); break;
      case 'spawn': if (ev.owner === this.me) audio.event('spawn', ev.race, ev.x, ev.y); break;
      case 'ability': if (vis(ev.x, ev.y)) audio.ability(ev.ability, ev.x, ev.y); break;
      case 'gather': if (ev.owner === this.me) audio.event('deposit', this.race, ev.x, ev.y); break;
    }
  }

  flash(text: string, kind: 'error' | 'info' | 'alert') {
    const box = $('msgs');
    const el = document.createElement('div');
    el.className = 'msg ' + kind;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild!);
    setTimeout(() => el.remove(), 3000);
  }

  showEnd(winner: number) {
    if (this.endShown) return;
    this.endShown = true;
    const g = this.game!;
    const win = winner === this.me;
    const title = $('end-title');
    title.textContent = win ? 'VICTORY' : 'DEFEAT';
    title.className = win ? 'win' : 'lose';
    audio.playMusic(win ? 'victory' : 'defeat');
    const mins = Math.floor(g.time / 60), secs = Math.floor(g.time % 60);
    $('end-stats').innerHTML = `<tr><th></th>${g.players.map(p => `<th style="color:${p.color}">${p.name}</th>`).join('')}</tr>` +
      [['Race', (p: any) => RACES[p.race as Race].name], ['Crystal mined', (p: any) => p.stats.minerals], ['Flux mined', (p: any) => p.stats.gas], ['Units produced', (p: any) => p.stats.units], ['Structures built', (p: any) => p.stats.buildings], ['Enemies destroyed', (p: any) => p.stats.kills], ['Losses', (p: any) => p.stats.lost]]
        .map(([label, f]: any) => `<tr><td>${label}</td>${g.players.map(p => `<td>${f(p)}</td>`).join('')}</tr>`).join('') +
      `<tr><td>Game time</td><td colspan="${g.players.length}">${mins}:${String(secs).padStart(2, '0')}</td></tr>`;
    setTimeout(() => $('end').classList.remove('hidden'), 1500);
  }

  // =============================================================== HUD
  updateHUD() {
    const g = this.game!, p = g.players[this.me];
    $('res-min').textContent = String(Math.floor(p.minerals));
    $('res-gas').textContent = String(Math.floor(p.gas));
    const sup = $('res-sup');
    sup.textContent = `${Math.ceil(p.supplyUsed)}/${p.supplyCap}`;
    sup.classList.toggle('blocked', p.supplyUsed >= p.supplyCap && p.supplyCap < 200);
    $('res-tier').textContent = TIER_NAMES[g.tierOf(this.me)];
    const m = Math.floor(g.time / 60), s = Math.floor(g.time % 60);
    $('clock').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    $('idle-count').textContent = String(g.unitsOf(this.me, e => !!e.def?.worker && !e.orders.length && !e.hidden).length);

    const sel = this.selectedEntities();
    // command card
    const card = buildCard({
      game: g, me: this.me, sel, mode: this.cardMode, targeting: this.targeting,
      setMode: m => { this.cardMode = m; this.cardKey = ''; },
      target: k => this.target(k), issue: c => this.issue(c),
    });
    this.card = card;
    const key = card.map(b => `${b.id}${b.enabled ? 1 : 0}${b.active ? 1 : 0}`).join('|');
    if (key !== this.cardKey) {
      this.cardKey = key;
      const cmd = $('cmd');
      cmd.innerHTML = '';
      for (let i = 0; i < 15; i++) {
        const b = card[i];
        const el = document.createElement('div');
        if (!b || !b.id) { el.className = 'cbtn disabled'; el.style.visibility = 'hidden'; cmd.appendChild(el); continue; }
        el.className = 'cbtn' + (b.enabled ? '' : ' disabled') + (b.active ? ' active' : '');
        el.innerHTML = `${b.icon ? `<img src="${b.icon}" alt="">` : `<span class="glyph">${b.glyph ?? '?'}</span>`}<span class="hk">${b.hotkey === 'Escape' ? 'Esc' : b.hotkey}</span>`;
        el.onmouseenter = () => this.showTip(b);
        el.onmouseleave = () => $('tooltip').classList.add('hidden');
        el.onmousedown = ev => { ev.stopPropagation(); if (b.enabled) { b.run(); audio.ui('click'); } else audio.ui('error'); this.cardKey = ''; };
        cmd.appendChild(el);
      }
    }
    this.updateInfo(sel);
  }

  showTip(b: Btn) {
    const tt = $('tooltip');
    const c = b.cost;
    tt.innerHTML = `<div class="tt-name">${b.label} <span class="tt-hk">(${b.hotkey === 'Escape' ? 'Esc' : b.hotkey})</span></div>` +
      (c ? `<div class="tt-cost"><b class="m">${c.m}</b> crystal · <b class="g">${c.g}</b> flux${c.s ? ` · ${c.s > 0 ? c.s + ' supply' : '+' + -c.s + ' supply'}` : ''}${c.t ? ` · ${c.t}s` : ''}</div>` : '') +
      `<div>${b.desc}</div>` + (b.req ? `<div class="tt-req">${b.req}</div>` : '');
    tt.classList.remove('hidden');
  }

  infoKey = '';
  updateInfo(sel: Entity[]) {
    const body = $('info-body');
    const g = this.game!;
    if (!sel.length) {
      this.portrait?.show(null, null, '#fff');
      if (this.infoKey !== 'none') { this.infoKey = 'none'; body.innerHTML = `<div class="race">${RACES[this.race].name}</div><div style="color:#7f95ab">Select units or structures. Right-click to command.</div>`; }
      return;
    }
    if (sel.length === 1) {
      const e = sel[0], d = e.def!, p = g.players[e.owner];
      this.portrait?.show(d.id, d.race, p?.color ?? '#fff');
      const w = g.weaponOf(e);
      const armor = d.armor + (e.type === 'unit' && p ? p.armor + g.armorBonus(p.id, d.id) : 0);
      let html = `<div class="name">${d.name}</div><div class="race">${RACES[d.race].name}${d.tier ? ` · ${TIER_NAMES[d.tier]}` : ''} · ${d.attrs.filter(a => a !== 'structure').join(', ')}${e.owner !== this.me ? ' · <span style="color:#ff6060">Enemy</span>' : ''}</div>`;
      html += `<span class="stat hp">HP <b>${Math.ceil(e.hp)}/${e.maxHp}</b></span>`;
      if (e.maxShields) html += `<span class="stat sh">Shields <b>${Math.ceil(e.shields)}/${e.maxShields}</b></span>`;
      if (d.energy) html += `<span class="stat en">Energy <b>${Math.floor(e.energy)}/${d.energy}</b></span>`;
      html += `<br><span class="stat">Armor <b>${armor}</b></span>`;
      if (w) {
        const up = e.isBuilding ? 0 : e.isAir ? p.air : p.weapons;
        html += `<span class="stat">Damage <b>${w.damage + w.perUpgrade * up}${w.hits ? ' x' + w.hits : ''}${w.bonus ? ` (+${w.bonus.amount} ${w.bonus.attr})` : ''}</b></span><span class="stat">Range <b>${w.range}</b></span><span class="stat">Hits <b>${w.targets === 'both' ? 'ground+air' : w.targets}</b></span>`;
      }
      if (e.type === 'unit' && e.kills) html += `<span class="stat">Kills <b>${e.kills}</b></span>`;
      if (e.type === 'mineral') html = `<div class="name">Crystal Field</div><div class="race">Resource</div><span class="stat">Remaining <b>${e.amount}</b></span>`;
      if (e.type === 'geyser') html = `<div class="name">Flux Vent</div><div class="race">Resource</div><span class="stat">Remaining <b>${e.amount}</b></span>`;
      if (e.isBuilding && e.owner === this.me) {
        if (!e.built) html += `<div class="progress"><div style="width:${e.progress * 100}%"></div></div><div class="race">Constructing ${Math.floor(e.progress * 100)}%</div>`;
        else {
          if (d.larvaHost) html += `<div class="race">Larva: <b style="color:#e8dcb8">${e.larva}</b>${e.broodTimer > 0 ? ` · Spawn Brood ${Math.ceil(e.broodTimer)}s` : ''}</div>`;
          if (d.needsPower && !e.powered) html += `<div style="color:#ff6060">Unpowered: build a Lumen Obelisk nearby</div>`;
          if (d.gas) { const gy = g.get(e.geyser); html += `<span class="stat">Flux left <b>${gy?.amount ?? 0}</b></span>`; }
          const slots = [...e.queue.map(q => ({ id: q.id, kind: q.kind, p: q.progress / q.total })), ...e.eggs.map(q => ({ id: q.unit, kind: 'unit', p: q.progress / q.total }))];
          if (slots.length || d.trains) {
            html += `<div class="queue">` + Array.from({ length: Math.max(5, slots.length) }, (_, i) => {
              const s = slots[i];
              if (!s) return `<div class="qslot empty"></div>`;
              const icon = s.kind === 'unit' || s.kind === 'morph' ? iconFor(s.id, p.color) : '';
              const label = s.kind === 'research' ? `<div style="font-size:10px;padding:2px;color:#ffcf6a">${RESEARCH[s.id].name}</div>` : '';
              return `<div class="qslot" data-cancel="${e.id}">${icon ? `<img src="${icon}">` : label}<div class="bar" style="width:${s.p * 100}%"></div></div>`;
            }).join('') + `</div>`;
          }
        }
      }
      if (e.type === 'unit' && e.owner === this.me) {
        const o = e.orders[0];
        const status = e.sieged ? 'Anchored' : e.transition > 0 ? 'Transforming…' : e.channel ? 'Channeling Solar Lance' : o ? { move: 'Moving', amove: 'Attack-moving', attack: 'Attacking', patrol: 'Patrolling', gather: 'Harvesting', return: 'Returning cargo', build: 'Constructing', hold: 'Holding position', ability: 'Casting', follow: 'Following' }[o.type] : 'Idle';
        html += `<div class="race" style="margin-top:4px">${status}${e.overdrive > 0 ? ' · <span style="color:#ff6060">Overdrive</span>' : ''}${e.phaseCd > 0 ? ` · Phase ${Math.ceil(e.phaseCd)}s` : ''}${e.lanceCd > 0 ? ` · Lance ${Math.ceil(e.lanceCd)}s` : ''}</div>`;
      }
      html += `<div style="color:#5d7389;font-size:13px;margin-top:4px">${d.desc}</div>`;
      if (html !== this.infoKey) {
        this.infoKey = html; body.innerHTML = html;
        body.querySelectorAll<HTMLElement>('[data-cancel]').forEach(el => el.onmousedown = () => { this.issue({ c: 'cancel', id: +el.dataset.cancel! }); audio.ui('click'); });
      }
      return;
    }
    const prim = sel[0];
    this.portrait?.show(prim.def!.id, prim.def!.race, g.players[prim.owner]?.color ?? '#fff');
    const html = `<div class="name">${sel.length} selected</div><div class="multi">` + sel.slice(0, 48).map(e => {
      const f = e.hp / e.maxHp;
      return `<div class="u" data-id="${e.id}" title="${e.def!.name}"><img src="${iconFor(e.def!.id, g.players[e.owner]?.color)}"><div class="hb" style="background:${f > 0.6 ? '#3dff6e' : f > 0.3 ? '#ffd23d' : '#ff3d3d'};width:${f * 100}%"></div></div>`;
    }).join('') + '</div>';
    if (html !== this.infoKey) {
      this.infoKey = html; body.innerHTML = html;
      body.querySelectorAll<HTMLElement>('[data-id]').forEach(el => el.onmousedown = ev => {
        const id = +el.dataset.id!;
        if (ev.shiftKey) this.setSelection([...this.view.selected].filter(i => i !== id));
        else if (ev.ctrlKey) { const d = g.get(id)?.def?.id; this.setSelection(sel.filter(s => s.def?.id === d).map(s => s.id)); }
        else this.setSelection([id]);
      });
    }
  }

  drawMinimap(dt: number) {
    const g = this.game!;
    const cv = $<HTMLCanvasElement>('minimap');
    const c = cv.getContext('2d')!;
    const S = cv.width / g.map.w;
    if (this.mmTerrain) c.drawImage(this.mmTerrain, 0, 0);
    // creep
    c.fillStyle = 'rgba(120,40,110,0.6)';
    for (let y = 0; y < g.map.h; y += 2) for (let x = 0; x < g.map.w; x += 2) if (g.creep[y * g.map.w + x]) c.fillRect(x * S, y * S, S * 2, S * 2);
    for (const e of g.entities) {
      if (!e.alive || e.hidden) continue;
      if (e.type === 'mineral' || e.type === 'geyser') {
        if (!(e.seenMask & (1 << this.me)) && !g.explored[this.me][Math.floor(e.y) * g.map.w + Math.floor(e.x)]) continue;
        c.fillStyle = e.type === 'mineral' ? '#58b8ff' : '#5dffa0';
        c.fillRect(e.tx * S, e.ty * S, Math.max(2, e.w * S), Math.max(2, e.h * S));
        continue;
      }
      if (e.owner !== this.me) {
        if (e.isBuilding ? !(e.seenMask & (1 << this.me)) : !g.isVisibleTo(this.me, e)) continue;
      }
      c.fillStyle = g.players[e.owner].color;
      if (e.isBuilding) c.fillRect(e.tx * S, e.ty * S, e.w * S, e.h * S);
      else c.fillRect(e.x * S - 1.5, e.y * S - 1.5, 3, 3);
    }
    // fog
    const vis = g.visible[this.me], exp = g.explored[this.me];
    for (let y = 0; y < g.map.h; y += 2) for (let x = 0; x < g.map.w; x += 2) {
      const i = y * g.map.w + x;
      if (vis[i]) continue;
      c.fillStyle = exp[i] ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.85)';
      c.fillRect(x * S, y * S, S * 2, S * 2);
    }
    for (const pg of this.mmPings) {
      pg.t += dt;
      c.strokeStyle = `rgba(255,60,60,${1 - pg.t / 3})`; c.lineWidth = 2;
      c.beginPath(); c.arc(pg.x * S, pg.y * S, 4 + (pg.t % 1) * 14, 0, Math.PI * 2); c.stroke();
    }
    this.mmPings = this.mmPings.filter(p => p.t < 3);
    c.strokeStyle = '#fff'; c.lineWidth = 1;
    c.strokeRect(this.cam.x / TILE * S, this.cam.y / TILE * S, this.cam.w / this.cam.zoom / TILE * S, this.viewH / this.cam.zoom / TILE * S);
  }
}

void THREE; void DT;
new App();
