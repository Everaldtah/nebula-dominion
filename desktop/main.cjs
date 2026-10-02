// Nebula Dominion - Windows desktop shell (shared by the RTS and the Iron Descent FPS apps).
// Serves the bundled game from ./game on a private loopback port and opens it fullscreen on the GPU.
// app.json (written by build.mjs) says which app this package is; no internet is needed at runtime.
const { app, BrowserWindow, Menu, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CFG = Object.assign(
  { title: 'Nebula Dominion: Iron Descent', query: '?app=fps', port: 47480, dataDir: 'IronDescent' },
  (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8')); } catch { return {}; } })());

// Own profile per app, so the RTS and the FPS can run side by side and keep separate saves.
app.setPath('userData', path.join(app.getPath('appData'), CFG.dataDir));

// Use the discrete GPU and let audio start without a click (the game unlocks it on first input anyway).
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const ROOT = path.join(__dirname, 'game');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// A fixed port keeps the page origin stable, so localStorage (campaign progress, settings) survives restarts.
// Falls back to a random port if something else already holds it.
function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
        fs.createReadStream(file).pipe(res);
      });
    });
    server.once('error', () => server.listen(0, '127.0.0.1'));
    server.once('listening', () => resolve(server.address().port));
    server.listen(CFG.port, '127.0.0.1');
  });
}

// Started from the Zenith.net launcher: --zenith-user / --zenith-party / --zenith-role reach the page as ?zuser= etc.
function zenithQuery() {
  const out = [];
  for (const a of process.argv) {
    const m = /^--zenith-(user|party|role)=(.{1,120})$/.exec(a);
    if (m) out.push(`z${m[1]}=${encodeURIComponent(m[2])}`);
  }
  return out.length ? '&' + out.join('&') : '';
}

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const port = await serve();
  win = new BrowserWindow({
    width: 1600, height: 900, fullscreen: true, backgroundColor: '#000000', show: false,
    title: CFG.title, icon: path.join(__dirname, 'icon.ico'), autoHideMenuBar: true,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  // F11 toggles fullscreen (Esc stays free for the in-game pause menu)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('page-title-updated', e => e.preventDefault());
  win.on('closed', () => { win = null; });
  win.loadURL(`http://127.0.0.1:${port}/${CFG.query}${zenithQuery()}`);
});

app.on('window-all-closed', () => app.quit());
