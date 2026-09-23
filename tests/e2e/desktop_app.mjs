// Smoke test for the installed Windows app: launches IronDescent.exe with a debug port, drives it with puppeteer.
import puppeteer from 'puppeteer-core';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
const exe = path.join(process.env.LOCALAPPDATA, 'Programs', 'IronDescent', 'IronDescent.exe');
const proc = spawn(exe, ['--remote-debugging-port=9333'], { detached: true, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let b; for (let i = 0; i < 40 && !b; i++) { await sleep(500); try { b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null }); } catch { /* starting */ } }
let fails = 0; const check = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails++; };
const pages = await b.pages(); const p = pages.find(x => x.url().includes('app=fps')) ?? pages[0];
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.waitForSelector('#fps-menu:not(.hidden)', { timeout: 20000 });
check(true, `app boots straight into the FPS campaign (${p.url()})`);
check(await p.$eval('#fps-back', e => e.textContent) === 'Quit to desktop', 'Back button quits to desktop');
check(await p.$eval('#menu', e => e.classList.contains('hidden')), 'RTS main menu hidden');
const gpu = await p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(d.UNMASKED_RENDERER_WEBGL); });
check(!/SwiftShader|Basic Render/i.test(gpu), `GPU renderer: ${gpu}`);
await p.screenshot({ path: 'tests/e2e/shots/app-menu.png' });
await p.evaluate(() => { localStorage.setItem('nd-fps-v1', '["f1"]'); });
await p.reload(); await p.waitForSelector('#fps-menu:not(.hidden)', { timeout: 20000 });
await p.evaluate(() => document.querySelectorAll('.fps-card')[1].click()); await sleep(300);
await p.click('#fb-go');
await p.waitForFunction(() => window.__fps && document.getElementById('loading').classList.contains('hidden') && !document.getElementById('fps-hud').classList.contains('hidden'), { timeout: 60000 });
await sleep(2500);
const st = await p.evaluate(() => ({ enemies: window.__fps.enemies.length, fps: 0 }));
st.fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(Math.round(n / 2)); }; requestAnimationFrame(f); }));
check(st.enemies > 0, `mission 2 loads in the app (${st.enemies} Kyrrh on the map, ${st.fps} fps)`);
await p.screenshot({ path: 'tests/e2e/shots/app-game.png' });
check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
await p.evaluate(() => localStorage.removeItem('nd-fps-v1'));
b.disconnect();
try { execSync('taskkill /IM IronDescent.exe /F', { stdio: 'ignore' }); } catch { }
console.log(fails ? `${fails} FAILED` : 'DESKTOP APP OK');
process.exit(fails ? 1 : 0);
