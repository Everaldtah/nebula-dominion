// End-to-end test of the FPS campaign (Operation Iron Descent): menu, briefing, intro cinematic,
// then all three missions played by an auto-aim bot at 4x simulation speed. Screenshots in tests/e2e/shots/fps-*.png
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://localhost:5173/';
const only = process.argv[3];   // optional: f1|f2|f3
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 1200000, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails++; };
const shot = n => p.screenshot({ path: `tests/e2e/shots/fps-${n}.png` });

await p.goto(url, { waitUntil: 'networkidle0' });
await p.evaluate(() => localStorage.removeItem('nd-fps-v1'));
await sleep(800);
await p.click('#fps-btn'); await sleep(500);
check(await p.$('#fps-menu:not(.hidden)') !== null, 'FPS operation menu opens');
check(await p.$$eval('.fps-card', e => e.length) === 3, 'three missions listed');
check(await p.$$eval('.fps-card.locked', e => e.length) === 2, 'missions 2 and 3 locked at start');
// difficulty selector
check(await p.$$eval('.fps-diff button', e => e.length) === 3, 'Easy / Medium / Hard selector on the FPS menu');
await p.click('[data-diff="hard"]');
check(await p.$eval('[data-diff="hard"]', e => e.classList.contains('on')) && /harder/.test(await p.$eval('#fps-diff-desc', e => e.textContent)), 'Hard selectable with a description');
await shot('01-menu');
await p.click('[data-diff="medium"]');

async function jumpTo(i, progress) {
  await p.evaluate(pr => localStorage.setItem('nd-fps-v1', pr), progress);
  await p.reload({ waitUntil: 'networkidle0' }); await sleep(500);
  await p.click('#fps-btn'); await sleep(300);
  await p.evaluate(n => document.querySelectorAll('.fps-card')[n].click(), i); await sleep(300);
  await p.click('#fb-go');
}
async function waitGame() {
  try {
    await p.waitForFunction(() => window.__fps && document.getElementById('loading').classList.contains('hidden') && !document.getElementById('fps-hud').classList.contains('hidden'), { timeout: 120000 });
  } catch (e) {
    await shot('zz-timeout');
    console.log('state:', await p.evaluate(() => [...document.querySelectorAll('#fps-root > div, #loading')].map(d => d.id + (d.classList.contains('hidden') ? '-' : '+')).join(' ')));
    throw e;
  }
  await sleep(1500);
}

/** Auto-aim bot: aims at the nearest living enemy (priority: objective kinds), walks toward far targets, fires. */
async function bot(opts) {
  return p.evaluate(async o => {
    const g = window.__fps;
    g.testAuto = true; g.timeScale = o.speed;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let heals = 0, minHp = 1, t0 = performance.now(), deaths = 0;
    // aim every simulation substep (a 40ms polling bot can't track fast units at 4x speed)
    const aim = () => {
      const eye = g.eye();
      const alive = g.enemies.filter(e => e.alive);
      const pri = alive.filter(e => !e.k.structure || o.focus.includes(e.k.id));
      const near = pri.sort((a, b) => a.pos.distanceTo(g.pos) - b.pos.distanceTo(g.pos));
      const threat = near.find(e => !e.k.structure && e.pos.distanceTo(g.pos) < 22) ?? (g.mode === 'titan' || g.mode === 'foot' ? near.find(e => e.k.air && e.pos.distanceTo(g.pos) < 40) : undefined);
      // focus list is in priority order; skip kill objectives that are already met
      const need = id => !(o.enough && o.enough[id] && (g.kills.get(id) ?? 0) >= o.enough[id]);
      const obj = o.focus.filter(need).map(id => near.find(e => e.k.id === id)).find(Boolean);
      const tgt = threat ?? obj ?? near[0];
      g.keys.delete('KeyW');
      if (tgt) {
        const c = tgt.pos.clone(); c.y += tgt.k.structure ? tgt.k.radius * 0.6 : tgt.k.radius * 0.8;
        const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
        g.yaw = Math.atan2(-dx, -dz); g.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        g.mouseDown = true;
        const d = Math.hypot(dx, dz);
        const od = obj ? obj.pos.distanceTo(g.pos) : 0;
        if (obj && od > 34) g.keys.add('KeyW');   // keep pushing to the objective while shooting
        // Anchor Mode discipline: siege up for distant targets, unsiege when the swarm is inside minimum range
        if (g.mode === 'juggernaut' && g.anchorT <= 0) {
          const close = alive.some(e => !e.k.structure && e.pos.distanceTo(g.pos) < 9);
          if (g.anchored && close) g.toggleAnchor();
          else if (!g.anchored && !close && !threat && obj && od < 38) g.toggleAnchor();
        }
        if (g.mode === 'foot') g.weapon = tgt.k.armored && d < 40 ? 'grenade' : 'rifle';
        if (o.lance && g.lanceCharge <= 0 && g.lanceCd <= 0 && (tgt.k.massive || tgt.k.id === 'throne')) g.callLance();
      } else g.mouseDown = false;
    };
    if (!g.__botWrapped) { const up = g.update.bind(g); g.update = dt => { if (g.__bot) g.__bot(); up(dt); }; g.__botWrapped = true; }
    g.__bot = aim;
    while (!g.over && performance.now() - t0 < o.limit * 1000) {
      // board mech drop pods when they land
      if (g.mode === 'foot' && g.pickups.length && o.board) {
        const pk = g.pickups.find(x => x.mode === o.board) ?? g.pickups[0];
        g.pos.x = pk.pos.x + 2; g.pos.z = pk.pos.z; g.interact();
      }
      const frac = g.hp / ({ foot: 180, juggernaut: 700, titan: 1800 }[g.mode]);
      minHp = Math.min(minHp, frac);
      if (o.sustain && frac < 0.3) { g.hp += ({ foot: 180, juggernaut: 700, titan: 1800 }[g.mode]) * 0.5; heals++; }
      await sleep(40);
    }
    g.__bot = null; g.mouseDown = false; g.keys.clear();
    return { over: g.over, result: g.result, elapsed: g.elapsed, dmg: Object.fromEntries(Object.entries(g.dmgLog).map(([k, v]) => [k, Math.round(v)])), thornD: g.enemies.filter(e => e.alive && e.k.structure).map(e => Math.round(e.pos.distanceTo(g.pos))), kills: Object.fromEntries(g.kills), heals, minHp, mode: g.mode, enemies: g.enemies.filter(e => e.alive).length };
  }, opts);
}

// ---------------- Mission 1: Landfall (briefing -> intro cinematic -> game)
if (!only || only === 'f1' || only === 'cine') {
  await p.click('.fps-card'); await sleep(400);
  check(await p.$('#fps-brief:not(.hidden)') !== null, 'briefing shows');
  await shot('02-brief');
  await p.click('#fb-go');
  await p.waitForFunction(() => window.__cine && !document.getElementById('cine-skip').classList.contains('hidden'), { timeout: 60000 });
  for (const [t, n] of [[4, 'a-orbit'], [13, 'b-flyby'], [22, 'c-launch'], [26.5, 'd-launch2'], [34, 'e-reentry'], [39.5, 'f-clouds'], [45.5, 'g-landing']]) {
    await p.evaluate(tt => { window.__cine.t = tt; }, t); await sleep(700);
    await shot(`03-cine-${n}`);
  }
  const sub = await p.$eval('#cine-sub p', e => e.textContent);
  check(sub.length > 10, `cinematic subtitles play ("${sub.slice(0, 50)}")`);
  if (only === 'cine') { await b.close(); console.log(errors.length ? errors : 'CINE OK'); process.exit(0); }
  await p.click('#cine-skip');
  await waitGame();
  const init = await p.evaluate(() => ({ thorns: window.__fps.enemies.filter(e => e.k.id === 'thorn').length, hp: window.__fps.hp }));
  check(init.thorns === 3, `mission 1 has 3 Thorn Colonies (${init.thorns})`);
  check(init.hp === 180, `Trooper hero health is 45x4 = 180 (${init.hp})`);
  await shot('04-f1-start');
  // Overdrive (RTS: -10 hp, +50% speed/attack for 11s)
  const od = await p.evaluate(() => { const g = window.__fps; const h = g.hp; g['useOverdrive'](); return { cost: h - g.hp, t: g.overdrive }; });
  check(od.cost === 10 && od.t === 11, `Overdrive costs 10 health and lasts 11s (${od.cost}, ${od.t})`);
  // automatic rifle: rounds per second while the trigger is held (aimed at the sky, no Overdrive)
  const rps = await p.evaluate(async () => {
    const g = window.__fps; g.overdrive = 0; g.testAuto = true; g.weapon = 'rifle'; g.pitch = 1.2;
    const a0 = g.ammo, t0 = g.elapsed; g.mouseDown = true; await new Promise(r => setTimeout(r, 1500)); g.mouseDown = false;
    const secs = g.elapsed - t0;   // game time (headless frames are slow and each is capped at 50 ms)
    return { shots: Math.round((a0 - g.ammo) / secs), mag: a0, secs };
  });
  check(rps.shots >= 9 && rps.mag === 45, `automatic rifle fires ~12 rounds/s from a 45-round magazine (${rps.shots}/s over ${rps.secs.toFixed(2)}s game time)`);
  // HE grenade: kills a Skitterling pack outright, knocks back and staggers a Carapid
  const he = await p.evaluate(() => {
    const g = window.__fps; const THREEV = g.pos.constructor;
    const c = g.pos.clone(); c.x += 25; c.z += 25;
    const pack = [0, 1, 2].map(i => g.spawn('skitterling', new THREEV(c.x + i * 1.2, 0, c.z)));
    const cara = g.spawn('carapid', new THREEV(c.x + 2.5, 0, c.z + 1.5));
    const before = cara.pos.clone();
    g.splashAt(new THREEV(c.x + 1.2, g.heightAt(c.x, c.z), c.z), 4.5, 40, 20, false, true);
    return { packDead: pack.every(e => !e.alive), caraHp: cara.hp, stun: cara.stun, push: cara.vel.length() };
  });
  check(he.packDead, 'one HE grenade kills a pack of three Skitterlings');
  check(he.caraHp < 145 - 50 && he.stun > 0 && he.push > 3, `HE grenade hits an armored Carapid hard (hp ${he.caraHp.toFixed(0)}/145), knocks it back and staggers it`);
  await p.evaluate(() => { window.__fps.timeScale = 1; window.__fps.testAuto = true; });
  const r0 = await bot({ speed: 1, limit: 8, focus: ['thorn'], sustain: true });
  await shot('05-f1-combat');
  const r1 = await bot({ speed: 4, limit: 150, focus: ['thorn'], sustain: true });
  console.log('   f1:', JSON.stringify(r1));
  check(r1.result === 'win', 'mission 1 completes');
  await sleep(2000);
  await shot('06-f1-end');
  check((await p.$eval('#fe-title', e => e.textContent)) === 'MISSION COMPLETE', 'victory screen shows');
  void r0;
}

// ---------------- Mission 2: Into the Mire (Juggernaut, Anchor Mode)
if (!only || only === 'f2') {
  if (only) await jumpTo(1, '["f1"]');
  else { await p.click('#fe-next'); await sleep(400); await p.click('#fb-go'); }
  await waitGame();
  await shot('07-f2-start');
  const pods = await p.evaluate(async () => { const g = window.__fps; g.timeScale = 4; while (!g.pickups.length && g.elapsed < 40) { g.hp = Math.max(g.hp, 150); await new Promise(r => setTimeout(r, 100)); } g.timeScale = 1; return g.pickups.map(x => x.mode); });
  check(pods.includes('juggernaut'), `Juggernaut drop pod lands (${pods})`);
  await p.evaluate(() => { const g = window.__fps; const pk = g.pickups[0]; g.yaw = Math.atan2(-(pk.pos.x - g.pos.x), -(pk.pos.z - g.pos.z)); g.pitch = -0.1; });
  await sleep(600); await shot('08-f2-pod');
  const jug = await p.evaluate(async () => { const g = window.__fps; const pk = g.pickups[0]; g.pos.x = pk.pos.x + 2; g.pos.z = pk.pos.z; g.interact(); const hp = g.hp; g.toggleAnchor(); await new Promise(r => setTimeout(r, 3200)); return { mode: g.mode, hp, anchored: g.anchored }; });
  check(jug.mode === 'juggernaut' && jug.hp === 700, `boarded Juggernaut with 175x4 = 700 health (${jug.mode} ${jug.hp})`);
  check(jug.anchored, 'Anchor Mode engages after the 2.7s transition');
  await shot('09-f2-anchor');
  const r2 = await bot({ speed: 4, limit: 220, focus: ['matron', 'nest'], enough: { matron: 2 }, sustain: true, board: 'juggernaut' });
  console.log('   f2:', JSON.stringify(r2));
  await sleep(2000);
  await shot('10-f2-end');
  check(r2.result === 'win', 'mission 2 completes');
}

// ---------------- Mission 3: Titanfall (Titan + Solar Lance)
if (!only || only === 'f3') {
  if (only) await jumpTo(2, '["f1","f2"]');
  else { await p.click('#fe-next'); await sleep(400); await p.click('#fb-go'); }
  await waitGame();
  const t = await p.evaluate(async () => { const g = window.__fps; g.timeScale = 4; while (g.pickups.length < 2 && g.elapsed < 20) { g.hp = Math.max(g.hp, 150); await new Promise(r => setTimeout(r, 100)); } g.timeScale = 1; const pk = g.pickups.find(x => x.mode === 'titan'); g.pos.x = pk.pos.x + 2; g.pos.z = pk.pos.z; g.interact(); return { mode: g.mode, hp: g.hp }; });
  check(t.mode === 'titan' && t.hp === 1800, `boarded Titan with 450x4 = 1800 health (${t.mode} ${t.hp})`);
  const lance = await p.evaluate(async () => { const g = window.__fps; const th = g.enemies.find(e => e.k.id === 'throne'); const before = th.hp; const eye = g.eye(); g.yaw = Math.atan2(-(th.pos.x - eye.x), -(th.pos.z - eye.z)); g.pitch = Math.atan2(th.pos.y + 3 - eye.y, Math.hypot(th.pos.x - eye.x, th.pos.z - eye.z)); g.callLance(); await new Promise(r => setTimeout(r, 2600)); return { dmg: before - th.hp, cd: g.lanceCd }; });
  check(lance.dmg >= 230 && lance.cd > 60, `Solar Lance hits the Throne for 240-armor (${lance.dmg.toFixed(0)}), cooldown ~71s (${lance.cd.toFixed(0)})`);
  await shot('11-f3-titan');
  const r3 = await bot({ speed: 4, limit: 260, focus: ['behemoth', 'throne'], enough: { behemoth: 2 }, sustain: true, board: 'titan', lance: true });
  console.log('   f3:', JSON.stringify(r3));
  await sleep(2500);
  await shot('12-f3-end');
  check(r3.result === 'win', 'mission 3 completes (Brood Throne destroyed)');
  check(await p.$eval('#fps-end', e => !e.classList.contains('hidden')) && (await p.$eval('#fe-title', e => e.textContent)) === 'MISSION COMPLETE', 'final victory screen shows');
}
// difficulty scaling: Easy gives more health (x1.3), Hard less (x0.85)
if (!only || only === 'diff') {
  for (const [d, hp] of [['easy', 234], ['hard', 153]]) {
    await p.evaluate(dd => { localStorage.setItem('nd-fps-difficulty', dd); localStorage.setItem('nd-fps-v1', '["f1"]'); }, d);
    await p.reload({ waitUntil: 'networkidle0' }); await sleep(400);
    await p.click('#fps-btn'); await sleep(300);
    await p.evaluate(() => document.querySelectorAll('.fps-card')[1].click()); await sleep(300);
    check((await p.$eval('#fb-diff', e => e.textContent)).toLowerCase().includes(d), `briefing shows ${d} difficulty`);
    await p.click('#fb-go'); await waitGame();
    const g = await p.evaluate(() => ({ hp: window.__fps.hp, d: window.__fps.difficulty }));
    check(g.d === d && g.hp === hp, `${d}: Trooper starts with ${hp} health (${g.hp})`);
  }
  await p.evaluate(() => localStorage.removeItem('nd-fps-difficulty'));
}
check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
await b.close();
console.log(fails ? `${fails} FAILED` : 'FPS ALL PASSED');
process.exit(fails ? 1 : 0);
