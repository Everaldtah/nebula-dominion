// Cross-platform co-op: the installed Windows app and a browser player meet in the lobby and squad up.
//   node tests/e2e/coop_cross.mjs [web url]
import puppeteer from 'puppeteer-core';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
const url = process.argv[2] || 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails++; };
const exe = path.join(process.env.LOCALAPPDATA, 'Programs', 'IronDescent', 'IronDescent.exe');
spawn(exe, ['--remote-debugging-port=9334'], { detached: true, stdio: 'ignore' }).unref();
let app; for (let i = 0; i < 40 && !app; i++) { await sleep(500); try { app = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9334', defaultViewport: null }); } catch { /* starting */ } }
const D = (await app.pages()).find(p => p.url().includes('app=fps'));
await D.waitForFunction(() => window.__lobby && window.__lobby.brokers > 0, { timeout: 30000 });
const web = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu'], defaultViewport: { width: 1280, height: 720 } });
const W = await web.newPage();
await W.goto(url, { waitUntil: 'networkidle0' });
await W.evaluate(() => localStorage.setItem('nd-fps-name', 'Browser-Bea')); await W.reload({ waitUntil: 'networkidle0' });
await W.click('#fps-btn');
await W.waitForFunction(() => window.__lobby && window.__lobby.brokers > 0, { timeout: 30000 });
const idD = await D.evaluate(() => window.__lobby.id), idW = await W.evaluate(() => window.__lobby.id);
await W.waitForFunction(id => window.__lobby.players.has(id), { timeout: 30000 }, idD).catch(() => {});
await D.waitForFunction(id => window.__lobby.players.has(id), { timeout: 30000 }, idW).catch(() => {});
check(await W.evaluate(id => window.__lobby.players.get(id)?.platform, idD) === 'desktop', 'browser player sees the Windows-app player (🖥 desktop)');
check(await D.evaluate(id => window.__lobby.players.get(id)?.platform, idW) === 'web', 'Windows-app player sees the browser player (🌐 web)');
await W.evaluate(id => document.querySelector(`[data-invite="${id}"]`).click(), idD);
await D.waitForSelector('#on-invite:not(.hidden)', { timeout: 20000 });
await D.screenshot({ path: 'tests/e2e/shots/coop-cross-app-invite.png' });
await D.click('#on-accept');
await W.waitForFunction(() => window.__fpsMode.squad?.link.state === 'p2p', { timeout: 25000 }).catch(() => {});
check(await W.evaluate(() => window.__fpsMode.squad?.link.state) === 'p2p' && await D.evaluate(() => window.__fpsMode.squad?.link.state) === 'p2p', 'browser + Windows app squad over a direct P2P link');
await W.evaluate(() => document.querySelector('.fps-card').click()); await sleep(300); await W.click('#fb-go');
const inGame = p => p.waitForFunction(() => window.__fps && document.getElementById('loading').classList.contains('hidden') && !document.getElementById('fps-hud').classList.contains('hidden'), { timeout: 90000 });
await Promise.all([inGame(W), inGame(D)]);
await sleep(3000);
check(await D.evaluate(() => window.__fps.role === 'guest' && window.__fps.enemies.length >= 3 && window.__fps.ally.lastMsg > 0), 'Windows app renders the shared mission (its own GPU) with the browser player hosting');
await D.screenshot({ path: 'tests/e2e/shots/coop-cross-app-game.png' });
await D.evaluate(() => window.__fpsMode.leaveSquad(true));
await sleep(500);
await web.close(); app.disconnect();
try { execSync('taskkill /IM IronDescent.exe /F', { stdio: 'ignore' }); } catch { /* closed */ }
console.log(fails ? `${fails} FAILED` : 'CROSS-PLATFORM CO-OP OK');
process.exit(fails ? 1 : 0);
