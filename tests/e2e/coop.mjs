// Two-player co-op test: two isolated browser sessions meet in the public lobby, form a squad over a
// real WebRTC link (or the broker relay with `relay`), and play Landfall together.
//   node tests/e2e/coop.mjs [url] [relay]
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://localhost:5173/';
const relay = process.argv[3] === 'relay';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails++; };
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1280, height: 720 } });
const errors = [];
async function player(name, extra) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  await p.goto(url, { waitUntil: 'networkidle0' });
  await p.evaluate((n, x) => { localStorage.setItem('nd-fps-name', n); if (x) localStorage.setItem('nd-net-relay', '1'); }, name, extra);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.click('#fps-btn');
  await p.waitForFunction(() => window.__lobby && window.__lobby.brokers > 0, { timeout: 30000 });
  return p;
}
const A = await player('Host-Ana', false);
const B = await player('Guest-Ben', relay);
const idA = await A.evaluate(() => window.__lobby.id), idB = await B.evaluate(() => window.__lobby.id);

// ---- lobby: each sees the other automatically
await A.waitForFunction(id => window.__lobby.players.has(id), { timeout: 30000 }, idB).catch(() => {});
await B.waitForFunction(id => window.__lobby.players.has(id), { timeout: 30000 }, idA).catch(() => {});
check(await A.evaluate(id => window.__lobby.players.get(id)?.name, idB) === 'Guest-Ben', 'host sees the guest in the online list automatically');
check(await B.evaluate(id => window.__lobby.players.get(id)?.name, idA) === 'Host-Ana', 'guest sees the host in the online list automatically');
await A.screenshot({ path: 'tests/e2e/shots/coop-1-lobby.png' });

// ---- invite + accept
await A.evaluate(id => document.querySelector(`[data-invite="${id}"]`).click(), idB);
await B.waitForSelector('#on-invite:not(.hidden)', { timeout: 20000 });
check(/Host-Ana/.test(await B.$eval('#on-invite', e => e.textContent)), 'guest receives the invite');
await B.screenshot({ path: 'tests/e2e/shots/coop-2-invite.png' });
await B.click('#on-accept');
await A.waitForFunction(() => window.__fpsMode.squad, { timeout: 20000 });
const want = relay ? 'relay' : 'p2p';
await A.waitForFunction(w => window.__fpsMode.squad?.link.state === w, { timeout: 25000 }, want).catch(() => {});
const linkA = await A.evaluate(() => window.__fpsMode.squad?.link.state), linkB = await B.evaluate(() => window.__fpsMode.squad?.link.state);
check(linkA === want && linkB === want, `squad formed over a ${want} link (host ${linkA}, guest ${linkB})`);
check(await A.evaluate(() => window.__fpsMode.squad.role) === 'host' && await B.evaluate(() => window.__fpsMode.squad.role) === 'guest', 'inviter hosts, invitee joins as guest');

// ---- host deploys, both drop into Landfall
await A.evaluate(() => document.querySelector('.fps-card').click()); await sleep(300);
await A.click('#fb-go');
const inGame = p => p.waitForFunction(() => window.__fps && document.getElementById('loading').classList.contains('hidden') && !document.getElementById('fps-hud').classList.contains('hidden'), { timeout: 90000 });
await Promise.all([inGame(A), inGame(B)]);
check(true, 'both players deployed into the same mission');
await sleep(4000);
const s1 = await A.evaluate(() => ({ role: window.__fps.role, thorns: window.__fps.enemies.filter(e => e.k.id === 'thorn').map(e => e.id), ally: window.__fps.ally?.lastMsg > 0 }));
const s2 = await B.evaluate(() => ({ role: window.__fps.role, thorns: window.__fps.enemies.filter(e => e.k.id === 'thorn').map(e => e.id), ally: window.__fps.ally?.lastMsg > 0, n: window.__fps.enemies.length }));
check(s1.role === 'host' && s2.role === 'guest', 'roles in game: host + guest');
check(s2.thorns.length === 3 && s2.thorns.join() === s1.thorns.join(), `guest sees the host's Kyrrh (same ids ${s2.thorns.join(',')}; ${s2.n} enemies)`);
check(s1.ally && s2.ally, 'each player sees the other one\'s avatar');

// ---- the partner's avatar is visible up close
await B.evaluate(() => { const g = window.__fps; g.pos.set(-8, g.heightAt(-8, -9), -9); g.yaw = 0.7; });
await A.evaluate(() => { const g = window.__fps; g.pos.set(0, g.heightAt(0, 0), 0); g.yaw = Math.atan2(8, 9); g.pitch = -0.08; });
await sleep(1500);
check(await A.evaluate(() => window.__fps.ally.obj.visible && window.__fps.ally.pos.distanceTo(window.__fps.pos) < 14), 'guest avatar stands next to the host');
await A.screenshot({ path: 'tests/e2e/shots/coop-avatar.png' });

// ---- the guest fights: bullets hit the host's Kyrrh
const t = s1.thorns[0];
const before = await A.evaluate(id => window.__fps.enemies.find(e => e.id === id).hp, t);
await B.evaluate(async id => {
  const g = window.__fps; const e = g.enemies.find(x => x.id === id);
  g.pos.set(e.pos.x + 30, g.heightAt(e.pos.x + 30, e.pos.z), e.pos.z);   // stand 30 m from the Thorn Colony
  g.testAuto = true; g.weapon = 'rifle';
  const aim = () => { const eye = g.eye(); const c = e.pos.clone(); c.y += e.k.radius * 0.6; g.yaw = Math.atan2(-(c.x - eye.x), -(c.z - eye.z)); g.pitch = Math.atan2(c.y - eye.y, Math.hypot(c.x - eye.x, c.z - eye.z)); };
  const up = g.update.bind(g); g.update = dt => { aim(); up(dt); };
  g.mouseDown = true; await new Promise(r => setTimeout(r, 2500)); g.mouseDown = false;
}, t);
await sleep(800);
const after = await A.evaluate(id => window.__fps.enemies.find(e => e.id === id)?.hp ?? 0, t);
check(after < before - 30, `guest's rifle damages the host's Thorn Colony (${before.toFixed(0)} -> ${after.toFixed(0)})`);
await B.screenshot({ path: 'tests/e2e/shots/coop-3-guest-view.png' });
await A.evaluate(() => { const g = window.__fps, a = g.ally; const eye = g.eye(); g.yaw = Math.atan2(-(a.pos.x - eye.x), -(a.pos.z - eye.z)); g.pitch = -0.02; });
await sleep(600);
await A.screenshot({ path: 'tests/e2e/shots/coop-4-host-sees-guest.png' });

// ---- the Kyrrh fight back against the guest (host AI, damage delivered over the link)
await B.evaluate(id => { const g = window.__fps; const e = g.enemies.find(x => x.id === id); g.pos.set(e.pos.x + 12, g.heightAt(e.pos.x + 12, e.pos.z), e.pos.z); }, s1.thorns[1]);
await sleep(5000);
const guestDmg = await B.evaluate(() => Object.values(window.__fps.dmgLog).reduce((a, b) => a + b, 0));
check(guestDmg > 0, `Kyrrh attack the guest too (${guestDmg.toFixed(0)} damage taken)`);

// ---- guest grenade blast is applied by the host
const tb = s1.thorns[2];
const hb = await A.evaluate(id => window.__fps.enemies.find(e => e.id === id).hp, tb);
await B.evaluate(id => { const g = window.__fps; const e = g.enemies.find(x => x.id === id); g.splashAt(e.pos.clone(), 4.5, 40, 20, false, true); }, tb);
await sleep(1200);
const ha = await A.evaluate(id => window.__fps.enemies.find(e => e.id === id)?.hp ?? 0, tb);
check(ha < hb - 30, `guest's HE grenade damages the host's Thorn (${hb.toFixed(0)} -> ${ha.toFixed(0)})`);

// ---- deaths propagate: host kills a Thorn, it dies on the guest's screen
await A.evaluate(id => { const g = window.__fps; const e = g.enemies.find(x => x.id === id); g.hurtEnemy(e, 5000, 0); }, t);
await sleep(1200);
check(await B.evaluate(id => { const e = window.__fps.enemies.find(x => x.id === id); return !e || !e.alive; }, t), 'a Kyrrh killed by the host dies for the guest');
check(await B.evaluate(() => window.__fps.kills.get('thorn') ?? 0) >= 1, 'kill counts / objectives sync to the guest');

// ---- guest goes down, then redeploys; host sees it
await B.evaluate(() => { const g = window.__fps; g.hurtPlayer(99999, 0, 1, 'test'); });
await sleep(1200);
check(await B.evaluate(() => window.__fps.downT > 0) && await A.evaluate(() => window.__fps.ally.down), 'guest goes down (not game over) and the host sees it');

// ---- host wins: both get the victory
await A.evaluate(() => { const g = window.__fps; g.elapsed = 121; for (const e of g.enemies) if (e.alive && e.k.id === 'thorn') g.hurtEnemy(e, 5000, 0); });
await Promise.all([A, B].map(p => p.waitForFunction(() => window.__fps?.result === 'win', { timeout: 15000 }).catch(() => {})));
check(await A.evaluate(() => window.__fps.result) === 'win' && await B.evaluate(() => window.__fps.result) === 'win', 'mission completes for both players');
await sleep(2000);
check(await B.$eval('#fe-next', e => e.classList.contains('hidden')) && /Waiting for/.test(await B.$eval('#fe-text', e => e.textContent)), 'guest waits for the host to pick the next deployment');
await B.screenshot({ path: 'tests/e2e/shots/coop-5-guest-end.png' });

// ---- host deploys the next mission: the guest follows automatically
await A.click('#fe-next'); await sleep(300); await A.click('#fb-go');
await Promise.all([inGame(A), inGame(B)]);
check(await B.evaluate(() => window.__fps.mission.id) === 'f2', 'guest follows the host into mission 2');

// ---- leaving the squad
await B.evaluate(() => window.__fpsMode.leaveSquad(true));
await A.waitForFunction(() => !window.__fpsMode.squad, { timeout: 15000 }).catch(() => {});
check(await A.evaluate(() => !window.__fpsMode.squad && !window.__fps.coop), 'host continues solo after the guest leaves');
check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
await b.close();
console.log(fails ? `${fails} FAILED` : `CO-OP ALL PASSED (${want})`);
process.exit(fails ? 1 : 0);
