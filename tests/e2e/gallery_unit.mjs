// Screenshot one gallery entry: node gallery_unit.mjs <race> <name> <out.png> [url]
import puppeteer from 'puppeteer-core';
const [race, name, out, url] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto(url || 'http://localhost:4747/', { waitUntil: 'networkidle0' });
await sleep(800); await p.click('#gallery-btn'); await sleep(600);
await p.click(`[data-grace="${race}"]`); await sleep(300);
for (const it of await p.$$('.g-item')) if ((await it.evaluate(e => e.textContent)).trim() === name) { await it.click(); break; }
await p.waitForFunction(() => !/Loading/.test(document.getElementById('g-status').textContent), { timeout: 30000 });
await p.click('#g-rotate'); await sleep(1200);
const info = await p.evaluate(() => document.getElementById('g-status').textContent);
await p.screenshot({ path: out });
console.log(name, '|', info, '| errors:', errs.length ? errs : 'none');
await b.close();
