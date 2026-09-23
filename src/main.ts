import { q } from './assetver';
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
import { atlas } from './render/atlas';
import { Gallery } from './ui/gallery';
import { ACTS, Line, loadProgress, Mission, MISSIONS, saveProgress, unlocked } from './campaign/missions';
import { CampaignController } from './campaign/controller';
import { FpsMode } from './fps/mode';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const RACE_LIST: Race[] = ['directorate', 'kyrrh', 'aethel'];

class App {
  canvas = $<HTMLCanvasElement>('game');
  ctx = this.canvas.getContext('2d')!;
  fx = new FX3D($<HTMLCanvasElement>('fx'));
  menuScene = new MenuScene();
  portrait: Portrait3D | null = null;
  mode: 'menu' | 'game' | 'fps' = 'menu';
  fps: FpsMode | null = null;
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
  spectator = false;
  mission: Mission | null = null;
  campaign: CampaignController | null = null;
  gallery: Gallery | null = null;
  commsQueue: Line[] = [];
  commsT = 0;
  director = true;
  hot = { x: 64, y: 64, heat: 0, t: 0 };
  specSpeed = 1;
  loading = false;
  cfg = { opp: 'random', diff: 'normal' as 'easy' | 'normal' | 'hard', seed: 42 };

  constructor() {
    this.resize();
    addEventListener('resize', () => this.resize());
    this.buildMenu();
    atlas.load(f => { const el = document.getElementById('asset-load'); if (el) el.textContent = f < 1 ? `Loading 3D assets… ${Math.round(f * 100)}%` : ''; }).then(() => this.buildMenu());
    this.bindInput();
    this.bindUI();
    requestAnimationFrame(t => this.frame(t));
    this.detectGpu();
    (window as any).__nd = this; // exposed for automated browser tests
    (window as any).__ndAI = AIController;
    (window as any).__ndDEFS = DEFS;
  }

  gpuName = '';
  lightFx = false;
  detectGpu() {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      this.gpuName = dbg ? String(gl!.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    } catch { /* ignore */ }
    const software = /swiftshader|llvmpipe|software|basic render/i.test(this.gpuName);
    this.lightFx = software;
    this.fx.quality = software ? 0.35 : 1;
    const el = document.getElementById('gpu-note');
    if (el) {
      el.innerHTML = software
        ? `⚠ Your browser is rendering without the GPU (${this.gpuName || 'software'}). Enable <b>Settings → System → Use graphics acceleration</b> in Chrome, or use the local GPU launcher, for smooth play.`
        : this.gpuName ? `GPU: ${this.gpuName.replace(/^ANGLE \(|\)$/g, '').split(',').slice(0, 2).join(',')}` : '';
      el.classList.toggle('warn', software);
    }
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
      const cv = document.createElement('canvas'); cv.width = 440; cv.height = 130;
      const c = cv.getContext('2d')!;
      const showcase = { directorate: ['trooper', 'juggernaut', 'titan', 'dreadnought'], kyrrh: ['skitterling', 'carapid', 'behemoth', 'gravemaw'], aethel: ['vindicator', 'seeker', 'hierophant', 'empyrean'] }[r];
      showcase.forEach((u, i) => { const im = this.portraitImg(u); c.save(); c.translate(i * 108, 2); if (im) c.drawImage(im, -6, -2, 128, 128); else if (!atlas.icon(c, u, 110, 0)) drawIcon(c, u, r, 110, rd.accent); c.restore(); });
      card.appendChild(cv);
      card.insertAdjacentHTML('beforeend', `<h4>${rd.name}</h4><p>${rd.tagline}</p>`);
      card.onclick = () => { this.race = r; audio.unlock(); audio.ui('click'); this.buildMenu(); };
      picks.appendChild(card);
    }
  }

  bindUI() {
    $('start-btn').onclick = () => { audio.unlock(); audio.ui('confirm'); this.startGame(); };
    document.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach(r => r.onchange = () => { const spec = r.value === 'spectate' && r.checked; if (r.checked) { $('p1-diff-wrap').classList.toggle('hidden', !spec); $('race-title').textContent = spec ? 'Blue AI race' : 'Choose your race'; $('opp-label').firstChild!.textContent = spec ? 'Red AI race ' : 'Opponent '; $<HTMLButtonElement>('start-btn').textContent = spec ? 'Watch AI vs AI' : 'Launch Skirmish'; } });
    document.querySelectorAll<HTMLElement>('[data-speed]').forEach(b => b.onclick = () => { this.specSpeed = +b.dataset.speed!; this.paused = this.specSpeed === 0; document.querySelectorAll('[data-speed]').forEach(o => o.classList.toggle('on', o === b)); audio.ui('click'); });
    $('director-btn').onclick = () => { this.director = !this.director; $('director-btn').classList.toggle('on', this.director); audio.ui('click'); };
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
    $('again-btn').onclick = () => { $('end').classList.add('hidden'); if (this.mission) this.briefing(this.mission); else this.startGame(); };
    $('tomenu-btn').onclick = () => { $('end').classList.add('hidden'); const wasCampaign = !!this.mission; this.toMenu(); if (wasCampaign) this.openCampaign(); };
    $('next-btn').onclick = () => { $('end').classList.add('hidden'); const i = this.mission ? MISSIONS.indexOf(this.mission) : -1; this.toMenu(); if (i >= 0 && MISSIONS[i + 1]) this.briefing(MISSIONS[i + 1]); };
    $('campaign-btn').onclick = () => { audio.unlock(); audio.ui('open'); this.openCampaign(); };
    $('fps-btn').onclick = () => {
      audio.unlock(); audio.ui('open');
      this.fps ??= new FpsMode(() => { this.mode = 'menu'; $('menu').classList.remove('hidden'); }, () => { this.mode = 'fps'; $('menu').classList.add('hidden'); });
      this.fps.open();
    };
    $('gallery-btn').onclick = () => { audio.unlock(); audio.ui('open'); this.gallery ??= new Gallery(); this.gallery.open(); };
    $('campaign-close').onclick = () => { audio.ui('click'); $('campaign').classList.add('hidden'); };
    $('brief-back').onclick = () => { audio.ui('click'); $('briefing').classList.add('hidden'); this.openCampaign(); };
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
    this.mission = null; this.campaign = null;
    $('objectives').classList.add('hidden'); $('comms').classList.add('hidden');
    this.game = null; this.r2d = null;
    this.fx.clear();
    $('hud').classList.add('hidden');
    $('menu').classList.remove('hidden');
    audio.playMusic('menu');
  }

  async startGame(mission: Mission | null = null) {
    if (this.loading) return;
    this.mission = mission;
    this.campaign = null;
    this.spectator = !mission && (document.querySelector('input[name=mode]:checked') as HTMLInputElement | null)?.value === 'spectate';
    const opp = mission ? mission.enemy : ($<HTMLSelectElement>('opp-race').value) as Race | 'random';
    const oppRace: Race = opp === 'random' ? RACE_LIST[Math.floor(Math.random() * 3)] : opp;
    const diff = mission ? mission.difficulty : $<HTMLSelectElement>('difficulty').value as 'easy' | 'normal' | 'hard';
    const seed = mission ? mission.seed : Math.max(1, Math.min(99999, +$<HTMLInputElement>('seed').value || 42));
    if (mission) this.race = mission.race;
    this.cfg = { opp, diff, seed };
    const diff1 = $<HTMLSelectElement>('difficulty1').value as 'easy' | 'normal' | 'hard';
    this.game = new Game({ seed, players: this.spectator
      ? [{ race: this.race, ai: diff1, name: `Blue ${RACES[this.race].name}` }, { race: oppRace, ai: diff, name: `Red ${RACES[oppRace].name}` }]
      : [{ race: this.race, name: 'You' }, { race: oppRace, ai: diff, name: `${RACES[oppRace].name} (${diff})` }] });
    attachAI(this.game);
    this.r2d = new Renderer2D(this.ctx, this.game);
    this.loading = true;
    $('loading').classList.remove('hidden');
    // stream in only the 3D sprite sheets this match needs (both races + resources)
    const races = new Set(this.game.players.map(pl => pl.race));
    const need = [...Object.values(DEFS).filter(d => races.has(d.race)).map(d => d.id), 'juggernaut_sieged', 'mineral', 'geyser'];
    await atlas.ensure(need, f => { $('loading-bar').style.width = `${Math.round(f * 60)}%`; $('loading-text').textContent = `Loading 3D units… ${Math.round(f * 100)}%`; });
    $('loading-text').textContent = 'Generating terrain…';
    await this.r2d.terrain.prebuild(f => { $('loading-bar').style.width = `${60 + Math.round(f * 40)}%`; });
    $('loading').classList.add('hidden');
    this.loading = false;
    this.mmTerrain = this.r2d.terrain.minimapImage(200);
    this.mmLayer = null;
    this.fx.clear();
    if (!this.portrait) this.portrait = new Portrait3D($<HTMLCanvasElement>('portrait'));
    this.view = { cam: this.cam, me: this.me, selected: new Set(), hover: 0, drag: null, ghost: null, markers: [], targeting: null, spectator: this.spectator };
    this.specSpeed = 1; this.hot = { x: 64, y: 64, heat: 0, t: 0 };
    $('spec-bar').classList.toggle('hidden', !this.spectator);
    document.querySelectorAll('[data-speed]').forEach(o => o.classList.toggle('on', (o as HTMLElement).dataset.speed === '1'));
    this.groups.clear();
    this.targeting = null; this.cardMode = 'main';
    this.endShown = false;
    this.paused = false;
    const main = this.game.unitsOf(this.me, e => !!e.def?.dropoff)[0];
    if (this.spectator) this.centerOn(this.game.map.w / 2, this.game.map.h / 2); else this.centerOn(main.x, main.y + 3);
    this.mode = 'game';
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    if (mission) {
      this.campaign = new CampaignController(mission, this.game, {
        say: l => this.say(l),
        objectives: html => { $('objectives').innerHTML = html; },
        win: () => { const done = loadProgress(); done.add(mission.id); saveProgress(done); this.game!.endGame(this.me); },
        lose: reason => { this.failReason = reason; this.game!.endGame(1 - this.me); },
      });
      this.campaign.setup();
      this.commsQueue = []; this.commsT = 0;
    }
    $('objectives').classList.toggle('hidden', !mission);
    $('comms').classList.add('hidden');
    audio.playMusic(this.spectator ? 'menu' : this.race);
    if (!mission) this.flash(this.spectator ? `AI vs AI: ${RACES[this.race].name} (blue) vs ${RACES[oppRace].name} (red)` : `${RACES[this.race].name} vs ${RACES[oppRace].name}. Destroy every enemy structure.`, 'info');
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
    if (!this.game || this.spectator) return;
    this.game.issue(cmd, this.me);
  }

  voiceFor(kind: 'move' | 'attack') {
    const u = this.ownSelected().find(e => e.type === 'unit');
    if (u) audio.unitVoice(u.def!.race, u.def!.id, kind, u.radius);
  }

  smartAt(tx: number, ty: number, shift: boolean, targetId: number) {
    if (this.spectator) return;
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
      const mult = this.spectator ? (this.specSpeed >= 99 ? 64 : this.specSpeed) : 1;
      this.acc += dt * this.speed * TICK_RATE * mult;
      let n = 0;
      const budget = this.spectator ? 14 : 8, tStart = performance.now();
      while (this.acc >= 1 && (n < 10 || this.spectator) && performance.now() - tStart < budget) { g.step(); this.acc -= 1; n++; if (this.spectator && n % 8 === 0) this.processEvents(true); }
      if (this.acc > 40) this.acc = 0;
    }
    if (this.spectator) this.directorCam(dt);
    if (this.campaign && !this.paused && !g.over) this.campaign.update(dt * this.speed);
    this.updateComms(dt);
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
    this.renderPortrait(dt);
    const pt5 = performance.now();
    const k = 0.1, P = this.perf;
    P.sim += (pt1 - pt0 - P.sim) * k; P.r2d += (pt2 - pt1 - P.r2d) * k; P.fx += (pt3 - pt2 - P.fx) * k;
    P.hud += (pt4 - pt3 - P.hud) * k; P.mm += (pt5 - pt4 - P.mm) * k; P.frame += (pt5 - pt0 - P.frame) * k;
    P.fps += (1 / Math.max(dt, 1e-3) - P.fps) * k;
    if (P.show) $('perf').textContent = `FPS ${P.fps.toFixed(0)} | frame ${P.frame.toFixed(1)}ms  sim ${P.sim.toFixed(1)}  2D ${P.r2d.toFixed(1)}  3D ${P.fx.toFixed(1)}  hud ${P.hud.toFixed(1)}  map ${P.mm.toFixed(1)} | ${g.entities.length} ents`;
  }

  // Renderer2D draws with its own transform; wrap to support devicePixelRatio.
  processEvents(fastForward = false) {
    const g = this.game!;
    const me = this.me;
    const vis = this.spectator ? (x: number, y: number) => this.onScreenPoint(x, y) : (x: number, y: number) => g.pointVisible(me, x, y);
    for (const ev of g.events) {
      if (ev.t === 'shot' && this.spectator) { this.hot.heat++; this.hot.x += (ev.x2 - this.hot.x) * 0.02; this.hot.y += (ev.y2 - this.hot.y) * 0.02; }
      if (!fastForward || ev.t === 'death' || ev.t === 'gameover') { this.fx.handle(ev, vis); this.eventAudio(ev, vis); }
      if (this.spectator && ev.t !== 'gameover') continue;
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
    title.textContent = this.mission ? (win ? 'MISSION COMPLETE' : 'MISSION FAILED') : this.spectator ? `${g.players[winner]?.name ?? 'Nobody'} WINS` : win ? 'VICTORY' : 'DEFEAT';
    const m = this.mission;
    const idx = m ? MISSIONS.indexOf(m) : -1;
    if (m && win) { const done = loadProgress(); done.add(m.id); saveProgress(done); }
    $('end-story').innerHTML = m ? (win ? `<p>${m.outro}</p>` : `<p>${this.failReason || 'Your forces were defeated.'}</p>`) : '';
    $('next-btn').classList.toggle('hidden', !(m && win && idx < MISSIONS.length - 1));
    $('again-btn').textContent = m ? 'Retry Mission' : 'Play Again';
    $('tomenu-btn').textContent = m ? 'Campaign' : 'Main Menu';
    title.className = this.spectator || win ? 'win' : 'lose';
    audio.playMusic(this.spectator || win ? 'victory' : 'defeat');
    const mins = Math.floor(g.time / 60), secs = Math.floor(g.time % 60);
    $('end-stats').innerHTML = `<tr><th></th>${g.players.map(p => `<th style="color:${p.color}">${p.name}</th>`).join('')}</tr>` +
      [['Race', (p: any) => RACES[p.race as Race].name], ['Crystal mined', (p: any) => p.stats.minerals], ['Flux mined', (p: any) => p.stats.gas], ['Units produced', (p: any) => p.stats.units], ['Structures built', (p: any) => p.stats.buildings], ['Enemies destroyed', (p: any) => p.stats.kills], ['Losses', (p: any) => p.stats.lost]]
        .map(([label, f]: any) => `<tr><td>${label}</td>${g.players.map(p => `<td>${f(p)}</td>`).join('')}</tr>`).join('') +
      `<tr><td>Game time</td><td colspan="${g.players.length}">${mins}:${String(secs).padStart(2, '0')}</td></tr>`;
    setTimeout(() => $('end').classList.remove('hidden'), 1500);
  }



  failReason = '';
  openCampaign() {
    const done = loadProgress();
    const box = $('campaign-acts');
    box.innerHTML = '';
    for (const act of ACTS) {
      const col = document.createElement('div');
      col.className = 'c-act';
      col.style.setProperty('--rc', RACES[act.race].accent);
      col.innerHTML = `<h3>${act.title}</h3><p>${act.blurb}</p>`;
      for (const m of MISSIONS.filter(x => x.act === act.n)) {
        const open = unlocked(m, done), fin = done.has(m.id);
        const card = document.createElement('div');
        card.className = 'c-mission' + (open ? '' : ' locked') + (fin ? ' done' : '');
        const lead = m.briefing[0]?.portrait ?? '';
        card.innerHTML = `<img src="${import.meta.env.BASE_URL}portraits/${lead}.webp${q}" onerror="this.style.visibility='hidden'"><div><b>${MISSIONS.indexOf(m) + 1}. ${m.title}</b><span>${m.subtitle}</span><em>${fin ? '✔ Completed' : open ? RACES[m.race].name + ' vs ' + RACES[m.enemy].name : '🔒 Locked'}</em></div>`;
        if (open) card.onclick = () => { audio.ui('confirm'); $('campaign').classList.add('hidden'); this.briefing(m); };
        col.appendChild(card);
      }
      box.appendChild(col);
    }
    $('campaign').classList.remove('hidden');
  }

  briefing(m: Mission) {
    const el = $('briefing');
    let page = 0;
    const draw = () => {
      const l = m.briefing[page];
      $('brief-title').textContent = `${MISSIONS.indexOf(m) + 1}. ${m.title}`;
      $('brief-sub').textContent = m.subtitle;
      ($('brief-portrait') as HTMLImageElement).src = `${import.meta.env.BASE_URL}portraits/${l.portrait}.webp${q}`;
      $('brief-speaker').textContent = l.speaker;
      this.typeText($('brief-text'), l.text);
      $('brief-objectives').innerHTML = m.objectives.map(o => `<li>${o.optional ? '◇ Optional: ' : '◆ '}${o.label}</li>`).join('');
      $<HTMLButtonElement>('brief-next').textContent = page < m.briefing.length - 1 ? 'Next ▸' : 'Begin Mission';
      audio.unitVoice(m.race === 'kyrrh' && /Matriarch|Brood/.test(l.speaker) ? 'kyrrh' : /Hierarch|Seer/.test(l.speaker) ? 'aethel' : /Matriarch|Brood/.test(l.speaker) ? 'kyrrh' : 'directorate', l.portrait, 'ready', 0.5);
    };
    $('brief-next').onclick = () => {
      audio.ui('click');
      if (page < m.briefing.length - 1) { page++; draw(); return; }
      el.classList.add('hidden');
      this.startGame(m);
    };
    el.classList.remove('hidden');
    draw();
  }

  typeTimer = 0;
  typeText(el: HTMLElement, text: string) {
    clearInterval(this.typeTimer);
    let i = 0;
    el.textContent = '';
    this.typeTimer = window.setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(this.typeTimer); }, 16);
  }

  say(l: Line) { this.commsQueue.push(l); }
  updateComms(dt: number) {
    if (this.commsT > 0) { this.commsT -= dt; if (this.commsT <= 0) $('comms').classList.add('hidden'); return; }
    const l = this.commsQueue.shift();
    if (!l) return;
    ($('comms-portrait') as HTMLImageElement).src = `${import.meta.env.BASE_URL}portraits/${l.portrait}.webp${q}`;
    $('comms-name').textContent = l.speaker;
    this.typeText($('comms-text'), l.text);
    $('comms').classList.remove('hidden');
    const race = /Matriarch|Brood/.test(l.speaker) ? 'kyrrh' : /Hierarch|Seer/.test(l.speaker) ? 'aethel' : 'directorate';
    audio.unitVoice(race, l.portrait, 'ready', 0.5);
    this.commsT = 4 + l.text.length * 0.035;
  }

  portraitId: string | null = null;
  portraitImgs = new Map<string, HTMLImageElement | null>();
  portraitImg(id: string): HTMLImageElement | null {
    if (!this.portraitImgs.has(id)) {
      const im = new Image();
      this.portraitImgs.set(id, null);
      im.onload = () => { this.portraitImgs.set(id, im); if (this.mode === 'menu') this.buildMenu(); };
      im.src = `${import.meta.env.BASE_URL}portraits/${id}.webp${q}`;
    }
    return this.portraitImgs.get(id) ?? null;
  }
  portraitT = 0;
  showPortrait(id: string | null, race: Race | null, color: string) {
    this.portraitId = id;
    const use2d = !!id && (atlas.has(id) || !!this.portraitImg(id));
    $('portrait2d').classList.toggle('hidden', !use2d);
    $('portrait').classList.toggle('hidden', use2d);
    if (!use2d) this.portrait?.show(id, race, color);
  }
  renderPortrait(dt: number) {
    this.portraitT += dt;
    const id = this.portraitId;
    const img = id ? this.portraitImg(id) : null;
    if (id && (img || atlas.has(id))) {
      const cv = $<HTMLCanvasElement>('portrait2d');
      const c = cv.getContext('2d')!;
      c.clearRect(0, 0, cv.width, cv.height);
      if (img) {
        // concept art with a slow cinematic drift + breathing zoom
        const t = this.portraitT, k = 1.06 + Math.sin(t * 0.6) * 0.03;
        const w = cv.width * k, dx = (cv.width - w) / 2 + Math.sin(t * 0.35) * 4, dy = (cv.height - w) / 2 + Math.cos(t * 0.45) * 3;
        c.drawImage(img, dx, dy, w, w);
        const gr = c.createLinearGradient(0, cv.height * 0.7, 0, cv.height);
        gr.addColorStop(0, 'rgba(4,8,14,0)'); gr.addColorStop(1, 'rgba(4,8,14,0.65)');
        c.fillStyle = gr; c.fillRect(0, 0, cv.width, cv.height);
        c.globalAlpha = 0.06 + 0.04 * Math.sin(t * 7); c.fillStyle = '#5ef0ff';
        for (let y = (t * 30) % 6; y < cv.height; y += 6) c.fillRect(0, y, cv.width, 1);
        c.globalAlpha = 1;
      } else atlas.drawTurn(c, id, this.portraitT * 9, cv.width);
    } else this.portrait?.render(dt);
  }

  directorCam(dt: number) {
    const h = this.hot;
    h.heat *= Math.pow(0.5, dt);
    h.t += dt;
    if (!this.director || this.panStart || this.dragStart) return;
    const W = this.cam.w / this.cam.zoom, H = this.viewH / this.cam.zoom;
    const tx = h.x * TILE - W / 2, ty = h.y * TILE - H / 2;
    const k = 1 - Math.pow(0.35, dt);
    if (h.heat > 3) { this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k; this.clampCam(); }
  }

  updateSpecBar() {
    const g = this.game!;
    const row = (i: number) => {
      const p = g.players[i];
      const units = g.entities.filter(e => e.alive && e.owner === i && e.type === 'unit');
      const workers = units.filter(u => u.def!.worker).length;
      const army = units.filter(u => !u.def!.worker).reduce((s, u) => s + u.def!.supply, 0);
      return `<div class="sp" style="border-color:${p.color}"><b style="color:${p.color}">${p.name}</b> <span>${TIER_NAMES[g.tierOf(i)]}</span>` +
        `<span class="m">${Math.floor(p.minerals)}</span><span class="g">${Math.floor(p.gas)}</span><span>${Math.ceil(p.supplyUsed)}/${p.supplyCap}</span>` +
        `<span>Workers ${workers}</span><span>Army ${army}</span><span>Kills ${p.stats.kills}</span>${p.alive ? '' : '<span style="color:#ff6060">ELIMINATED</span>'}</div>`;
    };
    $('spec-players').innerHTML = row(0) + row(1);
  }

  // =============================================================== HUD
  updateHUD() {
    const g = this.game!, p = g.players[this.me];
    if (this.spectator) this.updateSpecBar();
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
      this.showPortrait(null, null, '#fff');
      if (this.infoKey !== 'none') { this.infoKey = 'none'; body.innerHTML = `<div class="race">${RACES[this.race].name}</div><div style="color:#7f95ab">Select units or structures. Right-click to command.</div>`; }
      return;
    }
    if (sel.length === 1) {
      const e = sel[0], d = e.def!, p = g.players[e.owner];
      this.showPortrait(d.id, d.race, p?.color ?? '#fff');
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
    this.showPortrait(prim.def!.id, prim.def!.race, g.players[prim.owner]?.color ?? '#fff');
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

  mmLayer: HTMLCanvasElement | null = null;
  mmFrame = 0;
  drawMinimap(dt: number) {
    const g = this.game!;
    const cv = $<HTMLCanvasElement>('minimap');
    const c = cv.getContext('2d')!;
    const S = cv.width / g.map.w;
    // fog + creep layer at map resolution, refreshed every 6 frames and scaled up with smoothing
    if (!this.mmLayer) { this.mmLayer = document.createElement('canvas'); this.mmLayer.width = g.map.w; this.mmLayer.height = g.map.h; }
    if (this.mmFrame++ % 6 === 0) {
      const lc = this.mmLayer.getContext('2d')!;
      const img = lc.createImageData(g.map.w, g.map.h);
      const d = img.data, vis = g.visible[this.me], exp = g.explored[this.me];
      for (let i = 0; i < g.map.w * g.map.h; i++) {
        const o = i * 4;
        if (g.creep[i]) { d[o] = 120; d[o + 1] = 40; d[o + 2] = 110; d[o + 3] = 150; }
        if (!this.spectator && !vis[i]) { const a = exp[i] ? 115 : 215; d[o] = d[o] * 0.3; d[o + 1] = d[o + 1] * 0.3; d[o + 2] = d[o + 2] * 0.3; d[o + 3] = Math.max(d[o + 3], a); }
      }
      lc.putImageData(img, 0, 0);
    }
    if (this.mmTerrain) c.drawImage(this.mmTerrain, 0, 0);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.mmLayer, 0, 0, cv.width, cv.height);
    for (const e of g.entities) {
      if (!e.alive || e.hidden) continue;
      if (e.type === 'mineral' || e.type === 'geyser') {
        if (!this.spectator && !(e.seenMask & (1 << this.me)) && !g.explored[this.me][Math.floor(e.y) * g.map.w + Math.floor(e.x)]) continue;
        c.fillStyle = e.type === 'mineral' ? '#58b8ff' : '#5dffa0';
        c.fillRect(e.tx * S, e.ty * S, Math.max(2, e.w * S), Math.max(2, e.h * S));
        continue;
      }
      if (!this.spectator && e.owner !== this.me) {
        if (e.isBuilding ? !(e.seenMask & (1 << this.me)) : !g.isVisibleTo(this.me, e)) continue;
      }
      c.fillStyle = g.players[e.owner].color;
      if (e.isBuilding) c.fillRect(e.tx * S, e.ty * S, e.w * S, e.h * S);
      else c.fillRect(e.x * S - 1.5, e.y * S - 1.5, 3, 3);
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
