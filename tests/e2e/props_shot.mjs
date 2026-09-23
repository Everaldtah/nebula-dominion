import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu'], defaultViewport: { width: 1600, height: 900 } });
const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:5173/tests/e2e/props.html'); await p.waitForFunction(() => window.done, { timeout: 60000 });
await p.screenshot({ path: 'tests/e2e/shots/props.png' }); await b.close(); console.log('ok');
