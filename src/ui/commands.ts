import { ABILITIES, BUILD_MENUS, Cost, DEFS, LARVA_UNITS, RESEARCH, researchCost, researchTime } from '../sim/data';
import type { Entity, Game } from '../sim/game';
import { drawIcon } from '../render/sprites';
import { atlas } from '../render/atlas';
atlas.onReady(() => iconCache.clear());

export interface Btn {
  id: string;
  label: string;
  hotkey: string;
  icon?: string; // data url
  glyph?: string;
  enabled: boolean;
  active?: boolean;
  desc: string;
  cost?: Cost & { s?: number; t?: number };
  req?: string;
  run: () => void;
}

export interface CmdContext {
  game: Game;
  me: number;
  sel: Entity[];
  mode: 'main' | 'basic' | 'advanced';
  setMode: (m: 'main' | 'basic' | 'advanced') => void;
  target: (kind: string) => void;
  issue: (cmd: any) => void;
  targeting: string | null;
}

const iconCache = new Map<string, string>();
export function iconFor(id: string, color = '#3d9bff'): string {
  const key = id + color;
  let u = iconCache.get(key);
  if (u) return u;
  const def = DEFS[id];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 40);
  g.addColorStop(0, '#1c3550'); g.addColorStop(1, '#070d15');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  if (def && !atlas.icon(c, id, 64, color.toLowerCase() === '#ff4d4d' ? 1 : 0)) drawIcon(c, id, def.race, 64, color, def.kind);
  u = cv.toDataURL();
  iconCache.set(key, u);
  return u;
}

export function glyphIcon(glyph: string, color: string): string {
  const key = 'g' + glyph + color;
  let u = iconCache.get(key);
  if (u) return u;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
  const L = (pts: number[]) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke(); };
  switch (glyph) {
    case 'move': L([14, 50, 48, 16]); L([30, 16, 48, 16, 48, 34]); break;
    case 'stop': c.strokeRect(18, 18, 28, 28); break;
    case 'hold': L([18, 14, 18, 50]); L([46, 14, 46, 50]); L([18, 32, 46, 32]); break;
    case 'patrol': L([14, 24, 50, 24]); L([42, 16, 50, 24, 42, 32]); L([50, 42, 14, 42]); L([22, 34, 14, 42, 22, 50]); break;
    case 'attack': L([14, 50, 44, 20]); L([36, 12, 52, 12, 52, 28]); L([20, 36, 28, 44]); break;
    case 'gather': c.beginPath(); c.moveTo(32, 10); c.lineTo(48, 28); c.lineTo(40, 52); c.lineTo(24, 52); c.lineTo(16, 28); c.closePath(); c.stroke(); break;
    case 'return': L([46, 20, 22, 20, 22, 44]); L([14, 36, 22, 46, 30, 36]); break;
    case 'build': L([16, 48, 38, 26]); c.strokeRect(34, 12, 18, 12); break;
    case 'advbuild': L([16, 48, 38, 26]); c.strokeRect(34, 12, 18, 12); c.font = 'bold 18px sans-serif'; c.fillText('+', 12, 26); break;
    case 'rally': L([22, 52, 22, 12]); c.beginPath(); c.moveTo(22, 12); c.lineTo(46, 20); c.lineTo(22, 28); c.fill(); break;
    case 'cancel': L([18, 18, 46, 46]); L([46, 18, 18, 46]); break;
    case 'back': L([40, 14, 22, 32, 40, 50]); break;
    case 'overdrive': c.beginPath(); c.moveTo(36, 8); c.lineTo(18, 36); c.lineTo(32, 36); c.lineTo(26, 56); c.lineTo(46, 26); c.lineTo(32, 26); c.closePath(); c.fill(); break;
    case 'siege': c.strokeRect(18, 26, 28, 14); L([18, 40, 10, 52]); L([46, 40, 54, 52]); L([32, 26, 32, 10]); break;
    case 'unsiege': c.strokeRect(14, 26, 36, 16); L([32, 26, 52, 22]); break;
    case 'phase': c.beginPath(); c.arc(20, 40, 8, 0, 7); c.stroke(); c.beginPath(); c.arc(46, 20, 8, 0, 7); c.fill(); c.setLineDash([4, 5]); L([26, 34, 40, 26]); c.setLineDash([]); break;
    case 'spawnbrood': for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(20 + i * 12, 38 - (i % 2) * 8, 6, 9, 0, 0, 7); c.stroke(); } break;
    case 'solarlance': c.beginPath(); c.arc(20, 32, 9, 0, 7); c.fill(); c.lineWidth = 7; L([28, 32, 56, 32]); break;
    case 'morph': L([32, 52, 32, 14]); L([18, 28, 32, 14, 46, 28]); L([18, 42, 32, 28, 46, 42]); break;
    case 'weapons': L([16, 48, 44, 20]); L([40, 14, 50, 24]); L([20, 38, 26, 44]); break;
    case 'armor': c.beginPath(); c.moveTo(32, 10); c.lineTo(50, 18); c.lineTo(46, 42); c.lineTo(32, 54); c.lineTo(18, 42); c.lineTo(14, 18); c.closePath(); c.stroke(); break;
    case 'air': c.beginPath(); c.moveTo(52, 32); c.lineTo(14, 18); c.lineTo(22, 32); c.lineTo(14, 46); c.closePath(); c.stroke(); break;
    case 'tech': c.beginPath(); c.arc(32, 32, 14, 0, 7); c.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; L([32 + Math.cos(a) * 16, 32 + Math.sin(a) * 16, 32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22]); } break;
  }
  u = cv.toDataURL();
  iconCache.set(key, u);
  return u;
}

/** Primary selection type decides the command card (SC2-style subgroup). */
export function primaryOf(sel: Entity[]): Entity | undefined {
  const units = sel.filter(e => e.type === 'unit');
  const pool = units.length ? units : sel;
  const counts = new Map<string, number>();
  for (const e of pool) counts.set(e.def!.id, (counts.get(e.def!.id) ?? 0) + 1);
  let best: Entity | undefined, bn = -1;
  for (const e of pool) { const n = counts.get(e.def!.id)!; if (n > bn || (n === bn && (e.def!.supply ?? 0) > (best!.def!.supply ?? 0))) { bn = n; best = e; } }
  return best;
}

export function buildCard(ctx: CmdContext): Btn[] {
  const { game: g, me, sel } = ctx;
  const own = sel.filter(e => e.owner === me);
  if (!own.length) return [];
  const p = g.players[me];
  const prim = primaryOf(own)!;
  const def = prim.def!;
  const col = p.color;
  const btns: Btn[] = [];
  const affordable = (c: Cost) => p.minerals >= c.m && p.gas >= c.g;
  const ids = own.map(e => e.id);

  const units = own.filter(e => e.type === 'unit');
  if (units.length) {
    if (ctx.mode !== 'main' && prim.def!.worker) {
      const list = BUILD_MENUS[def.race][ctx.mode === 'basic' ? 'basic' : 'advanced'];
      for (const bid of list) {
        const bd = DEFS[bid];
        const miss = g.missingReq(me, bd);
        btns.push({
          id: 'build:' + bid, label: bd.name, hotkey: bd.hotkey, icon: iconFor(bid, col), enabled: !miss && affordable(bd.cost),
          desc: bd.desc, cost: { ...bd.cost, t: bd.time, s: bd.provides ? -bd.provides : undefined }, req: miss ? `Requires ${DEFS[miss].name}` : undefined,
          active: ctx.targeting === 'build:' + bid,
          run: () => { if (miss) return; ctx.target('build:' + bid); },
        });
      }
      btns.push({ id: 'back', label: 'Back', hotkey: 'Escape', icon: glyphIcon('back', '#cfe8ff'), enabled: true, desc: 'Return to the command menu.', run: () => ctx.setMode('main') });
      return btns;
    }
    const anyWeapon = units.some(u => g.weaponOf(u));
    btns.push({ id: 'move', label: 'Move', hotkey: 'M', icon: glyphIcon('move', '#8fffb0'), enabled: true, desc: 'Move to a location or follow a unit.', active: ctx.targeting === 'move', run: () => ctx.target('move') });
    btns.push({ id: 'stop', label: 'Stop', hotkey: 'S', icon: glyphIcon('stop', '#ff8a8a'), enabled: true, desc: 'Stop all current orders.', run: () => ctx.issue({ c: 'stop', ids }) });
    btns.push({ id: 'hold', label: 'Hold Position', hotkey: 'H', icon: glyphIcon('hold', '#ffd27a'), enabled: true, desc: 'Hold ground; attack only what comes in range.', run: () => ctx.issue({ c: 'hold', ids }) });
    btns.push({ id: 'patrol', label: 'Patrol', hotkey: 'P', icon: glyphIcon('patrol', '#8fd0ff'), enabled: true, desc: 'Patrol between here and a target point.', active: ctx.targeting === 'patrol', run: () => ctx.target('patrol') });
    if (anyWeapon) btns.push({ id: 'attack', label: 'Attack', hotkey: 'A', icon: glyphIcon('attack', '#ff6a6a'), enabled: true, desc: 'Attack a target, or attack-move toward a location.', active: ctx.targeting === 'amove', run: () => ctx.target('amove') });
    else btns.push(filler());
    if (def.worker) {
      btns.push({ id: 'gather', label: 'Gather', hotkey: 'G', icon: glyphIcon('gather', '#58b8ff'), enabled: true, desc: 'Harvest crystal or flux.', active: ctx.targeting === 'gather', run: () => ctx.target('gather') });
      btns.push({ id: 'return', label: 'Return Cargo', hotkey: 'C', icon: glyphIcon('return', '#5dffa0'), enabled: units.some(u => u.carry > 0), desc: 'Return carried resources.', run: () => ctx.issue({ c: 'return', ids }) });
      btns.push(filler(), filler(), filler());
      btns.push({ id: 'basic', label: 'Build Structure', hotkey: 'B', icon: glyphIcon('build', '#ffcf6a'), enabled: true, desc: 'Basic structures.', run: () => ctx.setMode('basic') });
      btns.push({ id: 'advanced', label: 'Build Advanced Structure', hotkey: 'V', icon: glyphIcon('advbuild', '#ffcf6a'), enabled: true, desc: 'Advanced (tier 2 and 3) structures.', run: () => ctx.setMode('advanced') });
    } else {
      // abilities row
      const abs = new Set<string>();
      for (const u of units) for (const a of u.def!.abilities ?? []) abs.add(a);
      while (btns.length < 10) btns.push(filler());
      for (const aid of abs) {
        const ab = ABILITIES[aid];
        const locked = !!ab.research && !p.researched.has(ab.research);
        const casters = units.filter(u => u.def!.abilities?.includes(aid));
        let enabled = !locked;
        if (aid === 'siege') enabled = casters.some(u => !u.sieged && u.transition <= 0);
        if (aid === 'unsiege') enabled = casters.some(u => u.sieged && u.transition <= 0);
        if (aid === 'spawnbrood') enabled = casters.some(u => u.energy >= 25);
        if (aid === 'solarlance') enabled = casters.some(u => u.lanceCd <= 0);
        if (aid === 'phase') enabled = !locked && casters.some(u => u.phaseCd <= 0);
        btns.push({
          id: 'ab:' + aid, label: ab.name, hotkey: ab.hotkey, icon: glyphIcon(aid, locked ? '#667' : '#ffcf6a'), enabled,
          desc: ab.desc + (ab.energy ? ` (${ab.energy} energy)` : '') + (ab.cooldown ? ` Cooldown ${ab.cooldown}s.` : ''),
          req: locked ? `Requires ${RESEARCH[ab.research!].name}` : undefined, active: ctx.targeting === 'ab:' + aid,
          run: () => {
            if (locked) return;
            if (ab.target === 'none') ctx.issue({ c: 'ability', ids, ability: aid });
            else ctx.target('ab:' + aid);
          },
        });
      }
    }
    return btns;
  }

  // ---------------- buildings
  const same = own.filter(e => e.def!.id === def.id);
  const sids = same.map(e => e.id);
  if (!prim.built) {
    for (let i = 0; i < 14; i++) btns.push(filler());
    btns.push({ id: 'cancel', label: 'Cancel Construction', hotkey: 'Escape', icon: glyphIcon('cancel', '#ff6a6a'), enabled: true, desc: 'Cancel and refund 75%.', run: () => ctx.issue({ c: 'cancel', id: prim.id }) });
    return btns;
  }
  const trains = [...(def.larvaHost ? LARVA_UNITS : []), ...(def.trains ?? [])];
  for (const uid of trains) {
    const ud = DEFS[uid];
    const miss = g.missingReq(me, ud);
    const larvaOk = !ud.larva || same.some(b => b.larva > 0);
    btns.push({
      id: 'train:' + uid, label: (ud.larva ? 'Hatch ' : 'Train ') + ud.name + (ud.pairs ? ' (x2)' : ''), hotkey: ud.hotkey, icon: iconFor(uid, col),
      enabled: !miss && affordable(ud.cost) && larvaOk, desc: ud.desc + (ud.larva ? ' Uses 1 larva.' : ''),
      cost: { ...ud.cost, s: ud.supply * (ud.pairs ?? 1), t: ud.time }, req: miss ? `Requires ${DEFS[miss].name}` : !larvaOk ? 'No larva available' : undefined,
      run: () => ctx.issue({ c: 'train', ids: sids, unit: uid }),
    });
  }
  for (const rid of def.researches ?? []) {
    const r = RESEARCH[rid];
    const lvl = g.researchLevel(me, rid);
    const done = !g.researchAvailable(me, rid) && !p.researching.has(rid);
    const tierNeed = g.researchTierNeeded(me, rid);
    const tierOk = g.tierOf(me) >= tierNeed;
    const c = researchCost(r, lvl);
    btns.push({
      id: 'res:' + rid, label: r.name + (r.levels ? ` Level ${Math.min(lvl + 1, r.levels)}` : ''), hotkey: r.hotkey,
      icon: glyphIcon(r.kind === 'tech' ? 'tech' : r.kind, done ? '#667' : '#ffcf6a'),
      enabled: !done && !p.researching.has(rid) && tierOk && affordable(c) && same.some(b => b.queue.length === 0),
      desc: r.desc, cost: done ? undefined : { ...c, t: researchTime(r, lvl) },
      req: done ? 'Fully researched' : p.researching.has(rid) ? 'Researching…' : !tierOk ? `Requires a Tier ${tierNeed} main base` : undefined,
      run: () => ctx.issue({ c: 'research', ids: sids, research: rid }),
    });
  }
  if (def.morphTo) {
    const md = DEFS[def.morphTo];
    const miss = g.missingReq(me, md);
    const busy = !same.some(b => b.queue.length === 0);
    btns.push({
      id: 'morph', label: `Upgrade to ${md.name}`, hotkey: md.hotkey, icon: glyphIcon('morph', '#ffcf6a'),
      enabled: !miss && affordable(md.cost) && !busy, desc: md.desc, cost: { ...md.cost, t: md.time },
      req: miss ? `Requires ${DEFS[miss].name}` : busy ? 'Structure is busy' : undefined,
      run: () => ctx.issue({ c: 'morph', ids: sids, to: md.id }),
    });
  }
  while (btns.length < 13) btns.push(filler());
  if (trains.length || def.dropoff) btns.push({ id: 'rally', label: 'Set Rally Point', hotkey: 'Y', icon: glyphIcon('rally', '#8fffb0'), enabled: true, desc: 'Set where new units gather. Rally onto crystal to auto-harvest.', active: ctx.targeting === 'rally', run: () => ctx.target('rally') });
  else btns.push(filler());
  const cancellable = same.some(b => b.queue.length || b.eggs.length);
  btns.push({ id: 'cancel', label: 'Cancel', hotkey: 'Escape', icon: glyphIcon('cancel', '#ff6a6a'), enabled: cancellable, desc: 'Cancel the last queued item (full refund).', run: () => { const b = same.find(b => b.queue.length || b.eggs.length); if (b) ctx.issue({ c: 'cancel', id: b.id }); } });
  return btns;
}

function filler(): Btn { return { id: '', label: '', hotkey: '', enabled: false, desc: '', run: () => {} }; }
