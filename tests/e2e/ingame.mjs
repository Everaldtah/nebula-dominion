import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto(process.argv[2] || 'http://localhost:4173/', { waitUntil: 'networkidle0' });
await sleep(1500);
await p.click('#start-btn');
await p.waitForFunction(() => window.__nd.mode === 'game' && window.__nd.game.tick > 5, { timeout: 60000 });
await p.evaluate(() => {
  const a = window.__nd, g = a.game, D = window.__ndDEFS, E = g.entities[0].constructor;
  g.controllers.length = 0;
  const ids = (window.__atlasIds || []);
  const put = (o, id, x, y) => { const e = new E(o, 'unit', D[id], x, y); g.addEntity(e); return e; };
  let i = 0;
  for (const id of ['behemoth', 'scorcher', 'wyvern', 'behemoth', 'scorcher', 'wyvern']) { const e = put(i < 3 ? 0 : 1, id, 60 + (i % 3) * 3, 60 + Math.floor(i / 3) * 5); e.facing = i * 0.9; i++; }
  g.spawnBuilding(0, 'arsenal', 68, 58, true);
  for (const v of g.visible) v.fill(1); for (const v of g.explored) v.fill(1);
  a.cam.zoom = 1.4; a.centerOn(63, 63);
  const ws = g.entities.filter(e => e.alive && e.type === 'unit' && e.x > 58 && e.x < 70);
  ws.slice(0, 3).forEach(u => g.issue({ c: 'move', ids: [u.id], x: u.x + 6, y: u.y + 2 }, u.owner));
});
await sleep(900);
await p.screenshot({ path: 'tests/e2e/shots/19-ingame-sprites.png' });
console.log('errors:', errs.length ? errs : 'none');
await b.close();
