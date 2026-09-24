// Build a Windows app: web build -> ./game (that app's assets only) -> Electron package -> install + shortcuts.
//   node build.mjs                 Iron Descent (FPS), installs to %LOCALAPPDATA%\Programs\IronDescent
//   node build.mjs --app rts       Nebula Dominion (RTS), installs to %LOCALAPPDATA%\Programs\NebulaDominion
//   add --no-install to only package, --installer to also make the NSIS setup .exe
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { packager } from '@electron/packager';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const WEB = path.resolve(HERE, '..');
const GAME = path.join(HERE, 'game');
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

const FPS_MODELS = ['skitterling', 'carapid', 'quillback', 'wyvern', 'behemoth', 'gravemaw', 'matron', 'thorn', 'nest', 'throne',
  'juggernaut', 'titan', 'wasp', 'dreadnought', 'trooper'];
const APPS = {
  // the FPS campaign: RTS sprite sheets and unused models stay out (~100 MB -> ~30 MB)
  fps: {
    name: 'IronDescent', title: 'Nebula Dominion: Iron Descent', shortcut: 'Nebula Dominion - Iron Descent',
    description: 'Nebula Dominion: Operation Iron Descent', appId: 'com.everaldtah.irondescent', query: '?app=fps', port: 47480,
    include: rel => !(rel === 'sprites' || rel.startsWith('sprites/')) && (!rel.startsWith('models/') || FPS_MODELS.includes(path.basename(rel, '.glb'))),
  },
  // the RTS (skirmish, AI vs AI, campaign, unit gallery): everything except the FPS-only environment art
  rts: {
    name: 'NebulaDominion', title: 'Nebula Dominion', shortcut: 'Nebula Dominion',
    description: 'Nebula Dominion: real-time strategy', appId: 'com.everaldtah.nebuladominion', query: '?app=rts', port: 47481,
    include: rel => !(rel === 'env' || rel.startsWith('env/')),
  },
};
const argApp = process.argv.indexOf('--app');
const APP = APPS[argApp > 0 ? process.argv[argApp + 1] : 'fps'];
if (!APP) throw new Error('--app must be one of: ' + Object.keys(APPS).join(', '));

// 1. web build
run('npx vite build', WEB);

// 2. copy only what this app needs, and tell main.cjs which app it is
fs.rmSync(GAME, { recursive: true, force: true });
fs.cpSync(path.join(WEB, 'dist'), GAME, {
  recursive: true,
  filter: src => APP.include(path.relative(path.join(WEB, 'dist'), src).split(path.sep).join('/')),
});
fs.writeFileSync(path.join(HERE, 'app.json'), JSON.stringify({ title: APP.title, query: APP.query, port: APP.port, dataDir: APP.name }, null, 2));

// 3. package
const [appDir] = await packager({
  dir: HERE, out: path.join(HERE, 'out'), overwrite: true, platform: 'win32', arch: 'x64',
  name: APP.name, executableName: APP.name, icon: path.join(HERE, 'icon.ico'), asar: true,
  ignore: [/^\/out($|\/)/, /^\/build\.mjs$/, /^\/make-icon\.py$/],
  appCopyright: 'EveraldTah', win32metadata: { CompanyName: 'EveraldTah', FileDescription: APP.title, ProductName: APP.title },
});
console.log('packaged:', appDir);

// 3b. Windows installer (NSIS): node build.mjs [--app rts] --installer
if (process.argv.includes('--installer')) {
  const { build: ebuild, Platform, Arch } = await import('electron-builder');
  const files = await ebuild({
    targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), prepackaged: appDir,
    config: {
      appId: APP.appId, productName: APP.shortcut, directories: { output: path.join(HERE, 'out', 'installer') },
      win: { icon: path.join(HERE, 'icon.ico'), signAndEditExecutable: false },
      nsis: {
        oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true,
        shortcutName: APP.shortcut, artifactName: `${APP.name}-Setup.exe`,
        installerIcon: path.join(HERE, 'icon.ico'), uninstallerIcon: path.join(HERE, 'icon.ico'), runAfterFinish: true,
      },
    },
  });
  console.log('installer:', files.filter(f => f.endsWith('.exe')).join(', '));
}

// 4. install + shortcuts
if (!process.argv.includes('--no-install')) {
  const dest = path.join(process.env.LOCALAPPDATA, 'Programs', APP.name);
  try { execSync(`taskkill /IM ${APP.name}.exe /F`, { stdio: 'ignore' }); } catch { /* not running */ }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(appDir, dest, { recursive: true });
  const exe = path.join(dest, `${APP.name}.exe`);
  // Desktop + Start menu shortcuts (a .ps1 file avoids nested-quote escaping through cmd)
  const ps1 = path.join(HERE, 'out', 'shortcuts.ps1');
  fs.writeFileSync(ps1, [
    '$s = New-Object -ComObject WScript.Shell',
    ...['Desktop', 'Programs'].map(folder => [
      `$l = $s.CreateShortcut((Join-Path ([Environment]::GetFolderPath('${folder}')) '${APP.shortcut}.lnk'))`,
      `$l.TargetPath = '${exe}'`, `$l.WorkingDirectory = '${dest}'`, `$l.IconLocation = '${exe},0'`,
      `$l.Description = '${APP.description}'`, '$l.Save()',
    ].join('\n')),
  ].join('\n'), 'utf8');
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, { stdio: 'inherit' });
  console.log('installed:', exe);
}
