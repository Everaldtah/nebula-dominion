// Performance benchmark: late-game battle, measures per-frame cost of each subsystem.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const URL_ = process.argv[2] || 'http://localhost:4173/';
const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
const gpu = process.env.GPU === '1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required', ...(gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--window-size=1920,1080'], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
await page.goto(URL_, { waitUntil: 'networkidle0' });
await page.click('#start-btn');
await new Promise(r => setTimeout(r, 800));
const r = await page.evaluate(async () => {
  const a = window.__nd, g = a.game;
  g.controllers.push(new window.__ndAI(g, 0, 'hard'));
  for (let i = 0; i < 20 * 60 * 9 && !g.over; i++) { g.step(); if (i % 200 === 0) { g.events.length = 0; await new Promise(r => setTimeout(r, 0)); } }
  // find the biggest cluster of units and look at it
  let best = null, bn = 0;
  for (const e of g.entities) if (e.alive && e.type === 'unit' && !e.def.worker) {
    const n = g.entities.filter(o => o.alive && o.type === 'unit' && Math.hypot(o.x - e.x, o.y - e.y) < 12).length;
    if (n > bn) { bn = n; best = e; }
  }
  if (best) a.centerOn(best.x, best.y);
  for (const v of g.visible) v.fill(1);
  const samples = [];
  const t0 = performance.now();
  let last = t0;
  while (performance.now() - t0 < 6000) {
    await new Promise(r => requestAnimationFrame(r));
    const now = performance.now(); samples.push(now - last); last = now;
  }
  samples.sort((x, y) => x - y);
  const P = a.perf;
  const gl = document.createElement('canvas').getContext('webgl'); const dbg = gl.getExtension('WEBGL_debug_renderer_info'); const gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?';
  return { ents: g.entities.length, units: g.entities.filter(e => e.alive && e.type === 'unit').length, cluster: bn, over: g.over,
    avgFrame: samples.reduce((s, x) => s + x, 0) / samples.length, p95: samples[Math.floor(samples.length * 0.95)],
    sim: P.sim, r2d: P.r2d, fx: P.fx, hud: P.hud, mm: P.mm, work: P.frame, dpr: a.dpr, gpuName };
});
console.log(JSON.stringify(r, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v));
await browser.close();
