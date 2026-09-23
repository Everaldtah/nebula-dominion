// Capture every gallery entry's 3D viewport into tests/e2e/shots/gallery/<race>-<kind>-<n>.png
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:4747/';
fs.mkdirSync('tests/e2e/shots/gallery', { recursive: true });
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto(url, { waitUntil: 'networkidle0' });
await sleep(800); await p.click('#gallery-btn'); await sleep(600); await p.click('#g-rotate');
const view = await (await p.$('.g-view')).boundingBox();
let n = 0;
for (const race of ['directorate', 'kyrrh', 'aethel']) for (const kind of ['unit', 'building']) {
  await p.click(`[data-grace="${race}"]`); await p.click(`[data-gkind="${kind}"]`); await sleep(300);
  const count = await p.$$eval('.g-item', e => e.length);
  for (let i = 0; i < count; i++) {
    const items = await p.$$('.g-item');
    const name = (await items[i].evaluate(e => e.textContent)).trim();
    await items[i].click();
    await p.waitForFunction(() => !/Loading/.test(document.getElementById('g-status').textContent), { timeout: 30000 });
    await sleep(700);
    await p.screenshot({ path: `tests/e2e/shots/gallery/${String(n++).padStart(2, '0')}-${name.replace(/[^a-z]/gi, '')}.png`, clip: { x: view.x, y: view.y + 40, width: view.width, height: view.height - 60 } });
  }
}
console.log('captured', n, 'errors:', errs.length ? errs : 'none');
await b.close();
