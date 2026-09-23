import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto(process.argv[2] || 'http://localhost:4173/', { waitUntil: 'networkidle0' });
await sleep(800); await p.click('#gallery-btn'); await sleep(800);
await p.click('[data-grace="kyrrh"]'); await sleep(300);
for (const it of await p.$$('.g-item')) if ((await it.evaluate(e => e.textContent)).includes('Behemoth')) { await it.click(); break; }
await sleep(3500);
const btns = await p.$$eval('#g-anims [data-anim]', e => e.map(x => x.textContent));
console.log('anim buttons:', btns.join(' | '), '| status:', await p.$eval('#g-status', e => e.textContent));
await p.click('#g-rotate');
await p.click('[data-anim="Walk"]'); await sleep(250); await p.screenshot({ path: 'tests/e2e/shots/18-walk-a.png' });
await sleep(260); await p.screenshot({ path: 'tests/e2e/shots/18-walk-b.png' });
await p.click('[data-anim="Attack"]'); await sleep(300); await p.screenshot({ path: 'tests/e2e/shots/18-attack.png' });
console.log('errors:', errs.length ? errs : 'none');
await b.close();
