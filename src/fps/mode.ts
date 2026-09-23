// FPS campaign shell: mission select, briefing, intro cinematic, HUD, pause and end screens.
import './fps.css';
import { audio } from '../audio/audio';
import { q } from '../assetver';
import { CoopLink, DIFFICULTY, Difficulty, FpsGame, HudState, lockPointer } from './fps';
import { Lobby, LobbyMsg, Presence } from '../net/lobby';
import { PeerLink } from '../net/link';
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
      <div id="fps-ally" class="hidden"><span></span><div class="fps-bar"><i></i></div></div>
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
    <div id="fps-net"></div>
  </div>

  <div id="fps-menu" class="screen overlay hidden">
    <div class="panel wide">
      <h2>${OPERATION.title}</h2>
      <p class="c-intro">${OPERATION.tagline} A first-person campaign: you are Ember-One, a Vanguard Directorate trooper dropped onto Vorrhaal, homeworld of the Kyrrh Swarm.</p>
      <div class="fps-diff"><span>Difficulty</span>
        <button data-diff="easy">Easy</button><button data-diff="medium">Medium</button><button data-diff="hard">Hard</button>
        <em id="fps-diff-desc"></em></div>
      <div id="fps-missions"></div>
      <div class="fps-online">
        <div class="on-head"><b>Online co-op</b><span id="on-status">connecting…</span>
          <label>Call sign <input id="on-name" maxlength="16" spellcheck="false"></label></div>
        <div id="on-invite" class="hidden"></div>
        <div id="on-squad" class="hidden"></div>
        <div id="on-list"></div>
        <p class="on-note">Everyone with Iron Descent open, on the website or the Windows app, appears here automatically. Invite a player to form a squad: the host picks the mission and both of you drop in together.</p>
      </div>
      <div class="row buttons"><button id="fps-intro-btn">▶ Watch intro cinematic</button><button id="fps-back">Back</button>
        <a id="fps-download" class="dl-btn" href="https://github.com/Everaldtah/nebula-dominion/releases/latest/download/IronDescent-Setup.exe">⬇ Windows app: play on your own GPU</a></div>
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
  // online
  lobby: Lobby | null = null;
  squad: { peer: string; name: string; sid: string; role: 'host' | 'guest'; link: PeerLink } | null = null;
  private outgoing: { to: string; sid: string } | null = null;
  private incoming: { from: string; name: string; sid: string } | null = null;
  private playDifficulty: Difficulty = 'medium';

  constructor(private exitToMenu: () => void, private hideMenu: () => void) {
    document.body.insertAdjacentHTML('beforeend', HTML);
    (window as any).__fpsMode = this;
    // the Vorrhaal sky (Kaggle SDXL) behind the menus; the game and cinematic canvases cover it while playing
    $('fps-root').style.background = `linear-gradient(rgba(2,4,10,.25), rgba(2,4,10,.8)), url(${BASE}env/sky.webp${q}) center / cover, #000`;
    $('fps-back').onclick = () => { audio.ui('click'); this.close(); };
    $('fps-intro-btn').onclick = () => { audio.ui('confirm'); this.playIntro(null); };
    $('fb-back').onclick = () => { audio.ui('click'); $('fps-brief').classList.add('hidden'); this.openMenu(); };
    $('fb-go').onclick = () => { audio.ui('confirm'); $('fps-brief').classList.add('hidden'); this.startMission(this.current!, true); };
    $('fp-resume').onclick = () => this.resume();
    $('fp-restart').onclick = () => { $('fps-pause').classList.add('hidden'); if (this.squad?.role === 'guest') return; this.startMission(this.current!, false); };
    $('fp-quit').onclick = () => { $('fps-pause').classList.add('hidden'); this.stopGame(); this.openMenu(); };
    $('fe-again').onclick = () => { $('fps-end').classList.add('hidden'); this.startMission(this.current!, false); };
    $('fe-menu').onclick = () => { $('fps-end').classList.add('hidden'); this.stopGame(); this.openMenu(); };
    $('fe-next').onclick = () => { $('fps-end').classList.add('hidden'); const i = FPS_MISSIONS.indexOf(this.current!); this.stopGame(); this.brief(FPS_MISSIONS[i + 1]); };
    $('cine-skip').onclick = () => this.cine?.skip();
    document.querySelectorAll<HTMLButtonElement>('.fps-diff button').forEach(b => b.onclick = () => { audio.ui('click'); this.setDifficulty(b.dataset.diff as Difficulty); });
    this.setDifficulty(this.difficulty);
    const desktop = /Electron/i.test(navigator.userAgent);
    if (desktop) $('fps-download').remove();
    this.startLobby(desktop ? 'desktop' : 'web');
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

  /** Solo: play (with the intro before mission 1). Squad host: tell the partner to drop in too. */
  private startMission(m: FpsMission, allowIntro: boolean) {
    if (this.squad?.role === 'host') {
      this.squad.link.send({ t: 'start', mission: m.id, difficulty: this.difficulty });
      this.launch(m);
    } else if (allowIntro && m === FPS_MISSIONS[0] && !this.squad) this.playIntro(m);
    else this.launch(m);
  }

  // ================================================================ online lobby
  private startLobby(platform: 'web' | 'desktop') {
    let name = '';
    try { name = localStorage.getItem('nd-fps-name') ?? ''; } catch { /* ignore */ }
    if (!name) name = `Trooper-${Math.floor(1000 + Math.random() * 9000)}`;
    const input = $<HTMLInputElement>('on-name');
    input.value = name;
    input.onchange = () => {
      const n = input.value.trim().slice(0, 16) || name;
      input.value = n; try { localStorage.setItem('nd-fps-name', n); } catch { /* ignore */ }
      this.lobby?.setName(n);
    };
    input.onkeydown = e => e.stopPropagation();
    const lobby = this.lobby = new Lobby(name, platform);
    lobby.onPlayers = () => this.renderLobby();
    lobby.onStatus = n => { $('on-status').textContent = n ? `online · ${n === 2 ? 'dual' : 'single'} broker` : 'reconnecting…'; $('on-status').className = n ? 'up' : 'down'; };
    lobby.onMessage = m => this.onLobbyMsg(m);
    lobby.connect();
    (window as any).__lobby = lobby;
    window.setInterval(() => this.renderSquad(), 1000);
    this.renderLobby();
  }

  private onLobbyMsg(m: LobbyMsg) {
    const sid = String(m.sid ?? '');
    const who = (id: string) => this.lobby?.players.get(id)?.name ?? String(m.name ?? 'A player');
    switch (m.t) {
      case 'invite':
        if (this.squad || this.incoming || this.game) { this.lobby!.send(m.from, { t: 'decline', sid, busy: true }); return; }
        this.incoming = { from: m.from, name: esc(String(m.name ?? who(m.from))).slice(0, 40), sid };
        audio.ui('open'); this.renderInvite(); return;
      case 'cancel': if (this.incoming?.sid === sid) { this.incoming = null; this.renderInvite(); } return;
      case 'accept': if (this.outgoing?.sid === sid) { this.outgoing = null; this.formSquad('host', m.from, who(m.from), sid); } return;
      case 'decline':
        if (this.outgoing?.sid === sid) { this.outgoing = null; this.toast(`${esc(who(m.from))} ${m.busy ? 'is busy' : 'declined'}`); this.renderLobby(); }
        return;
      case 'sig': if (this.squad?.sid === sid) this.squad.link.handleSignal(m as any); return;
      case 'relay': if (this.squad?.sid === sid) this.squad.link.handleRelay(m.d); return;
      case 'leave': if (this.squad?.sid === sid) this.leaveSquad(false, `${esc(this.squad.name)} left the squad`); return;
    }
  }

  invite(to: string) {
    if (!this.lobby || this.squad || this.outgoing) return;
    const sid = Math.random().toString(36).slice(2, 10);
    this.outgoing = { to, sid };
    this.lobby.send(to, { t: 'invite', sid, name: this.lobby.me.name });
    audio.ui('click'); this.renderLobby();
    window.setTimeout(() => { if (this.outgoing?.sid === sid) { this.lobby!.send(to, { t: 'cancel', sid }); this.outgoing = null; this.toast('No answer'); this.renderLobby(); } }, 30_000);
  }
  acceptInvite() {
    const inv = this.incoming; if (!inv || !this.lobby) return;
    this.incoming = null; this.renderInvite();
    this.lobby.send(inv.from, { t: 'accept', sid: inv.sid });
    this.formSquad('guest', inv.from, inv.name, inv.sid);
  }
  private declineInvite() {
    const inv = this.incoming; if (!inv) return;
    this.incoming = null; this.renderInvite();
    this.lobby?.send(inv.from, { t: 'decline', sid: inv.sid });
  }

  private formSquad(role: 'host' | 'guest', peer: string, name: string, sid: string) {
    let forceRelay = false;
    try { forceRelay = localStorage.getItem('nd-net-relay') === '1'; } catch { /* ignore */ }
    const link = new PeerLink(this.lobby!, peer, sid, role === 'host', forceRelay);
    this.squad = { peer, name: esc(name), sid, role, link };
    link.onMessage = msg => this.onLinkMsg(msg);
    link.onState = st => { this.renderSquad(); if (st === 'closed') this.partnerLost(); };
    this.lobby!.setStatus('squad');
    audio.ui('confirm');
    this.toast(role === 'host' ? `${this.squad.name} joined your squad. Pick a mission` : `You joined ${this.squad.name}'s squad. The host picks the mission`);
    this.renderLobby(); this.renderSquad();
    if (!$('fps-menu').classList.contains('hidden')) this.openMenu();
  }
  leaveSquad(notify = true, reason = '') {
    const sq = this.squad; if (!sq) return;
    if (notify) { sq.link.send({ t: 'leave' }); this.lobby?.send(sq.peer, { t: 'leave', sid: sq.sid }); }
    this.squad = null;
    sq.link.onState = null; sq.link.close();
    this.lobby?.setStatus(this.game ? 'playing' : 'lobby');
    if (reason) this.toast(reason);
    this.afterPartnerGone(sq);
    this.renderLobby(); this.renderSquad();
    if (!$('fps-menu').classList.contains('hidden')) this.openMenu();
  }
  private partnerLost() {
    const sq = this.squad; if (!sq) return;
    this.squad = null;
    this.lobby?.setStatus(this.game ? 'playing' : 'lobby');
    this.toast(`Lost contact with ${sq.name}`);
    this.afterPartnerGone(sq);
    this.renderLobby(); this.renderSquad();
  }
  /** The host plays on alone; a guest's mission ends (the host ran the swarm). */
  private afterPartnerGone(sq: { role: 'host' | 'guest'; name: string }) {
    const g = this.game; if (!g || !g.coop || g.over) return;
    if (sq.role === 'host') { g.coop = null; if (g.ally) g.ally.lastMsg = 0; this.message(`${sq.name} disconnected. You're on your own`, 'warn'); }
    else { g.over = true; g.result = 'lose'; this.end(false, `Lost connection to ${sq.name}, who was hosting the mission.`); }
  }

  private onLinkMsg(msg: any) {
    if (msg.t === 'start' && this.squad?.role === 'guest') {
      const m = FPS_MISSIONS.find(x => x.id === msg.mission); if (!m) return;
      this.playDifficulty = (['easy', 'medium', 'hard'] as Difficulty[]).includes(msg.difficulty) ? msg.difficulty : 'medium';
      for (const id of ['fps-menu', 'fps-brief', 'fps-end', 'fps-pause']) $(id).classList.add('hidden');
      this.toast(`${this.squad.name} is deploying: ${m.title}`);
      this.launch(m);
      return;
    }
    if (msg.t === 'leave') { this.leaveSquad(false, `${this.squad?.name ?? 'Your partner'} left the squad`); return; }
    this.game?.onNet(msg);
  }

  private renderLobby() {
    const lobby = this.lobby; if (!lobby) return;
    const list = [...lobby.players.values()].sort((a, b) => a.name.localeCompare(b.name));
    const el = $('on-list');
    if (!list.length) { el.innerHTML = `<div class="on-empty">Nobody else is online right now. Leave this open: anyone who launches Iron Descent will appear here.</div>`; return; }
    el.innerHTML = `<div class="on-count">${list.length} player${list.length > 1 ? 's' : ''} online</div>` + list.map((p: Presence) => {
      const inviting = this.outgoing?.to === p.id;
      const can = p.status === 'lobby' && !this.squad && !this.outgoing && !this.game;
      const status = p.status === 'lobby' ? 'in the menu' : p.status === 'squad' ? 'in a squad' : `playing${p.mission ? ' ' + esc(FPS_MISSIONS.find(m => m.id === p.mission)?.title ?? '') : ''}`;
      return `<div class="on-row"><span class="on-plat">${p.platform === 'desktop' ? '🖥' : '🌐'}</span><b>${esc(p.name)}</b><em>${status}</em>` +
        (inviting ? `<span class="on-wait">Inviting…</span>` : `<button data-invite="${esc(p.id)}" ${can ? '' : 'disabled'}>Invite</button>`) + `</div>`;
    }).join('');
    el.querySelectorAll<HTMLButtonElement>('[data-invite]').forEach(b => b.onclick = () => this.invite(b.dataset.invite!));
  }
  private renderInvite() {
    const el = $('on-invite'), inv = this.incoming;
    el.classList.toggle('hidden', !inv);
    if (!inv) return;
    el.innerHTML = `<b>${inv.name}</b> invites you to a co-op squad <button id="on-accept" class="big">Accept</button><button id="on-decline">Decline</button>`;
    $('on-accept').onclick = () => this.acceptInvite();
    $('on-decline').onclick = () => this.declineInvite();
  }
  private renderSquad() {
    const el = $('on-squad'), sq = this.squad;
    el.classList.toggle('hidden', !sq);
    const net = $('fps-net');
    if (!sq) { net.textContent = ''; return; }
    const st = sq.link.state === 'p2p' ? 'direct P2P' : sq.link.state === 'relay' ? 'relayed' : 'connecting…';
    const ping = sq.link.rtt ? ` · ${Math.round(sq.link.rtt)} ms` : '';
    el.innerHTML = `Squad: <b>You</b> (${sq.role}) + <b>${sq.name}</b> <span class="on-link ${sq.link.state}">${st}${ping}</span>` +
      (sq.role === 'guest' ? ` <em>The host picks the mission and difficulty</em>` : '') + ` <button id="on-leave">Leave squad</button>`;
    $('on-leave').onclick = () => this.leaveSquad(true);
    net.textContent = this.game?.coop ? `CO-OP · ${sq.name} · ${st}${ping}` : '';
  }
  private toast(html: string) {
    let el = document.getElementById('on-toast');
    if (!el) { el = document.createElement('div'); el.id = 'on-toast'; $('fps-root').appendChild(el); }
    el.innerHTML = html; el.classList.add('show');
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => el!.classList.remove('show'), 4000);
  }
  private toastT = 0;

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
      if (open) card.onclick = () => {
        if (this.squad?.role === 'guest') { this.toast(`${this.squad.name} is hosting: the host picks the mission`); return; }
        audio.ui('confirm'); this.brief(m);
      };
      list.appendChild(card);
    });
    $('fps-menu').classList.remove('hidden');
    document.querySelectorAll<HTMLButtonElement>('.fps-diff button').forEach(b => { b.disabled = this.squad?.role === 'guest'; });
    this.renderLobby(); this.renderSquad();
    audio.playMusic('menu');
  }

  brief(m: FpsMission) {
    this.current = m;
    $('fps-menu').classList.add('hidden');
    $('fb-title').textContent = m.title; $('fb-sub').textContent = m.subtitle;
    $('fb-text').textContent = m.briefing;
    $<HTMLImageElement>('fb-portrait').src = `${BASE}portraits/trooper.webp${q}`;
    $('fb-obj').innerHTML = m.objectives.map(o => `<li>${o.label}</li>`).join('');
    $('fb-diff').innerHTML = `Difficulty: <b>${DIFFICULTY[this.difficulty].label}</b> (change it on the operation menu)` + (this.squad ? ` · Co-op with <b>${this.squad.name}</b>` : '');
    $('fb-go').textContent = this.squad ? 'Deploy squad ▸' : 'Deploy ▸';
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
    const sq = this.squad;
    const coop: CoopLink | null = sq ? { role: sq.role, allyName: sq.name.replace(/&[a-z#0-9]+;/g, ''), send: (msg, rel = true) => sq.link.send(msg, rel), direct: () => sq.link.direct } : null;
    const diff = sq?.role === 'guest' ? this.playDifficulty : this.difficulty;
    this.lobby?.setStatus('playing', m.id);
    const canvas = $<HTMLCanvasElement>('fps-canvas');
    canvas.classList.remove('hidden');
    this.loadingText(`Dropping into ${m.title}…`);
    const game = new FpsGame(canvas, m, {
      radio: r => this.radio(r),
      objectives: html => { $('fps-obj').innerHTML = html; },
      hud: h => this.hud(h),
      message: (t, k) => this.message(t, k),
      end: (win, text) => this.end(win, text),
    }, 7 + FPS_MISSIONS.indexOf(m) * 11, diff, coop);
    this.game = game;
    (window as any).__fps = game;
    await game.preload(f => this.loadingBar(f));
    if (this.game !== game) return;
    this.loadingDone();
    $('fps-hud').classList.remove('hidden');
    game.start();
    if (coop?.role === 'guest') coop.send({ t: 'ready' });
    this.renderSquad();
    audio.playMusic('kyrrh');
    lockPointer(canvas);
  }

  stopGame() {
    const had = !!this.game;
    this.game?.dispose(); this.game = null;
    if (had) this.lobby?.setStatus(this.squad ? 'squad' : 'lobby');
    if (document.pointerLockElement) document.exitPointerLock();
    $('fps-hud').classList.add('hidden');
    $('fps-radio').classList.add('hidden');
  }

  private pause() { if (!this.game) return; if (!this.game.coop) this.game.paused = true; $('fps-pause').classList.remove('hidden'); }
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
    $('fps-prompt').textContent = h.prompt.startsWith('Press') || h.down > 0 ? h.prompt : '';
    const ally = $('fps-ally');
    ally.classList.toggle('hidden', !h.ally);
    if (h.ally) {
      ally.querySelector('span')!.textContent = `${h.ally.name} · ${h.ally.down ? 'DOWN' : h.ally.mode === 'foot' ? 'Trooper' : h.ally.mode === 'juggernaut' ? 'Juggernaut' : 'Titan'}`;
      const bar = ally.querySelector('i') as HTMLElement;
      bar.style.width = `${h.ally.down ? 0 : Math.max(0, h.ally.hp / Math.max(1, h.ally.maxHp)) * 100}%`;
      bar.className = h.ally.down || h.ally.hp / h.ally.maxHp < 0.3 ? 'low' : '';
    }
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
      c.fillStyle = b.ally ? '#5ef0ff' : b.pod ? '#ffb347' : b.big ? '#ff4fd8' : b.air ? '#ffd05a' : '#ff5a5a';
      c.beginPath(); c.arc(R + x * k, R + y * k, b.big || b.pod || b.ally ? 5 : 3, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#5ef0ff'; c.beginPath(); c.moveTo(R, R - 7); c.lineTo(R - 5, R + 5); c.lineTo(R + 5, R + 5); c.fill();
  }

  private end(win: boolean, text: string) {
    const g = this.game, m = this.current!;
    if (!g) return;
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
      const guest = this.squad?.role === 'guest';
      $('fe-next').classList.toggle('hidden', !win || !FPS_MISSIONS[i + 1] || guest);
      $('fe-again').classList.toggle('hidden', guest);
      if (guest) $('fe-text').textContent = `${text} Waiting for ${this.squad!.name} to choose the next deployment.`;
      $('fps-end').classList.remove('hidden');
    }, win ? 1200 : 1800);
  }
}

const DIFF_KEY = 'nd-fps-difficulty';
function loadDifficulty(): Difficulty {
  try { const d = localStorage.getItem(DIFF_KEY); if (d === 'easy' || d === 'medium' || d === 'hard') return d; } catch { /* ignore */ }
  return 'medium';
}

const esc = (t: string) => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
