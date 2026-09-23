// Quick visual check of each FPS mission (spawn view + a turn), screenshots tests/e2e/shots/look-*.png
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 600000, args: ['--use-angle=d3d11', '--enable-gpu'], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const i of [0, 1, 2]) {
  await p.goto(process.argv[2] || 'http://localhost:5173/', { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.setItem('nd-fps-v1', '["f1","f2"]'));
  await p.click('#fps-btn'); await sleep(300);
  await p.evaluate(n => document.querySelectorAll('.fps-card')[n].click(), i); await sleep(300);
  await p.click('#fb-go');
  if (i === 0) { await p.waitForFunction(() => window.__cine && !document.getElementById('cine-skip').classList.contains('hidden'), { timeout: 60000 }); await p.click('#cine-skip'); }
  await p.waitForFunction(() => window.__fps && document.getElementById('loading').classList.contains('hidden') && !document.getElementById('fps-hud').classList.contains('hidden'), { timeout: 90000 });
  await sleep(2500);
  // look toward the nearest structure
  await p.evaluate(() => { const g = window.__fps; const s = g.enemies.filter(e => e.k.structure).sort((a, b) => a.pos.distanceTo(g.pos) - b.pos.distanceTo(g.pos))[0]; const e = g.eye(); g.yaw = Math.atan2(-(s.pos.x - e.x), -(s.pos.z - e.z)); g.pitch = -0.05; });
  await sleep(800); await p.screenshot({ path: `tests/e2e/shots/look-${i}a.png` });
  await p.evaluate(() => { const g = window.__fps; g.yaw += 2.2; g.pitch = 0.02; });
  await sleep(800); await p.screenshot({ path: `tests/e2e/shots/look-${i}b.png` });
  console.log('mission', i, 'fps', await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(Math.round(n / 2)); }; requestAnimationFrame(f); })));
}
await b.close();
