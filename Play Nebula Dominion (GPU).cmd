@echo off
rem Local GPU launcher: serves the built game on http://localhost:4747 and opens it in a
rem dedicated Chrome window with GPU rasterization forced on (RTX 3050).
cd /d "%~dp0"
if not exist dist\index.html call npm run build
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:4747 -TimeoutSec 1) | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 start "Nebula Dominion server" /min node serve-local.mjs 4747
timeout /t 1 /nobreak >nul
set PROFILE=%LOCALAPPDATA%\NebulaDominion\chrome-profile
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy --force_high_performance_gpu --autoplay-policy=no-user-gesture-required --start-maximized --app=http://localhost:4747
