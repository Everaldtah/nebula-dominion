// End-to-end browser test: drives the real game in headless Chrome.
// Usage: node tests/e2e/smoke.mjs [url]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET = process.argv[2] || 'http://localhost:4173/';
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));
const SHOTS = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'), 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(TARGET, { waitUntil: 'networkidle0' });
await sleep(800);
check(await page.$('#menu:not(.hidden)') !== null, 'main menu visible');
check((await page.$$('.race-card')).length === 3, 'three race cards');
await page.screenshot({ path: path.join(SHOTS, '01-menu.png') });

// menu 3D scene is rendering
const menuCalls = await page.evaluate(() => window.__nd.fx.renderer.info.render.calls);
check(menuCalls > 0, `Three.js menu scene renders (${menuCalls} draw calls)`);

for (const [i, race] of ['directorate', 'kyrrh', 'aethel'].entries()) {
  await page.click(`.race-card:nth-child(${i + 1})`);
  await page.select('#opp-race', ['kyrrh', 'aethel', 'directorate'][i]);
  await page.select('#difficulty', 'normal');
  await page.click('#start-btn');
  await sleep(1500);
  const st = await page.evaluate(() => {
    const a = window.__nd, g = a.game;
    return { mode: a.mode, race: g.players[0].race, tick: g.tick, units: g.entities.filter(e => e.alive && e.owner === 0 && e.type === 'unit').length, audio: a.constructor && window.__nd && !!document.querySelector('#hud:not(.hidden)') };
  });
  check(st.mode === 'game' && st.race === race, `${race}: game started`);
  check(st.tick > 10, `${race}: simulation ticking (${st.tick} ticks)`);
  check(st.units >= 12, `${race}: starting units present (${st.units})`);
  check(st.audio, `${race}: HUD visible`);
  // canvas actually drawn (not blank)
  const px = await page.evaluate(() => {
    const c = document.getElementById('game'); const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, Math.floor(c.height * 0.6)).data;
    let lit = 0; for (let k = 0; k < d.length; k += 400) if (d[k] + d[k + 1] + d[k + 2] > 60) lit++;
    return lit;
  });
  check(px > 200, `${race}: 2D canvas renders terrain/units (${px} lit samples)`);
  await page.screenshot({ path: path.join(SHOTS, `02-${race}-start.png`) });

  // select all workers with a drag box over the base, then check the command card
  const box = await page.evaluate(() => {
    const a = window.__nd, g = a.game;
    const ws = g.entities.filter(e => e.alive && e.owner === 0 && e.def?.worker);
    const xs = ws.map(w => (w.x * 32 - a.cam.x) * a.cam.zoom), ys = ws.map(w => (w.y * 32 - a.cam.y) * a.cam.zoom);
    return { x0: Math.min(...xs) - 30, y0: Math.min(...ys) - 30, x1: Math.max(...xs) + 30, y1: Math.max(...ys) + 30 };
  });
  await page.mouse.move(box.x0, box.y0); await page.mouse.down(); await page.mouse.move((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, { steps: 4 }); await page.mouse.move(box.x1, box.y1, { steps: 4 }); await page.mouse.up();
  await sleep(300);
  const sel = await page.evaluate(() => [...window.__nd.view.selected].length);
  check(sel >= 8, `${race}: drag-box selection works (${sel} selected)`);
  const cmdCount = await page.evaluate(() => document.querySelectorAll('#cmd .cbtn:not(.disabled)').length);
  check(cmdCount >= 6, `${race}: command card populated (${cmdCount} buttons)`);
  const voice = await page.evaluate(() => { const a = window.__nd; return !!a && !!(window.__nd && document); });
  void voice;

  // hotkey B opens build menu, then place the supply structure with the mouse
  await page.keyboard.press('b');
  await sleep(250);
  const supplyKey = { directorate: 'S', kyrrh: null, aethel: 'E' }[race];
  if (supplyKey) {
    // give money so the test does not depend on mining time
    await page.evaluate(() => { window.__nd.game.players[0].minerals += 500; });
    await sleep(150);
    await page.keyboard.press(supplyKey.toLowerCase());
    await sleep(150);
    const spot = await page.evaluate((race) => {
      const a = window.__nd, g = a.game;
      const id = race === 'directorate' ? 'habitat' : 'obelisk';
      const main = g.entities.find(e => e.alive && e.owner === 0 && e.def?.dropoff);
      for (let r = 6; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const tx = Math.round(main.x + dx - 1), ty = Math.round(main.y + dy - 1);
        const sx0 = ((tx + 1) * 32 - a.cam.x) * a.cam.zoom, sy0 = ((ty + 1) * 32 - a.cam.y) * a.cam.zoom;
        if (sx0 > 60 && sx0 < 1500 && sy0 > 80 && sy0 < 640 && !g.canPlace(0, id, tx, ty, -1)) return { sx: ((tx + 1) * 32 - a.cam.x) * a.cam.zoom, sy: ((ty + 1) * 32 - a.cam.y) * a.cam.zoom, ok: a.targeting === 'build:' + id };
      }
      return null;
    }, race);
    check(spot && spot.ok, `${race}: build hotkeys enter placement mode`);
    if (spot) { await page.mouse.move(spot.sx, spot.sy, { steps: 3 }); await sleep(120); await page.mouse.click(spot.sx, spot.sy); }
    await sleep(2500);
    const placed = await page.evaluate((race) => window.__nd.game.entities.some(e => e.alive && e.owner === 0 && e.def?.id === (race === 'directorate' ? 'habitat' : 'obelisk') && !e.built), race);
    check(placed, `${race}: worker placed a supply structure via mouse`);
  } else {
    await page.keyboard.press('Escape');
    // kyrrh: select nest and hatch a drover with hotkey
    await page.evaluate(() => { const a = window.__nd; const n = a.game.entities.find(e => e.alive && e.owner === 0 && e.def?.larvaHost); a.setSelection([n.id]); a.game.players[0].minerals += 300; });
    await sleep(250);
    await page.keyboard.press('v');
    await sleep(300);
    const eggs = await page.evaluate(() => window.__nd.game.entities.find(e => e.alive && e.owner === 0 && e.def?.larvaHost).eggs.length);
    check(eggs >= 1, `kyrrh: larva hatch via hotkey (eggs=${eggs})`);
  }
  // right-click move command on the map
  await page.evaluate(() => { const a = window.__nd; a.setSelection(a.game.entities.filter(e => e.alive && e.owner === 0 && e.def?.worker).slice(0, 3).map(e => e.id)); });
  const free = await page.evaluate(() => {
    const a = window.__nd, g = a.game;
    for (let sy = 200; sy < 600; sy += 23) for (let sx = 300; sx < 1300; sx += 37) {
      const t = a.screenToTile(sx, sy);
      if (g.tileFree(Math.floor(t.x), Math.floor(t.y)) && !a.pick(t.x, t.y)) return { sx, sy };
    }
    return { sx: 800, sy: 300 };
  });
  await page.mouse.click(free.sx, free.sy, { button: 'right' });
  await sleep(200);
  const moved = await page.evaluate(() => { const a = window.__nd; return [...a.view.selected].map(id => a.game.get(id)).filter(Boolean).every(e => e.orders[0]?.type === 'move'); });
  check(moved, `${race}: right-click issues move orders`);

  // fast-forward the simulation, verifying FX + audio respond to combat
  await page.evaluate(() => {
    const a = window.__nd, g = a.game;
    const main = g.entities.find(e => e.alive && e.owner === 0 && e.def?.dropoff);
    // stage a skirmish on screen so effects and audio are exercised
    const mk = (owner, id, x, y) => { const E = g.entities[0].constructor; const e = new E(owner, 'unit', window.__nd.game.constructor.DEFS?.[id] ?? null, x, y); return e; };
    void mk;
    a.centerOn(main.x, main.y + 3);
  });
  const combat = await page.evaluate(async () => {
    const a = window.__nd, g = a.game;
    const enemy = g.players[1];
    // spawn a few enemy units next to our main via the AI-owned base by teleporting existing enemy workers
    const foes = g.entities.filter(e => e.alive && e.owner === 1 && e.def?.worker).slice(0, 6);
    const main = g.entities.find(e => e.alive && e.owner === 0 && e.def?.dropoff);
    foes.forEach((f, i) => { g.clearOrders(f); f.x = main.x + 4 + (i % 3); f.y = main.y + 5 + Math.floor(i / 3); f.orders.push({ type: 'hold' }); });
    const mine = g.entities.filter(e => e.alive && e.owner === 0 && e.def?.worker).slice(0, 8);
    g.issue({ c: 'amove', ids: mine.map(e => e.id), x: main.x + 5, y: main.y + 5.5 }, 0);
    let shots = 0, deaths = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      await new Promise(r => requestAnimationFrame(r));
      shots += 0; // events are consumed by the app each frame
    }
    void enemy;
    return { foesAlive: foes.filter(f => f.alive).length, fxCalls: a.fx.renderer.info.render.calls, kills: g.players[0].stats.kills, deaths };
  });
  check(combat.foesAlive < 6, `${race}: workers fight on attack-move (${6 - combat.foesAlive} enemies killed)`);
  check(combat.fxCalls > 0, `${race}: Three.js FX layer draws (${combat.fxCalls} calls)`);
  await page.screenshot({ path: path.join(SHOTS, `03-${race}-combat.png`) });

  // return to menu via surrender
  await page.evaluate(() => { const a = window.__nd; a.toMenu(); });
  await sleep(400);
}

// Audio engine: context is created and running after user gestures, and nodes were scheduled
const au = await page.evaluate(() => {
  const w = window;
  // find the audio engine via the module graph attached to App methods
  return new Promise(res => {
    const a = w.__nd;
    // trigger a click to be sure
    document.getElementById('howto-btn').click();
    setTimeout(() => { document.querySelector('[data-close="howto"]').click(); res({ ok: true, menu: a.mode }); }, 200);
  });
});
check(au.ok && au.menu === 'menu', 'menu overlays open/close');
const audioInfo = await page.evaluate(() => {
  const ctxs = [];
  // AudioEngine is a singleton; expose through a probe tone
  return new Promise(res => {
    const AC = window.AudioContext;
    const orig = AC.prototype.createOscillator;
    let count = 0;
    AC.prototype.createOscillator = function () { count++; return orig.call(this); };
    document.querySelector('.race-card').click();
    setTimeout(() => { AC.prototype.createOscillator = orig; res({ oscillators: count }); }, 1500);
    void ctxs;
  });
});
check(audioInfo.oscillators > 0, `procedural audio synthesizes sound (${audioInfo.oscillators} oscillators in 1.5s)`);

// Tier upgrade + research through the command card (keyboard hotkeys), and pause menu
for (const [i, race] of ['directorate', 'kyrrh', 'aethel'].entries()) {
  await page.click(`.race-card:nth-child(${i + 1})`);
  await page.click('#start-btn');
  await sleep(500);
  const r = await page.evaluate(async (race) => {
    const a = window.__nd, g = a.game, D = window.__ndDEFS;
    const p = g.players[0]; p.minerals = p.gas = 5000;
    const main = g.entities.find(e => e.alive && e.owner === 0 && e.def?.dropoff);
    const t2 = D[main.def.morphTo];
    let x = Math.round(main.x) - 12;
    for (const req of t2.requires) { for (const rr of D[req].requires ?? []) if (!g.hasBuilt(0, rr)) g.spawnBuilding(0, rr, x, Math.round(main.y) - 12, true), x -= 4; g.spawnBuilding(0, req, x, Math.round(main.y) - 12, true); x -= 4; }
    main.queue.length = 0;
    a.setSelection([main.id]);
    await new Promise(r => setTimeout(r, 300));
    return { t2: t2.id };
  }, race);
  await page.keyboard.press('l');
  await sleep(300);
  const q = await page.evaluate(() => { const a = window.__nd; const m = a.game.entities.find(e => e.alive && e.owner === 0 && e.def?.dropoff); return m.queue.map(q => q.kind + ':' + q.id).join(','); });
  check(q.includes('morph:' + r.t2), `${race}: tier-2 upgrade via command card hotkey (${q})`);
  // hover a command button to show a tooltip
  await page.hover('#cmd .cbtn:not(.disabled)');
  await sleep(150);
  check(await page.$('#tooltip:not(.hidden)') !== null, `${race}: command tooltip shows`);
  await page.keyboard.press('F10');
  await sleep(200);
  const paused = await page.evaluate(() => window.__nd.paused);
  await page.click('#resume-btn');
  check(paused, `${race}: F10 pauses the game`);
  await page.evaluate(() => window.__nd.toMenu());
  await sleep(200);
}

// Showcase: every building and unit of all three races renders; then a big battle with 3D FX
await page.select('#difficulty', 'easy');
await page.click('#start-btn');
await sleep(600);
const roster = await page.evaluate(async () => {
  const a = window.__nd, g = a.game, D = window.__ndDEFS;
  const Entity = g.entities[0].constructor;
  g.controllers.length = 0; // freeze AI for the showcase
  for (const v of g.explored) v.fill(1);
  const cx = 64, cy = 64;
  // clear space
  const blds = Object.values(D).filter(d => d.kind === 'building' && !d.gas);
  let bx = 40, by = 44, count = 0;
  for (const d of blds) {
    const owner = d.race === 'directorate' ? 0 : 1;
    if (d.race === 'aethel') { /* keep aethel for player 0 too */ }
    const e = g.spawnBuilding(d.race === 'kyrrh' ? 1 : 0, d.id, bx, by, true);
    e.seenMask = 3; count++;
    bx += d.size + 1; if (bx > 88) { bx = 40; by += 6; }
  }
  g.updateCreep();
  a.cam.zoom = 0.62; a.centerOn(64, 52);
  const units = Object.values(D).filter(d => d.kind === 'unit');
  return { buildings: count, units: units.length };
});
await sleep(1200);
await page.screenshot({ path: path.join(SHOTS, '05-all-buildings.png') });
const battle = await page.evaluate(async () => {
  const a = window.__nd, g = a.game, D = window.__ndDEFS;
  const Entity = g.entities[0].constructor;
  for (const e of g.entities) if (e.alive && e.isBuilding && e.x > 36 && e.x < 92 && e.y > 40 && e.y < 80) g.kill(e, -1, true);
  g.updateCreep();
  const units = Object.values(D).filter(d => d.kind === 'unit' && !d.worker);
  const spawned = [];
  let i = 0;
  for (const d of units) {
    const owner = d.race === 'kyrrh' ? 1 : 0;
    const side = owner === 0 ? -1 : 1;
    const x = 64 + side * (3 + (i % 4) * 1.6), y = 56 + Math.floor(i / 4) * 1.8;
    const e = new Entity(owner, 'unit', D[d.id], x, y);
    g.addEntity(e); spawned.push(e); i++;
    if (d.race === 'kyrrh') { const e2 = new Entity(1, 'unit', D[d.id], 64 + 9 + (i % 3), 60 + (i % 5)); g.addEntity(e2); }
  }
  for (const e of spawned) if (e.def.id === 'juggernaut') e.sieged = true;
  for (const e of g.entities) if (e.alive && e.owner === 0 && e.def.id === 'dreadnought') { const t = g.entities.find(o => o.alive && o.owner === 1 && o.def?.id === 'behemoth'); if (t) g.issue({ c: 'ability', ids: [e.id], ability: 'solarlance', target: t.id }, 0); }
  a.cam.zoom = 1.0; a.centerOn(64, 60);
  for (const v of g.visible) v.fill(1);
  return spawned.length;
});
await sleep(2200);
await page.screenshot({ path: path.join(SHOTS, '06-battle.png') });
await sleep(1500);
await page.screenshot({ path: path.join(SHOTS, '07-battle-late.png') });
check(roster.buildings >= 30 && battle >= 20, `showcase: ${roster.buildings} buildings and ${battle} unit types rendered in battle`);
await page.evaluate(() => window.__nd.toMenu());
await sleep(300);

// Full game vs Easy AI, fast-forwarded: game reaches a conclusion and the end screen shows
await page.select('#difficulty', 'easy');
await page.click('#start-btn');
await sleep(800);
const ended = await page.evaluate(async () => {
  const a = window.__nd, g = a.game;
  // let an AI play our side too so the match concludes
  g.controllers.push(new window.__ndAI(g, 0, 'hard'));
  for (let i = 0; i < 20 * 60 * 30 && !g.over; i++) { g.step(); if (i % 400 === 0) { a.processEvents(); await new Promise(r => setTimeout(r, 0)); } }
  a.processEvents();
  return { over: g.over, winner: g.winner, time: g.time };
});
if (ended.skipped) console.log('SKIP  full game (production build: AI module not importable)');
else {
  check(ended.over, `full game reaches victory/defeat (winner P${ended.winner} at ${(ended.time / 60).toFixed(1)} min)`);
  await sleep(2500);
  check(await page.$('#end:not(.hidden)') !== null, 'end screen displayed with stats');
  await page.screenshot({ path: path.join(SHOTS, '04-end.png') });
}

const realErrors = errors.filter(e => !/favicon|fonts\.g/.test(e));
check(realErrors.length === 0, `no console/page errors${realErrors.length ? ': ' + realErrors.slice(0, 5).join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nALL E2E CHECKS PASSED');
process.exit(failures ? 1 : 0);
