// Screenshots + checks for the Unit Gallery and the Campaign
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://localhost:4173/';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails++; };
await p.goto(url, { waitUntil: 'networkidle0' });
await sleep(1200);
// ---- gallery
await p.click('#gallery-btn');
await sleep(2500);
check(await p.$('#gallery:not(.hidden)') !== null, 'gallery opens');
const n1 = await p.$$eval('.g-item', els => els.length);
check(n1 >= 8, `gallery lists Directorate units (${n1})`);
await p.click('[data-grace="kyrrh"]'); await sleep(400);
const items = await p.$$('.g-item');
for (const it of items) { const t = await it.evaluate(e => e.textContent); if (t.includes('Behemoth')) { await it.click(); break; } }
await sleep(3000);
const st = await p.$eval('#g-status', e => e.textContent);
check(/AI-generated/.test(st), `behemoth loads the AI-generated GLB (${st})`);
// drag to rotate
const box = await (await p.$('#g-canvas')).boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 30, { steps: 10 }); await p.mouse.up();
await sleep(600);
await p.screenshot({ path: 'tests/e2e/shots/12-gallery.png' });
await p.click('[data-gkind="building"]'); await p.click('[data-grace="aethel"]'); await sleep(2500);
await p.screenshot({ path: 'tests/e2e/shots/13-gallery-buildings.png' });
const nAll = await p.evaluate(async () => { let n = 0; for (const r of ['directorate', 'kyrrh', 'aethel']) for (const k of ['unit', 'building']) { document.querySelector(`[data-grace="${r}"]`).click(); document.querySelector(`[data-gkind="${k}"]`).click(); n += document.querySelectorAll('.g-item').length; } return n; });
check(nAll >= 60, `gallery covers every unit and structure (${nAll})`);
// every entry loads, units are rigged with Idle/Walk/Attack
const report = await p.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = [];
  for (const race of ['directorate', 'kyrrh', 'aethel']) for (const kind of ['unit', 'building']) {
    document.querySelector(`[data-grace="${race}"]`).click(); document.querySelector(`[data-gkind="${kind}"]`).click(); await sleep(200);
    const n = document.querySelectorAll('.g-item').length;
    for (let i = 0; i < n; i++) {
      document.querySelectorAll('.g-item')[i].click();
      let st = '';
      for (let k = 0; k < 60; k++) { await sleep(150); st = document.getElementById('g-status').textContent; if (!/Loading/.test(st)) break; }
      const anims = [...document.querySelectorAll('#g-anims [data-anim]')].map(b => b.dataset.anim);
      out.push({ name: document.querySelectorAll('.g-item')[i].textContent, kind, ai: /AI-generated/.test(st), rigged: /rigged/.test(st), anims });
    }
  }
  return out;
});
const units = report.filter(r => r.kind === 'unit');
const notAI = report.filter(r => !r.ai).map(r => r.name);
const notRigged = units.filter(r => !r.rigged || !['Idle', 'Walk', 'Attack'].every(a => r.anims.includes(a))).map(r => r.name);
check(notAI.length === 0, `every gallery entry shows its AI-generated model (${report.length - notAI.length}/${report.length})${notAI.length ? ' missing: ' + notAI.join(', ') : ''}`);
check(notRigged.length === 0, `every unit is rigged with Idle/Walk/Attack (${units.length - notRigged.length}/${units.length})${notRigged.length ? ' missing: ' + notRigged.join(', ') : ''}`);
await p.click('.g-close'); await sleep(300);
// ---- campaign
await p.click('#campaign-btn'); await sleep(600);
const cards = await p.$$eval('.c-mission', els => els.map(e => e.className));
check(cards.length === 9 && !cards[0].includes('locked') && cards[1].includes('locked'), `campaign: 9 missions, first unlocked, rest locked (${cards.length})`);
await p.screenshot({ path: 'tests/e2e/shots/14-campaign.png' });
await (await p.$('.c-mission')).click(); await sleep(1500);
check(await p.$('#briefing:not(.hidden)') !== null, 'mission briefing shows');
await p.screenshot({ path: 'tests/e2e/shots/15-briefing.png' });
for (let i = 0; i < 4; i++) { await p.click('#brief-next'); await sleep(300); if (await p.$('#briefing.hidden')) break; }
await p.waitForFunction(() => window.__nd.mode === 'game' && window.__nd.game.tick > 5 && window.__nd.campaign, { timeout: 60000 });
await sleep(6000);
const obj = await p.$eval('#objectives', e => e.textContent);
check(/Train 6 Troopers/.test(obj), 'objectives panel shows mission goals');
check(await p.$('#comms:not(.hidden)') !== null, 'in-mission comms dialogue appears');
await p.screenshot({ path: 'tests/e2e/shots/16-mission.png' });
// win the mission quickly: give troopers + kill enemy buildings
const res = await p.evaluate(async () => {
  const a = window.__nd, g = a.game, D = window.__ndDEFS;
  const main = g.entities.find(e => e.alive && e.owner === 0 && e.def?.dropoff);
  for (let i = 0; i < 6; i++) g.spawnUnitNear(main, 'trooper');
  await new Promise(r => setTimeout(r, 1500));
  for (const e of g.entities) if (e.alive && e.owner === 1 && e.isBuilding) g.kill(e, 0);
  await new Promise(r => setTimeout(r, 4000));
  return { over: g.over, winner: g.winner, saved: localStorage.getItem('nd-campaign-v1') };
});
check(res.over && res.winner === 0 && /m1/.test(res.saved || ''), `mission completes and progress saves (${res.saved})`);
await sleep(2000);
const endTitle = await p.$eval('#end-title', e => e.textContent);
check(/MISSION COMPLETE/.test(endTitle) && await p.$('#next-btn:not(.hidden)') !== null, `end screen: ${endTitle} + next mission`);
await p.screenshot({ path: 'tests/e2e/shots/17-mission-complete.png' });
await p.click('#tomenu-btn'); await sleep(600);
const cards2 = await p.$$eval('.c-mission', els => els.map(e => e.className));
check(cards2[0].includes('done') && !cards2[1].includes('locked'), 'mission 2 unlocked after completing mission 1');
// survival mission logic: m2 timer + waves
await p.evaluate(() => localStorage.setItem('nd-campaign-v1', JSON.stringify(['m1'])));
const real = errors.filter(e => !/favicon|fonts\.g|404/.test(e));
check(real.length === 0, `no page errors ${real.slice(0, 3).join(' | ')}`);
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL NEW-MODE CHECKS PASSED');
process.exit(fails ? 1 : 0);
