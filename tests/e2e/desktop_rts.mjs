// Smoke test for the installed RTS Windows app: launches NebulaDominion.exe with a debug port, drives it with puppeteer.
// Every non-loopback request is blocked and recorded, so a pass means the game runs with no internet at all.
import puppeteer from 'puppeteer-core';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
const exe = path.join(process.env.LOCALAPPDATA, 'Programs', 'NebulaDominion', 'NebulaDominion.exe');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { execSync('taskkill /IM NebulaDominion.exe /F', { stdio: 'ignore' }); } catch { /* not running */ } };
let fails = 0; const check = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails++; };

async function launch() {
  spawn(exe, ['--remote-debugging-port=9334'], { detached: true, stdio: 'ignore' }).unref();
  let b; for (let i = 0; i < 40 && !b; i++) { await sleep(500); try { b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9334', defaultViewport: null }); } catch { /* starting */ } }
  let p; for (let i = 0; i < 40 && !p; i++) { p = (await b.pages()).find(x => x.url().includes('app=rts')); if (!p) await sleep(250); }
  return { b, p };
}

kill();
let { b, p } = await launch();
const errors = [], external = [];
p.on('pageerror', e => errors.push(e.message));
await p.setRequestInterception(true);
p.on('request', r => { const u = new URL(r.url()); if (/^(https?|wss?):$/.test(u.protocol) && u.hostname !== '127.0.0.1') { external.push(r.url()); r.abort(); } else r.continue(); });
await p.reload();
await p.waitForFunction(() => window.__nd && !document.getElementById('menu').classList.contains('hidden'), { timeout: 20000 });
check(true, `app boots into the RTS main menu (${p.url()})`);
check(await p.$eval('#fps-btn', e => e.classList.contains('hidden')), 'FPS button hidden');
check(await p.$eval('#quit-btn', e => e.textContent === 'Quit to desktop'), 'Quit to desktop button present');
await p.evaluate(() => document.fonts.ready);
check(await p.evaluate(() => document.fonts.check('900 20px Orbitron') && document.fonts.check('600 20px Rajdhani')
  && [...document.fonts].some(f => f.family.includes('Orbitron') && f.status === 'loaded')), 'Orbitron + Rajdhani load from the bundled fonts');
const gpu = await p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(d.UNMASKED_RENDERER_WEBGL); });
check(!/SwiftShader|Basic Render/i.test(gpu), `GPU renderer: ${gpu}`);
await p.screenshot({ path: 'tests/e2e/shots/rts-app-menu.png' });

await p.click('#start-btn');
await p.waitForFunction(() => window.__nd.mode === 'game' && window.__nd.game && window.__nd.game.tick > 10, { timeout: 60000 });
await sleep(3000);
const st = await p.evaluate(() => ({
  tick: window.__nd.game.tick, ents: window.__nd.game.entities.filter(e => e.alive).length,
  sprites: document.getElementById('asset-load')?.textContent ?? '',
}));
const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(Math.round(n / 2)); }; requestAnimationFrame(f); }));
check(st.tick > 10 && st.ents > 0, `skirmish runs (tick ${st.tick}, ${st.ents} entities, ${fps} fps)`);
await p.screenshot({ path: 'tests/e2e/shots/rts-app-game.png' });
check(external.length === 0, `no internet requests ${external.join(' | ')}`);
check(errors.length === 0, `no page errors ${errors.join(' | ')}`);

// campaign progress must survive a restart (stable loopback origin)
await p.evaluate(() => localStorage.setItem('nd-rts-app-probe', '1'));
// quit the way a player does (Quit to desktop), which flushes storage; taskkill /F would lose unflushed writes
await p.evaluate(() => { window.__nd.toMenu(); document.getElementById('quit-btn').click(); });
b.disconnect();
for (let i = 0; i < 40; i++) { await sleep(250); try { execSync('tasklist /FI "IMAGENAME eq NebulaDominion.exe" | find /I "NebulaDominion.exe"', { stdio: 'ignore' }); } catch { break; } }
kill();
({ b, p } = await launch());
await p.waitForFunction(() => window.__nd, { timeout: 20000 });
check(await p.evaluate(() => localStorage.getItem('nd-rts-app-probe') === '1'), 'saved data survives an app restart');
await p.evaluate(() => localStorage.removeItem('nd-rts-app-probe'));
b.disconnect(); kill();
console.log(fails ? `${fails} FAILED` : 'RTS DESKTOP APP OK');
process.exit(fails ? 1 : 0);
