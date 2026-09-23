// Build the Windows app: web build -> ./game (FPS assets only) -> Electron package -> install + shortcuts.
//   node build.mjs            build + install to %LOCALAPPDATA%\Programs\IronDescent
//   node build.mjs --no-install
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { packager } from '@electron/packager';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const WEB = path.resolve(HERE, '..');
const GAME = path.join(HERE, 'game');
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

// 1. web build
run('npx vite build', WEB);

// 2. copy only what the FPS campaign needs (the RTS sprite sheets and unused models stay out: ~100 MB -> ~30 MB)
const FPS_MODELS = ['skitterling', 'carapid', 'quillback', 'wyvern', 'behemoth', 'gravemaw', 'matron', 'thorn', 'nest', 'throne',
  'juggernaut', 'titan', 'wasp', 'dreadnought'];
fs.rmSync(GAME, { recursive: true, force: true });
fs.cpSync(path.join(WEB, 'dist'), GAME, {
  recursive: true,
  filter: src => {
    const rel = path.relative(path.join(WEB, 'dist'), src).split(path.sep).join('/');
    if (rel === 'sprites' || rel.startsWith('sprites/')) return false;
    if (rel.startsWith('models/')) return FPS_MODELS.includes(path.basename(rel, '.glb'));
    return true;
  },
});

// 3. package
const [appDir] = await packager({
  dir: HERE, out: path.join(HERE, 'out'), overwrite: true, platform: 'win32', arch: 'x64',
  name: 'IronDescent', executableName: 'IronDescent', icon: path.join(HERE, 'icon.ico'), asar: true,
  ignore: [/^\/out($|\/)/, /^\/build\.mjs$/, /^\/make-icon\.py$/],
  appCopyright: 'EveraldTah', win32metadata: { CompanyName: 'EveraldTah', FileDescription: 'Nebula Dominion: Iron Descent', ProductName: 'Nebula Dominion: Iron Descent' },
});
console.log('packaged:', appDir);

// 4. install + shortcuts
if (!process.argv.includes('--no-install')) {
  const dest = path.join(process.env.LOCALAPPDATA, 'Programs', 'IronDescent');
  try { execSync('taskkill /IM IronDescent.exe /F', { stdio: 'ignore' }); } catch { /* not running */ }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(appDir, dest, { recursive: true });
  const exe = path.join(dest, 'IronDescent.exe');
  // Desktop + Start menu shortcuts (a .ps1 file avoids nested-quote escaping through cmd)
  const ps1 = path.join(HERE, 'out', 'shortcuts.ps1');
  fs.writeFileSync(ps1, [
    '$s = New-Object -ComObject WScript.Shell',
    ...['Desktop', 'Programs'].map(folder => [
      `$l = $s.CreateShortcut((Join-Path ([Environment]::GetFolderPath('${folder}')) 'Nebula Dominion - Iron Descent.lnk'))`,
      `$l.TargetPath = '${exe}'`, `$l.WorkingDirectory = '${dest}'`, `$l.IconLocation = '${exe},0'`,
      `$l.Description = 'Nebula Dominion: Operation Iron Descent'`, '$l.Save()',
    ].join('\n')),
  ].join('\n'), 'utf8');
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`, { stdio: 'inherit' });
  console.log('installed:', exe);
}
