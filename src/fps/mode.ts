// FPS campaign shell: mission select, briefing, intro cinematic, HUD, pause and end screens.
import './fps.css';
import { audio } from '../audio/audio';
import { q } from '../assetver';
import { DIFFICULTY, Difficulty, FpsGame, HudState, lockPointer } from './fps';
import { Cinematic } from './cinematic';
import { FPS_MISSIONS, FpsMission, OPERATION, fpsProgress, fpsSave, Radio } from './story';

const BASE = import.meta.env.BASE_URL;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const HTML = `
<div id="fps-root" class="hidden">
  <canvas id="fps-canvas"></canvas>
  <canvas id="cine-canvas" class="hidden"></canvas>
  <div id="cine-fade"></div>
  <div id="cine-sub" class="hidden"><img alt=""><div><b></b><p></p></div></div>
  <button id="cine-skip" class="hidden">Skip ▸▸</button>

  <div id="fps-hud" class="hidden">
    <div id="fps-cross"><i></i><i></i><i></i><i></i></div>
    <div id="fps-hit"></div>
    <div id="fps-vignette"></div>
    <div id="fps-obj"></div>
    <div id="fps-radio" class="hidden"><img alt=""><div><b></b><p></p></div></div>
    <div id="fps-msg"></div>
    <div id="fps-prompt"></div>
    <div id="fps-boss" class="hidden"><span></span><div><i></i></div></div>
    <canvas id="fps-radar" width="180" height="180"></canvas>
    <div id="fps-status">
      <div id="fps-mode"></div>
      <div class="fps-bar"><i id="fps-hp"></i><span id="fps-hptext"></span></div>
    </div>
    <div id="fps-weapon"><div id="fps-wname"></div><div id="fps-ammo"></div>
      <div id="fps-abil">
        <div class="ab" id="ab-q"><b>Q</b><span>Overdrive</span><i></i></div>
        <div class="ab" id="ab-f"><b>F</b><span>Anchor</span><i></i></div>
        <div class="ab" id="ab-r"><b>R</b><span>Solar Lance</span><i></i></div>
        <div class="ab" id="ab-e"><b>E</b><span>Board/Exit</span><i></i></div>
      </div>
    </div>
    <div id="fps-lock">Click to take control · Esc to pause</div>
  </div>

  <div id="fps-menu" class="screen overlay hidden">
    <div class="panel wide">
      <h2>${OPERATION.title}</h2>
      <p class="c-intro">${OPERATION.tagline} A first-person campaign: you are Ember-One, a Vanguard Directorate trooper dropped onto Vorrhaal, homeworld of the Kyrrh Swarm.</p>
      <div class="fps-diff"><span>Difficulty</span>
        <button data-diff="easy">Easy</button><button data-diff="medium">Medium</button><button data-diff="hard">Hard</button>
        <em id="fps-diff-desc"></em></div>
      <div id="fps-missions"></div>
      <div class="row buttons"><button id="fps-intro-btn">▶ Watch intro cinematic</button><button id="fps-back">Back</button></div>
    </div>
  </div>

  <div id="fps-brief" class="screen overlay hidden">
    <div class="panel wide brief">
      <div class="brief-head"><h2 id="fb-title"></h2><span id="fb-sub"></span></div>
      <div class="brief-body"><img id="fb-portrait" alt=""><div class="brief-talk"><b>Commander Ilse Varga</b><p id="fb-text"></p>
        <h4>Objectives</h4><ul id="fb-obj"></ul><p id="fb-diff" class="fps-keys"></p>
        <h4>Controls</h4><p class="fps-keys"><b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump · <b>Mouse</b> aim · <b>LMB (hold)</b> automatic fire · <b>1/2</b> assault rifle / HE grenades · <b>R</b> reload · <b>Q</b> Overdrive · <b>E</b> board / exit mech · <b>F</b> Anchor Mode (Juggernaut) · <b>R</b> Solar Lance (when available) · <b>Esc</b> pause</p></div></div>
      <div class="row buttons"><button id="fb-go" class="big">Deploy ▸</button><button id="fb-back">Back</button></div>
    </div>
  </div>

  <div id="fps-pause" class="screen overlay hidden">
    <div class="panel"><h2>Paused</h2><div class="row buttons"><button id="fp-resume" class="big">Resume</button><button id="fp-restart">Restart</button><button id="fp-quit">Abort mission</button></div></div>
  </div>

  <div id="fps-end" class="screen overlay hidden">
    <div class="panel"><h1 id="fe-title"></h1><p id="fe-text"></p><table id="fe-stats"></table>
      <div class="row buttons"><button id="fe-next" class="big hidden">Next mission ▸</button><button id="fe-again">Retry</button><button id="fe-menu">Operation menu</button></div></div>
  </div>
</div>`;

export class FpsMode {
  private game: FpsGame | null = null;
  private cine: Cinematic | null = null;
  private current: FpsMission | null = null;
  private msgTimer = 0; private radioTimer = 0;
  private lastHud = 0;
  private difficulty: Difficulty = loadDifficulty();

  constructor(private exitToMenu: () => void, private hideMenu: () => void) {
    document.body.insertAdjacentHTML('beforeend', HTML);
    // the Vorrhaal sky (Kaggle SDXL) behind the menus; the game and cinematic canvases cover it while playing
    $('fps-root').style.background = `linear-gradient(rgba(2,4,10,.25), rgba(2,4,10,.8)), url(${BASE}env/sky.webp${q}) center / cover, #000`;
    $('fps-back').onclick = () => { audio.ui('click'); this.close(); };
    $('fps-intro-btn').onclick = () => { audio.ui('confirm'); this.playIntro(null); };
    $('fb-back').onclick = () => { audio.ui('click'); $('fps-brief').classList.add('hidden'); this.openMenu(); };
    $('fb-go').onclick = () => {
      audio.ui('confirm'); $('fps-brief').classList.add('hidden');
      const m = this.current!;
      if (m === FPS_MISSIONS[0]) this.playIntro(m); else this.launch(m);
    };
    $('fp-resume').onclick = () => this.resume();
    $('fp-restart').onclick = () => { $('fps-pause').classList.add('hidden'); this.launch(this.current!); };
    $('fp-quit').onclick = () => { $('fps-pause').classList.add('hidden'); this.stopGame(); this.openMenu(); };
    $('fe-again').onclick = () => { $('fps-end').classList.add('hidden'); this.launch(this.current!); };
    $('fe-menu').onclick = () => { $('fps-end').classList.add('hidden'); this.stopGame(); this.openMenu(); };
    $('fe-next').onclick = () => { $('fps-end').classList.add('hidden'); const i = FPS_MISSIONS.indexOf(this.current!); this.stopGame(); this.brief(FPS_MISSIONS[i + 1]); };
    $('cine-skip').onclick = () => this.cine?.skip();
    document.querySelectorAll<HTMLButtonElement>('.fps-diff button').forEach(b => b.onclick = () => { audio.ui('click'); this.setDifficulty(b.dataset.diff as Difficulty); });
    this.setDifficulty(this.difficulty);
    $('fps-canvas').addEventListener('click', () => { if (this.game && !this.game.over && !this.game.paused) lockPointer($('fps-canvas')); });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === $('fps-canvas');
      $('fps-lock').classList.toggle('hidden', locked);
      if (!locked && this.game && !this.game.over && !this.game.paused && this.wasLocked) this.pause();
      this.wasLocked = locked;
    });
    addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.cine) this.cine.skip();
      if (e.code === 'Tab' && this.game) e.preventDefault();
    });
  }
  private wasLocked = false;

  private setDifficulty(d: Difficulty) {
    this.difficulty = d;
    try { localStorage.setItem(DIFF_KEY, d); } catch { /* private mode */ }
    document.querySelectorAll<HTMLButtonElement>('.fps-diff button').forEach(b => b.classList.toggle('on', b.dataset.diff === d));
    $('fps-diff-desc').textContent = DIFFICULTY[d].desc;
  }

  open() { this.hideMenu(); $('fps-root').classList.remove('hidden'); this.openMenu(); }
  close() { $('fps-menu').classList.add('hidden'); $('fps-root').classList.add('hidden'); this.exitToMenu(); }

  openMenu() {
    const done = fpsProgress();
    const list = $('fps-missions'); list.innerHTML = '';
    FPS_MISSIONS.forEach((m, i) => {
      const open = i === 0 || done.has(FPS_MISSIONS[i - 1].id);
      const card = document.createElement('div');
      card.className = `m-card fps-card ${open ? '' : 'locked'} ${done.has(m.id) ? 'done' : ''}`;
      const mech = m.unlock.length ? `<span class="mech">Unlocks: ${m.unlock.map(u => u === 'titan' ? 'Titan (Tier 3)' : 'Juggernaut (Tier 2)').join(', ')}</span>` : '<span class="mech">On foot</span>';
      card.innerHTML = `<div class="fps-thumb fps-${m.biome}" style="background-image:linear-gradient(transparent,rgba(0,0,0,.55)),url(${BASE}env/tex_${m.biome === 'creep' ? 'creep' : m.biome}.webp${q})"></div><div><h4>${i + 1}. ${m.title}${done.has(m.id) ? ' ✔' : ''}</h4><p>${m.subtitle}</p>${mech}</div>`;
      if (open) card.onclick = () => { audio.ui('confirm'); this.brief(m); };
      list.appendChild(card);
    });
    $('fps-menu').classList.remove('hidden');
    audio.playMusic('menu');
  }

  brief(m: FpsMission) {
    this.current = m;
    $('fps-menu').classList.add('hidden');
    $('fb-title').textContent = m.title; $('fb-sub').textContent = m.subtitle;
    $('fb-text').textContent = m.briefing;
    $<HTMLImageElement>('fb-portrait').src = `${BASE}portraits/trooper.webp${q}`;
    $('fb-obj').innerHTML = m.objectives.map(o => `<li>${o.label}</li>`).join('');
    $('fb-diff').innerHTML = `Difficulty: <b>${DIFFICULTY[this.difficulty].label}</b> (change it on the operation menu)`;
    $('fps-brief').classList.remove('hidden');
  }

  private async playIntro(then: FpsMission | null) {
    $('fps-menu').classList.add('hidden');
    const canvas = $<HTMLCanvasElement>('cine-canvas');
    canvas.classList.remove('hidden'); $('fps-canvas').classList.add('hidden');
    const fade = $('cine-fade'); fade.style.opacity = '1';
    this.loadingText('Approaching Vorrhaal…');
    const sub = $('cine-sub');
    const cine = new Cinematic(canvas, {
      subtitle: l => {
        sub.classList.toggle('hidden', !l);
        if (!l) return;
        sub.classList.toggle('narr', !l.speaker);
        sub.querySelector('b')!.textContent = l.speaker ?? '';
        sub.querySelector('p')!.textContent = l.text;
        const img = sub.querySelector('img')!;
        img.style.display = l.portrait ? '' : 'none';
        if (l.portrait) img.src = `${BASE}portraits/${l.portrait}.webp${q}`;
      },
      done: () => {
        this.cine = null;
        canvas.classList.add('hidden'); $('cine-skip').classList.add('hidden'); sub.classList.add('hidden');
        fade.style.opacity = '0';
        if (then) this.launch(then); else this.openMenu();
      },
    }, fade);
    this.cine = cine;
    (window as any).__cine = cine;
    await cine.load(f => this.loadingBar(f));
    this.loadingDone();
    $('cine-skip').classList.remove('hidden');
    cine.start();
  }

  private loadingText(t: string) { $('loading').classList.remove('hidden'); $('loading-text').textContent = t; $('loading-bar').style.width = '0%'; }
  private loadingBar(f: number) { $('loading-bar').style.width = `${Math.round(f * 100)}%`; }
  private loadingDone() { $('loading').classList.add('hidden'); }

  async launch(m: FpsMission) {
    this.stopGame();
    this.current = m;
    const canvas = $<HTMLCanvasElement>('fps-canvas');
    canvas.classList.remove('hidden');
    this.loadingText(`Dropping into ${m.title}…`);
    const game = new FpsGame(canvas, m, {
      radio: r => this.radio(r),
      objectives: html => { $('fps-obj').innerHTML = html; },
      hud: h => this.hud(h),
      message: (t, k) => this.message(t, k),
      end: (win, text) => this.end(win, text),
    }, 7 + FPS_MISSIONS.indexOf(m) * 11, this.difficulty);
    this.game = game;
    (window as any).__fps = game;
    await game.preload(f => this.loadingBar(f));
    if (this.game !== game) return;
    this.loadingDone();
    $('fps-hud').classList.remove('hidden');
    game.start();
    audio.playMusic('kyrrh');
    lockPointer(canvas);
  }

  stopGame() {
    this.game?.dispose(); this.game = null;
    if (document.pointerLockElement) document.exitPointerLock();
    $('fps-hud').classList.add('hidden');
    $('fps-radio').classList.add('hidden');
  }

  private pause() { if (!this.game) return; this.game.paused = true; $('fps-pause').classList.remove('hidden'); }
  private resume() { if (!this.game) return; $('fps-pause').classList.add('hidden'); this.game.paused = false; lockPointer($('fps-canvas')); }

  private radio(r: Radio) {
    const el = $('fps-radio');
    el.querySelector('b')!.textContent = r.speaker;
    el.querySelector('p')!.textContent = r.text;
    el.querySelector('img')!.src = `${BASE}portraits/${r.portrait}.webp${q}`;
    el.classList.remove('hidden');
    audio.ui('open');
    clearTimeout(this.radioTimer);
    this.radioTimer = window.setTimeout(() => el.classList.add('hidden'), 7000);
  }
  private message(t: string, k: 'info' | 'warn' = 'info') {
    const el = $('fps-msg'); el.textContent = t; el.className = k; el.style.opacity = '1';
    clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => { el.style.opacity = '0'; }, 2600);
  }

  private hud(h: HudState) {
    const now = performance.now();
    $('fps-vignette').style.opacity = String(Math.min(0.85, h.hurt + (h.hp / h.maxHp < 0.3 ? 0.25 : 0)));
    $('fps-hit').style.opacity = h.hitmark > 0 ? '1' : '0';
    if (now - this.lastHud < 50) return;          // text/DOM updates at 20 Hz
    this.lastHud = now;
    $('fps-hp').style.width = `${(h.hp / h.maxHp) * 100}%`;
    $('fps-hp').className = h.hp / h.maxHp < 0.3 ? 'low' : '';
    $('fps-hptext').textContent = `${Math.ceil(h.hp)} / ${h.maxHp}`;
    $('fps-mode').textContent = h.mode === 'foot' ? 'TROOPER · EMBER-ONE' : h.mode === 'juggernaut' ? `JUGGERNAUT · ${h.anchor}` : 'TITAN WAR-WALKER';
    $('fps-wname').textContent = h.weapon; $('fps-ammo').textContent = h.ammo;
    $('fps-cross').className = h.mode;
    const ab = (id: string, show: boolean, ready: boolean, label?: string) => {
      const el = $(id); el.style.display = show ? '' : 'none'; el.classList.toggle('ready', ready);
      if (label !== undefined) el.querySelector('i')!.textContent = label;
    };
    ab('ab-q', h.mode === 'foot', h.overdrive <= 0, h.overdrive > 0 ? `${Math.ceil(h.overdrive)}s` : '');
    ab('ab-f', h.mode === 'juggernaut', h.anchor !== 'TRANSFORMING', h.anchor === 'ANCHORED' ? 'ON' : '');
    ab('ab-r', h.lanceReady || h.lance > 0, h.lanceReady, h.lance > 0 ? `${Math.ceil(h.lance)}s` : '');
    ab('ab-e', h.prompt !== '', true);
    $('fps-prompt').textContent = h.prompt.startsWith('Press') ? h.prompt : '';
    const boss = $('fps-boss');
    boss.classList.toggle('hidden', !h.boss);
    if (h.boss) { boss.querySelector('span')!.textContent = h.boss.name; (boss.querySelector('i') as HTMLElement).style.width = `${h.boss.frac * 100}%`; }
    // radar (player-up)
    const c = $<HTMLCanvasElement>('fps-radar').getContext('2d')!;
    const R = 90, range = 110;
    c.clearRect(0, 0, 180, 180);
    c.fillStyle = 'rgba(6,14,24,0.7)'; c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(94,240,255,0.35)'; c.lineWidth = 1;
    for (const rr of [R / 3, (R * 2) / 3, R - 2]) { c.beginPath(); c.arc(R, R, rr, 0, Math.PI * 2); c.stroke(); }
    const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
    for (const b of h.radar) {
      const x = b.x * cs - b.z * sn, y = b.x * sn + b.z * cs;
      const d = Math.hypot(x, y); if (d > range && !b.pod && !b.big) continue;
      const k = Math.min(1, d / range) * (R - 6) / (d || 1);
      c.fillStyle = b.pod ? '#ffb347' : b.big ? '#ff4fd8' : b.air ? '#ffd05a' : '#ff5a5a';
      c.beginPath(); c.arc(R + x * k, R + y * k, b.big || b.pod ? 5 : 3, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#5ef0ff'; c.beginPath(); c.moveTo(R, R - 7); c.lineTo(R - 5, R + 5); c.lineTo(R + 5, R + 5); c.fill();
  }

  private end(win: boolean, text: string) {
    const g = this.game!, m = this.current!;
    if (document.pointerLockElement) document.exitPointerLock();
    if (win) { const d = fpsProgress(); d.add(m.id); fpsSave(d); }
    audio.playMusic(win ? 'victory' : 'defeat');
    setTimeout(() => {
      $('fe-title').textContent = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
      $('fe-title').className = win ? 'win' : 'lose';
      $('fe-text').textContent = text;
      const kills = [...g.kills.entries()].map(([k, n]) => `<tr><td>${k[0].toUpperCase() + k.slice(1)}</td><td>${n}</td></tr>`).join('');
      $('fe-stats').innerHTML = `<tr><td>Difficulty</td><td>${DIFFICULTY[g.difficulty].label}</td></tr><tr><td>Time</td><td>${Math.floor(g.elapsed / 60)}:${String(Math.floor(g.elapsed % 60)).padStart(2, '0')}</td></tr>${kills}`;
      const i = FPS_MISSIONS.indexOf(m);
      $('fe-next').classList.toggle('hidden', !win || !FPS_MISSIONS[i + 1]);
      $('fps-end').classList.remove('hidden');
    }, win ? 1200 : 1800);
  }
}

const DIFF_KEY = 'nd-fps-difficulty';
function loadDifficulty(): Difficulty {
  try { const d = localStorage.getItem(DIFF_KEY); if (d === 'easy' || d === 'medium' || d === 'hard') return d; } catch { /* ignore */ }
  return 'medium';
}
