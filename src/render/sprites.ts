// Procedural top-down vector art for every unit, building and resource. All drawn with Canvas2D.
import type { Race } from '../sim/data';

export const TILE = 32;
type Ctx = CanvasRenderingContext2D;

export interface UnitState {
  t: number; // seconds (animation clock)
  moving: boolean;
  attacking: boolean; // recently fired
  sieged?: boolean;
  transition?: number;
  carry?: 'm' | 'g' | null;
  working?: boolean;
  seed: number;
  overdrive?: boolean;
  channel?: boolean;
}

const PAL = {
  directorate: { base: '#8795a3', dark: '#3a444f', light: '#c3ccd6', accent: '#ffb347', glow: '#ffd27a' },
  kyrrh: { base: '#7a3a70', dark: '#3d1737', light: '#b56aa6', accent: '#c8ff5a', bone: '#e8dcb8' },
  aethel: { base: '#d9b45a', dark: '#7a5a22', light: '#fff1c4', accent: '#5ef0ff', white: '#f5efe0' },
};

function circle(c: Ctx, x: number, y: number, r: number, fill?: string, stroke?: string, lw = 1) {
  c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, fill?: string, stroke?: string, rot = 0) {
  c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
}
function poly(c: Ctx, pts: number[], fill?: string, stroke?: string, lw = 1) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function rect(c: Ctx, x: number, y: number, w: number, h: number, fill?: string, stroke?: string) {
  if (fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.strokeRect(x, y, w, h); }
}
function line(c: Ctx, x1: number, y1: number, x2: number, y2: number, stroke: string, lw = 1) {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = stroke; c.lineWidth = lw; c.stroke();
}
function glow(c: Ctx, x: number, y: number, r: number, color: string, a = 0.6) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha *= a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.globalAlpha /= a;
}
function legs(c: Ctx, n: number, len: number, spread: number, t: number, moving: boolean, color: string, lw: number, body = 0.4) {
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2);
    const bx = (k - (n / 2 - 1) / 2) * spread;
    const ph = moving ? Math.sin(t * 16 + i * 1.7) * 0.45 : 0;
    const ang = side * (Math.PI / 2) + ph * side;
    const mx = bx + Math.cos(ang) * len * 0.55, my = side * body + Math.sin(ang) * len * 0.55;
    const ex = bx + Math.cos(ang) * len + (moving ? Math.sin(t * 16 + i) * 1.5 : 0), ey = side * (body + len * 0.9);
    c.beginPath(); c.moveTo(bx, side * body * 0.5); c.lineTo(mx, my); c.lineTo(ex, ey);
    c.strokeStyle = color; c.lineWidth = lw; c.stroke();
  }
}

type UnitDraw = (c: Ctx, r: number, team: string, s: UnitState) => void;

const D = PAL.directorate, K = PAL.kyrrh, A = PAL.aethel;

export const UNIT_ART: Record<string, UnitDraw> = {
  // ------------------------------------------------ DIRECTORATE
  rigger(c, r, team, s) {
    const bob = s.moving ? Math.sin(s.t * 18) * 1 : 0;
    ellipse(c, -r * 0.35, 0, r * 0.45, r * 0.6, D.dark);
    circle(c, 0, bob * 0.3, r * 0.62, D.base, D.dark);
    circle(c, r * 0.1, 0, r * 0.32, team);
    rect(c, r * 0.2, -r * 0.8, r * 0.7, r * 0.25, D.dark);
    rect(c, r * 0.2, r * 0.55, r * 0.7, r * 0.25, D.dark);
    if (s.working || s.attacking) { glow(c, r * 1.0, -r * 0.68, r * 0.7, '#fff3a0', 0.9); circle(c, r * 1.0, -r * 0.68, r * 0.12, '#fff'); }
    if (s.carry === 'm') poly(c, [-r * 0.9, 0, -r * 0.6, -r * 0.35, -r * 0.3, 0, -r * 0.6, r * 0.35], '#6fd6ff', '#e0f8ff');
    if (s.carry === 'g') circle(c, -r * 0.65, 0, r * 0.3, '#5dffa0', '#1f6');
  },
  trooper(c, r, team, s) {
    const st = s.moving ? Math.sin(s.t * 14) : 0;
    ellipse(c, -r * 0.1 + st * r * 0.3, -r * 0.35, r * 0.35, r * 0.18, D.dark);
    ellipse(c, -r * 0.1 - st * r * 0.3, r * 0.35, r * 0.35, r * 0.18, D.dark);
    ellipse(c, 0, 0, r * 0.55, r * 0.85, D.base, D.dark);
    rect(c, r * 0.1, r * 0.1, r * 1.25, r * 0.22, '#2a2f36');
    circle(c, 0.05 * r, 0, r * 0.42, team, '#1a1a1a');
    rect(c, r * 0.15, -r * 0.12, r * 0.25, r * 0.24, D.glow);
    if (s.attacking) { glow(c, r * 1.45, r * 0.2, r * 0.8, '#ffe07a', 1); }
    if (s.overdrive) glow(c, 0, 0, r * 1.3, '#ff3030', 0.35);
  },
  breacher(c, r, team, s) {
    const st = s.moving ? Math.sin(s.t * 12) : 0;
    ellipse(c, st * r * 0.25, -r * 0.45, r * 0.35, r * 0.2, D.dark);
    ellipse(c, -st * r * 0.25, r * 0.45, r * 0.35, r * 0.2, D.dark);
    ellipse(c, 0, 0, r * 0.6, r * 0.9, D.base, D.dark);
    ellipse(c, 0, -r * 0.62, r * 0.38, r * 0.3, D.light, D.dark);
    ellipse(c, 0, r * 0.62, r * 0.38, r * 0.3, D.light, D.dark);
    rect(c, r * 0.2, r * 0.3, r * 1.0, r * 0.35, '#2f353c');
    rect(c, r * 0.2, -r * 0.65, r * 0.8, r * 0.3, '#2f353c');
    circle(c, 0, 0, r * 0.38, team, '#111');
    if (s.attacking) glow(c, r * 1.25, r * 0.47, r * 0.8, '#ffb347', 1);
    if (s.overdrive) glow(c, 0, 0, r * 1.3, '#ff3030', 0.35);
  },
  mender(c, r, team, s) {
    const st = s.moving ? Math.sin(s.t * 14) : 0;
    ellipse(c, st * r * 0.3, -r * 0.35, r * 0.33, r * 0.17, D.dark);
    ellipse(c, -st * r * 0.3, r * 0.35, r * 0.33, r * 0.17, D.dark);
    ellipse(c, 0, 0, r * 0.55, r * 0.85, '#e8eef2', D.dark);
    circle(c, 0, 0, r * 0.42, team, '#111');
    rect(c, -r * 0.1, -r * 0.3, r * 0.2, r * 0.6, '#3dff8a');
    rect(c, -r * 0.3, -r * 0.1, r * 0.6, r * 0.2, '#3dff8a');
    rect(c, -r * 0.95, -r * 0.35, r * 0.45, r * 0.7, D.dark);
  },
  scorcher(c, r, team, s) {
    const wob = s.moving ? Math.sin(s.t * 30) * 0.5 : 0;
    for (const [x, y] of [[-0.55, -0.62], [0.45, -0.62], [-0.55, 0.62], [0.45, 0.62]]) rect(c, x * r - r * 0.22, y * r - r * 0.13 + wob, r * 0.44, r * 0.26, '#1c1f24');
    poly(c, [-r * 0.9, -r * 0.5, r * 0.6, -r * 0.45, r * 0.95, 0, r * 0.6, r * 0.45, -r * 0.9, r * 0.5], D.base, D.dark);
    rect(c, -r * 0.6, -r * 0.2, r * 0.5, r * 0.4, team);
    circle(c, r * 0.3, 0, r * 0.22, '#ff7a1a', '#521');
    line(c, r * 0.3, 0, r * 1.1, 0, '#444', r * 0.14);
    if (s.attacking) { glow(c, r * 1.4, 0, r * 1.2, '#ff8a20', 1); }
  },
  juggernaut(c, r, team, s) {
    const tread = (s.t * 8) % 1;
    rect(c, -r * 0.95, -r * 0.8, r * 1.9, r * 0.36, '#23272c');
    rect(c, -r * 0.95, r * 0.44, r * 1.9, r * 0.36, '#23272c');
    if (s.moving) for (let i = 0; i < 6; i++) { const x = -r * 0.95 + ((i + tread) / 6) * r * 1.9; line(c, x, -r * 0.8, x, -r * 0.44, '#555', 1); line(c, x, r * 0.44, x, r * 0.8, '#555', 1); }
    rect(c, -r * 0.8, -r * 0.5, r * 1.6, r * 1.0, D.base, D.dark);
    rect(c, -r * 0.7, -r * 0.3, r * 0.3, r * 0.6, team);
    const sieged = s.sieged || (s.transition ?? 0) > 0;
    if (sieged) {
      for (const a of [0.8, 2.35, 3.93, 5.5]) line(c, Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, D.dark, r * 0.18);
      circle(c, 0, 0, r * 0.5, D.light, D.dark);
      rect(c, 0, -r * 0.12, r * 1.6, r * 0.24, '#30363d');
      rect(c, r * 1.45, -r * 0.16, r * 0.25, r * 0.32, '#30363d');
    } else {
      circle(c, 0, 0, r * 0.42, D.light, D.dark);
      rect(c, 0, -r * 0.09, r * 1.25, r * 0.18, '#30363d');
    }
    if (s.attacking) glow(c, sieged ? r * 1.8 : r * 1.35, 0, r * 1.1, '#ffcf6a', 1);
  },
  wasp(c, r, team, s) {
    const spin = s.t * 40;
    poly(c, [r * 1.0, 0, r * 0.2, -r * 0.35, -r * 0.9, -r * 0.15, -r * 0.9, r * 0.15, r * 0.2, r * 0.35], D.base, D.dark);
    rect(c, -r * 0.2, -r * 0.95, r * 0.35, r * 1.9, D.dark);
    for (const y of [-0.95, 0.95]) {
      c.globalAlpha *= 0.5; circle(c, 0, y * r, r * 0.55, 'rgba(200,210,220,0.25)'); c.globalAlpha /= 0.5;
      line(c, Math.cos(spin) * r * 0.5, y * r + Math.sin(spin) * r * 0.5, -Math.cos(spin) * r * 0.5, y * r - Math.sin(spin) * r * 0.5, '#ddd', 1.5);
    }
    circle(c, r * 0.35, 0, r * 0.2, '#9fe3ff');
    rect(c, -r * 0.75, -r * 0.12, r * 0.4, r * 0.24, team);
    if (s.attacking) { glow(c, r * 0.4, -r * 0.95, r * 0.6, '#ffae40', 1); glow(c, r * 0.4, r * 0.95, r * 0.6, '#ffae40', 1); }
  },
  dreadnought(c, r, team, s) {
    poly(c, [r * 1.2, 0, r * 0.6, -r * 0.45, -r * 0.9, -r * 0.55, -r * 1.1, -r * 0.3, -r * 1.1, r * 0.3, -r * 0.9, r * 0.55, r * 0.6, r * 0.45], D.base, D.dark, 1.5);
    poly(c, [r * 0.9, 0, r * 0.3, -r * 0.22, -r * 0.6, -r * 0.25, -r * 0.6, r * 0.25, r * 0.3, r * 0.22], D.light, D.dark);
    for (let i = -3; i <= 3; i++) line(c, -r * 0.8, i * r * 0.09, r * 0.4, i * r * 0.09, 'rgba(40,50,60,0.4)', 1);
    rect(c, -r * 0.4, -r * 0.1, r * 0.35, r * 0.2, team);
    for (const y of [-0.38, 0, 0.38]) glow(c, -r * 1.15, y * r, r * 0.35 + Math.sin(s.t * 20 + y) * 2, '#6ac8ff', 1);
    for (const [x, y] of [[0.3, -0.35], [0.3, 0.35], [-0.3, -0.42], [-0.3, 0.42]]) { circle(c, x * r, y * r, r * 0.1, D.dark); if (s.attacking) glow(c, x * r + r * 0.15, y * r, r * 0.25, '#ff5050', 1); }
    if (s.channel) { glow(c, r * 1.3, 0, r * (0.6 + Math.sin(s.t * 30) * 0.15), '#ffd24a', 1); }
  },
  titan(c, r, team, s) {
    const st = s.moving ? Math.sin(s.t * 6) : 0;
    ellipse(c, st * r * 0.45, -r * 0.62, r * 0.42, r * 0.26, D.dark, '#111');
    ellipse(c, -st * r * 0.45, r * 0.62, r * 0.42, r * 0.26, D.dark, '#111');
    poly(c, [r * 0.6, -r * 0.5, r * 0.7, 0, r * 0.6, r * 0.5, -r * 0.6, r * 0.7, -r * 0.7, 0, -r * 0.6, -r * 0.7], D.base, D.dark, 1.5);
    circle(c, 0, 0, r * 0.36, D.light, D.dark);
    rect(c, -r * 0.2, -r * 0.14, r * 0.3, r * 0.28, team);
    for (const y of [-0.62, 0.62]) { rect(c, -r * 0.2, y * r - r * 0.2, r * 0.9, r * 0.4, '#353c44', '#111'); rect(c, r * 0.6, y * r - r * 0.08, r * 0.6, r * 0.16, '#222'); if (s.attacking) glow(c, r * 1.3, y * r, r * 0.6, '#ffcf6a', 1); }
  },
  // ------------------------------------------------ KYRRH
  grub(c, r, team, s) {
    legs(c, 6, r * 0.7, r * 0.35, s.t, s.moving || !!s.working, K.dark, 1.2, r * 0.3);
    ellipse(c, -r * 0.1, 0, r * 0.75, r * 0.55, K.base, K.dark);
    for (let i = 0; i < 3; i++) line(c, -r * 0.5 + i * r * 0.3, -r * 0.45, -r * 0.5 + i * r * 0.3, r * 0.45, K.dark, 1);
    ellipse(c, r * 0.55, 0, r * 0.3, r * 0.3, K.light);
    line(c, r * 0.75, -r * 0.15, r * 1.0, -r * 0.3, K.bone, 1.5); line(c, r * 0.75, r * 0.15, r * 1.0, r * 0.3, K.bone, 1.5);
    circle(c, -r * 0.3, 0, r * 0.15, team);
    if (s.carry === 'm') poly(c, [r * 0.9, 0, r * 1.1, -r * 0.25, r * 1.3, 0, r * 1.1, r * 0.25], '#6fd6ff');
    if (s.carry === 'g') circle(c, r * 1.05, 0, r * 0.25, '#5dffa0');
  },
  drover(c, r, team, s) {
    const b = Math.sin(s.t * 2) * 0.06;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.sin(s.t * 1.5 + i) * 0.2;
      c.beginPath(); c.moveTo(0, 0);
      c.quadraticCurveTo(Math.cos(a + 0.4) * r * 0.9, Math.sin(a + 0.4) * r * 0.9, Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25);
      c.strokeStyle = K.dark; c.lineWidth = 2; c.stroke();
    }
    ellipse(c, 0, 0, r * (0.85 + b), r * (0.72 - b), K.light, K.dark);
    ellipse(c, -r * 0.1, -r * 0.1, r * 0.45, r * 0.35, 'rgba(255,220,250,0.35)');
    circle(c, r * 0.35, 0, r * 0.18, team);
    for (let i = 0; i < 4; i++) glow(c, Math.cos(i * 1.6) * r * 0.5, Math.sin(i * 1.6) * r * 0.45, r * 0.2, K.accent, 0.5 + Math.sin(s.t * 3 + i) * 0.3);
  },
  skitterling(c, r, team, s) {
    legs(c, 4, r * 0.8, r * 0.5, s.t * 1.5, s.moving, K.dark, 1.3, r * 0.25);
    ellipse(c, 0, 0, r * 0.8, r * 0.42, K.base, K.dark);
    ellipse(c, r * 0.55, 0, r * 0.3, r * 0.26, K.light);
    const sw = s.attacking ? 0.6 : 0.2;
    line(c, r * 0.1, -r * 0.3, r * 1.0, -r * (0.55 - sw), K.bone, 2);
    line(c, r * 0.1, r * 0.3, r * 1.0, r * (0.55 - sw), K.bone, 2);
    circle(c, -r * 0.3, 0, r * 0.15, team);
  },
  carapid(c, r, team, s) {
    legs(c, 6, r * 0.55, r * 0.4, s.t, s.moving, K.dark, 1.6, r * 0.45);
    ellipse(c, 0, 0, r * 0.95, r * 0.72, K.dark);
    for (let i = 0; i < 4; i++) ellipse(c, -r * 0.45 + i * r * 0.28, 0, r * 0.28, r * 0.66 - i * r * 0.05, i % 2 ? K.base : K.light, K.dark);
    ellipse(c, r * 0.72, 0, r * 0.3, r * 0.35, K.base, K.dark);
    glow(c, r * 0.9, 0, r * (s.attacking ? 0.7 : 0.35), K.accent, 0.9);
    circle(c, -r * 0.1, 0, r * 0.16, team);
  },
  quillback(c, r, team, s) {
    const w = s.moving ? Math.sin(s.t * 8) : 0;
    c.beginPath(); c.moveTo(-r * 1.1, w * r * 0.3);
    c.quadraticCurveTo(-r * 0.4, -w * r * 0.4, r * 0.2, 0);
    c.strokeStyle = K.base; c.lineWidth = r * 0.55; c.lineCap = 'round'; c.stroke(); c.lineCap = 'butt';
    ellipse(c, r * 0.35, 0, r * 0.55, r * 0.45, K.base, K.dark);
    for (let i = 0; i < 6; i++) {
      const x = -r * 0.8 + i * r * 0.28, y = (w * r * 0.2) * (1 - i / 6);
      line(c, x, y, x - r * 0.3, y - r * 0.45, K.bone, 1.5); line(c, x, y, x - r * 0.3, y + r * 0.45, K.bone, 1.5);
    }
    ellipse(c, r * 0.8, 0, r * 0.28, r * 0.24, K.light);
    circle(c, r * 0.2, 0, r * 0.16, team);
    if (s.attacking) glow(c, r * 1.05, 0, r * 0.5, K.accent, 1);
  },
  wyvern(c, r, team, s) {
    const f = Math.sin(s.t * 10) * 0.5 + 0.5;
    for (const side of [-1, 1]) poly(c, [r * 0.2, 0, -r * 0.3, side * r * (0.4 + f * 0.9), -r * 0.9, side * r * (0.3 + f * 0.7), -r * 0.4, side * r * 0.15], 'rgba(150,70,140,0.85)', K.dark);
    c.beginPath(); c.moveTo(-r * 0.3, 0); c.quadraticCurveTo(-r * 0.9, Math.sin(s.t * 4) * r * 0.4, -r * 1.3, 0); c.strokeStyle = K.base; c.lineWidth = r * 0.18; c.stroke();
    ellipse(c, 0, 0, r * 0.6, r * 0.24, K.base, K.dark);
    ellipse(c, r * 0.6, 0, r * 0.22, r * 0.18, K.light);
    circle(c, -r * 0.1, 0, r * 0.1, team);
    if (s.attacking) glow(c, r * 0.8, 0, r * 0.5, K.accent, 1);
  },
  behemoth(c, r, team, s) {
    legs(c, 4, r * 0.55, r * 0.8, s.t * 0.6, s.moving, K.dark, r * 0.18, r * 0.5);
    ellipse(c, 0, 0, r * 1.0, r * 0.75, K.dark);
    for (let i = 0; i < 5; i++) ellipse(c, -r * 0.6 + i * r * 0.28, 0, r * 0.26, r * 0.7 - Math.abs(i - 2) * r * 0.08, i % 2 ? K.base : K.light, K.dark);
    for (let i = 0; i < 5; i++) poly(c, [-r * 0.6 + i * r * 0.28, -r * 0.2, -r * 0.5 + i * r * 0.28, 0, -r * 0.6 + i * r * 0.28, r * 0.2, -r * 0.9 + i * r * 0.28, 0], K.bone);
    ellipse(c, r * 0.82, 0, r * 0.3, r * 0.35, K.base, K.dark);
    const sw = s.attacking ? 0.35 : 0;
    for (const side of [-1, 1]) { c.beginPath(); c.moveTo(r * 0.8, side * r * 0.3); c.quadraticCurveTo(r * 1.4, side * r * (0.9 - sw), r * 1.6, side * r * (0.3 - sw)); c.strokeStyle = K.bone; c.lineWidth = r * 0.14; c.stroke(); }
    circle(c, 0, 0, r * 0.15, team);
  },
  matron(c, r, team, s) {
    legs(c, 4, r * 0.6, r * 0.5, s.t * 0.8, s.moving, K.dark, 1.5, r * 0.35);
    ellipse(c, -r * 0.2, 0, r * 0.75, r * 0.55, K.base, K.dark);
    circle(c, r * 0.35, 0, r * 0.42, K.light, K.dark);
    for (let i = -2; i <= 2; i++) poly(c, [r * 0.35 + Math.cos(i * 0.5) * r * 0.4, Math.sin(i * 0.5) * r * 0.4, r * 0.35 + Math.cos(i * 0.5) * r * 0.7, Math.sin(i * 0.5) * r * 0.7, r * 0.35 + Math.cos(i * 0.5 + 0.12) * r * 0.4, Math.sin(i * 0.5 + 0.12) * r * 0.4], K.bone);
    for (const side of [-1, 1]) line(c, r * 0.1, side * r * 0.4, r * 0.9, side * r * (s.attacking ? 0.3 : 0.65), K.bone, 2);
    circle(c, -r * 0.3, 0, r * 0.16, team);
    glow(c, r * 0.35, 0, r * 0.4, K.accent, 0.4 + Math.sin(s.t * 3) * 0.2);
  },
  gravemaw(c, r, team, s) {
    const f = Math.sin(s.t * 2.5);
    for (const side of [-1, 1]) poly(c, [r * 0.3, side * r * 0.35, -r * 0.2, side * r * (1.0 + f * 0.15), -r * 0.8, side * r * (0.8 + f * 0.1), -r * 0.5, side * r * 0.3], 'rgba(110,50,105,0.9)', K.dark);
    poly(c, [-r * 1.1, 0, -r * 1.45, -r * 0.35 - f * r * 0.1, -r * 1.35, 0, -r * 1.45, r * 0.35 + f * r * 0.1], K.base, K.dark);
    ellipse(c, 0, 0, r * 1.1, r * 0.55, K.base, K.dark, 0);
    for (let i = 0; i < 5; i++) ellipse(c, -r * 0.7 + i * r * 0.3, 0, r * 0.14, r * 0.45, 'rgba(232,220,184,0.35)');
    const open = s.attacking ? 0.35 : 0.15;
    poly(c, [r * 0.8, -r * 0.35, r * 1.35, -r * open, r * 1.0, 0, r * 1.35, r * open, r * 0.8, r * 0.35], K.dark);
    glow(c, r * 1.05, 0, r * 0.5, K.accent, 0.6 + (s.attacking ? 0.4 : 0));
    circle(c, -r * 0.2, 0, r * 0.14, team);
  },
  // ------------------------------------------------ AETHEL
  acolyte(c, r, team, s) {
    const h = Math.sin(s.t * 4 + s.seed) * 0.08;
    glow(c, 0, 0, r * 1.2, A.accent, 0.35);
    circle(c, 0, 0, r * (0.85 + h), undefined, A.base, 1.5);
    poly(c, [r * 0.7, 0, 0, -r * 0.5, -r * 0.6, 0, 0, r * 0.5], A.base, A.dark);
    poly(c, [r * 0.35, 0, 0, -r * 0.22, -r * 0.25, 0, 0, r * 0.22], team);
    if (s.working || s.attacking) line(c, r * 0.7, 0, r * 1.3, 0, A.accent, 2);
    if (s.carry === 'm') poly(c, [-r * 0.9, 0, -r * 0.65, -r * 0.3, -r * 0.4, 0, -r * 0.65, r * 0.3], '#6fd6ff');
    if (s.carry === 'g') circle(c, -r * 0.7, 0, r * 0.25, '#5dffa0');
  },
  vindicator(c, r, team, s) {
    const st = s.moving ? Math.sin(s.t * 13) : 0;
    ellipse(c, st * r * 0.3, -r * 0.35, r * 0.3, r * 0.16, A.dark);
    ellipse(c, -st * r * 0.3, r * 0.35, r * 0.3, r * 0.16, A.dark);
    ellipse(c, 0, 0, r * 0.5, r * 0.8, A.base, A.dark);
    ellipse(c, 0, -r * 0.55, r * 0.3, r * 0.25, A.white, A.dark);
    ellipse(c, 0, r * 0.55, r * 0.3, r * 0.25, A.white, A.dark);
    circle(c, r * 0.05, 0, r * 0.3, team);
    const swing = s.attacking ? Math.sin(s.t * 40) * 0.8 : 0.3;
    for (const side of [-1, 1]) { const a = side * (0.5 - swing * 0.6); line(c, r * 0.1, side * r * 0.6, r * 0.1 + Math.cos(a) * r * 1.1, side * r * 0.6 + Math.sin(a) * r * 1.1, A.accent, 2.5); glow(c, r * 0.1 + Math.cos(a) * r * 0.9, side * r * 0.6 + Math.sin(a) * r * 0.9, r * 0.4, A.accent, 0.6); }
  },
  seeker(c, r, team, s) {
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2 + (s.moving ? Math.sin(s.t * 12 + i * 1.6) * 0.25 : 0);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); c.lineTo(Math.cos(a) * r * 1.1 + r * 0.1, Math.sin(a) * r * 1.2);
      c.strokeStyle = A.dark; c.lineWidth = 2; c.stroke();
    }
    poly(c, [r * 0.7, 0, r * 0.1, -r * 0.5, -r * 0.6, -r * 0.3, -r * 0.6, r * 0.3, r * 0.1, r * 0.5], A.base, A.dark);
    poly(c, [r * 0.45, 0, r * 0.05, -r * 0.2, -r * 0.2, 0, r * 0.05, r * 0.2], A.accent);
    rect(c, -r * 0.5, -r * 0.1, r * 0.25, r * 0.2, team);
    glow(c, r * 0.2, 0, r * (s.attacking ? 0.9 : 0.4), A.accent, 0.8);
  },
  bulwark(c, r, team, s) {
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2 + (s.moving ? Math.sin(s.t * 9 + i * 1.6) * 0.2 : 0); line(c, 0, 0, Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05, A.dark, r * 0.18); }
    poly(c, [r * 0.8, -r * 0.4, r * 0.8, r * 0.4, -r * 0.2, r * 0.75, -r * 0.8, r * 0.4, -r * 0.8, -r * 0.4, -r * 0.2, -r * 0.75], A.base, A.dark, 1.5);
    circle(c, 0, 0, r * 0.4, A.white, A.dark);
    rect(c, r * 0.2, -r * 0.14, r * 0.9, r * 0.28, A.dark);
    circle(c, -r * 0.1, 0, r * 0.2, team);
    glow(c, r * 1.1, 0, r * (s.attacking ? 0.9 : 0.35), A.accent, 0.9);
  },
  strider(c, r, team, s) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 3 + (s.moving ? Math.sin(s.t * 5 + i * 2.1) * 0.3 : 0);
      line(c, 0, 0, Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, A.base, r * 0.14);
      line(c, Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3, A.dark, r * 0.1);
    }
    circle(c, 0, 0, r * 0.55, A.base, A.dark, 1.5);
    circle(c, 0, 0, r * 0.35, A.white);
    rect(c, r * 0.2, -r * 0.35, r * 0.7, r * 0.18, A.dark); rect(c, r * 0.2, r * 0.17, r * 0.7, r * 0.18, A.dark);
    circle(c, -r * 0.1, 0, r * 0.18, team);
    glow(c, r * 0.9, 0, r * (s.attacking ? 1.0 : 0.3), '#ff9a3a', 0.9);
  },
  radiant(c, r, team, s) {
    poly(c, [r * 1.1, 0, -r * 0.8, -r * 0.85, -r * 0.4, 0, -r * 0.8, r * 0.85], A.base, A.dark, 1.5);
    poly(c, [r * 0.7, 0, -r * 0.4, -r * 0.45, -r * 0.2, 0, -r * 0.4, r * 0.45], A.white);
    const p = 0.6 + Math.sin(s.t * 6) * 0.2;
    glow(c, r * 0.1, 0, r * p, A.accent, 1);
    poly(c, [r * 0.35, 0, r * 0.05, -r * 0.18, -r * 0.2, 0, r * 0.05, r * 0.18], A.accent);
    rect(c, -r * 0.7, -r * 0.08, r * 0.3, r * 0.16, team);
  },
  empyrean(c, r, team, s) {
    c.beginPath(); c.arc(-r * 0.3, 0, r * 1.05, -1.2, 1.2); c.arc(-r * 0.6, 0, r * 0.75, 1.1, -1.1, true); c.closePath();
    c.fillStyle = A.base; c.fill(); c.strokeStyle = A.dark; c.lineWidth = 1.5; c.stroke();
    ellipse(c, r * 0.15, 0, r * 0.55, r * 0.3, A.white, A.dark);
    for (let i = 0; i < 5; i++) { const a = -1 + i * 0.5; glow(c, -r * 0.3 + Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.22, A.accent, 0.8); }
    rect(c, -r * 0.1, -r * 0.1, r * 0.3, r * 0.2, team);
    for (const y of [-0.5, 0.5]) glow(c, -r * 1.1, y * r, r * 0.3 + Math.sin(s.t * 15 + y) * 2, A.accent, 1);
    if (s.attacking) glow(c, r * 0.7, 0, r * 0.7, A.accent, 1);
  },
  hierophant(c, r, team, s) {
    for (let i = 0; i < 6; i++) {
      const a = s.t * 1.2 + (i / 6) * Math.PI * 2;
      poly(c, [Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2 - r * 0.15, Math.cos(a) * r * 1.2 + r * 0.1, Math.sin(a) * r * 1.2, Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2 + r * 0.15, Math.cos(a) * r * 1.2 - r * 0.1, Math.sin(a) * r * 1.2], A.accent);
    }
    circle(c, 0, 0, r * 0.95, undefined, 'rgba(94,240,255,0.5)', 2);
    poly(c, [r * 0.6, 0, r * 0.2, -r * 0.7, -r * 0.6, -r * 0.55, -r * 0.8, 0, -r * 0.6, r * 0.55, r * 0.2, r * 0.7], A.white, A.dark, 1.5);
    circle(c, 0, 0, r * 0.4, A.base, A.dark);
    circle(c, r * 0.05, 0, r * 0.2, team);
    glow(c, 0, 0, r * (0.9 + Math.sin(s.t * 3) * 0.15), A.accent, s.attacking ? 0.9 : 0.4);
  },
};

// ---------------------------------------------------------------- buildings
export interface BState { t: number; progress: number; built: boolean; working: boolean; powered: boolean; seed: number; larva?: number; eggs?: number; broodPulse?: boolean }

function bevelBox(c: Ctx, x: number, y: number, w: number, h: number, base: string, dark: string, light: string) {
  rect(c, x, y, w, h, base);
  c.fillStyle = light; c.fillRect(x, y, w, 3); c.fillRect(x, y, 3, h);
  c.fillStyle = dark; c.fillRect(x, y + h - 3, w, 3); c.fillRect(x + w - 3, y, 3, h);
}

function blob(c: Ctx, cx: number, cy: number, r: number, t: number, seed: number, fill: string, stroke: string, lumps = 9, amp = 0.1) {
  c.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rr = r * (1 + amp * Math.sin(a * lumps + seed) + 0.04 * Math.sin(t * 2 + a * 3 + seed));
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.closePath(); c.fillStyle = fill; c.fill(); c.strokeStyle = stroke; c.lineWidth = 2; c.stroke();
}

export function drawBuilding(c: Ctx, id: string, race: Race, x: number, y: number, size: number, team: string, s: BState) {
  const w = size * TILE, cx = x + w / 2, cy = y + w / 2;
  if (!s.built) {
    if (race === 'directorate') {
      c.globalAlpha = 0.35 + 0.65 * s.progress;
      drawBuildingBody(c, id, race, x, y, w, cx, cy, team, s);
      c.globalAlpha = 1;
      c.strokeStyle = '#ffb347'; c.lineWidth = 1.5;
      for (let i = 0; i <= size * 2; i++) { const p = x + (i / (size * 2)) * w; line(c, p, y, p, y + w, 'rgba(255,179,71,0.45)', 1); line(c, x, p - x + y, x + w, p - x + y, 'rgba(255,179,71,0.45)', 1); }
      rect(c, x + 2, y + w - (w - 4) * s.progress - 2, w - 4, (w - 4) * s.progress, 'rgba(255,200,100,0.12)');
      c.strokeRect(x + 1, y + 1, w - 2, w - 2);
    } else if (race === 'kyrrh') {
      const r = (w / 2) * (0.55 + 0.45 * s.progress);
      blob(c, cx, cy, r, s.t * 2, s.seed, '#5a2352', '#2a0f27', 7, 0.14);
      for (let i = 0; i < 5; i++) glow(c, cx + Math.cos(i * 1.3 + s.seed) * r * 0.5, cy + Math.sin(i * 1.3 + s.seed) * r * 0.5, r * 0.3, K.accent, 0.3 + 0.2 * Math.sin(s.t * 4 + i));
      ellipse(c, cx, cy, r * 0.4, r * 0.3, 'rgba(200,255,90,0.15)');
    } else {
      c.globalAlpha = 0.25 + 0.5 * s.progress;
      drawBuildingBody(c, id, race, x, y, w, cx, cy, team, s);
      c.globalAlpha = 1;
      glow(c, cx, cy, w * 0.7, A.accent, 0.35 + 0.15 * Math.sin(s.t * 6));
      c.setLineDash([4, 4]); c.lineDashOffset = -s.t * 20;
      c.strokeStyle = A.accent; c.lineWidth = 1.5; c.strokeRect(x + 2, y + 2, w - 4, w - 4); c.setLineDash([]);
    }
    return;
  }
  drawBuildingBody(c, id, race, x, y, w, cx, cy, team, s);
  if (race === 'aethel' && !s.powered && id !== 'core' && id !== 'obelisk' && id !== 'tap' && id !== 'radiantcore' && id !== 'exaltedcore') {
    rect(c, x, y, w, w, 'rgba(0,0,30,0.45)');
    c.fillStyle = '#ff5050'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillText('UNPOWERED', cx, cy + 4);
  }
}

function drawBuildingBody(c: Ctx, id: string, race: Race, x: number, y: number, w: number, cx: number, cy: number, team: string, s: BState) {
  const t = s.t;
  if (race === 'directorate') {
    const tier = id === 'citadel' ? 2 : id === 'stronghold' ? 3 : 1;
    switch (id) {
      case 'bastion': case 'citadel': case 'stronghold': {
        poly(c, [x + w * 0.15, y, x + w * 0.85, y, x + w, y + w * 0.15, x + w, y + w * 0.85, x + w * 0.85, y + w, x + w * 0.15, y + w, x, y + w * 0.85, x, y + w * 0.15], D.base, D.dark, 2);
        poly(c, [x + w * 0.2, y + w * 0.08, x + w * 0.8, y + w * 0.08, x + w * 0.92, y + w * 0.2, x + w * 0.92, y + w * 0.8, x + w * 0.8, y + w * 0.92, x + w * 0.2, y + w * 0.92, x + w * 0.08, y + w * 0.8, x + w * 0.08, y + w * 0.2], D.light);
        circle(c, cx, cy, w * 0.26, '#4a5561', D.dark, 2);
        circle(c, cx, cy, w * 0.19, undefined, D.accent, 2);
        c.fillStyle = D.accent; c.font = `bold ${w * 0.16}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', cx, cy + 1); c.textBaseline = 'alphabetic';
        rect(c, x + w * 0.08, y + w * 0.44, w * 0.1, w * 0.12, team); rect(c, x + w * 0.82, y + w * 0.44, w * 0.1, w * 0.12, team);
        for (let i = 0; i < 4; i++) { const on = Math.sin(t * 3 + i * 1.5) > 0; circle(c, [x + w * 0.15, x + w * 0.85][i % 2], [y + w * 0.15, y + w * 0.85][i >> 1], 3, on ? '#ff4040' : '#501010'); }
        if (tier >= 2) for (const [tx, ty] of [[0.2, 0.2], [0.8, 0.8]]) { circle(c, x + w * tx, y + w * ty, w * 0.1, D.dark, '#111', 2); rect(c, x + w * tx, y + w * ty - 2, w * 0.14, 4, '#222'); }
        if (tier >= 3) for (const [tx, ty] of [[0.8, 0.2], [0.2, 0.8]]) { circle(c, x + w * tx, y + w * ty, w * 0.1, D.dark, D.accent, 2); glow(c, x + w * tx, y + w * ty, w * 0.12, D.accent, 0.6); }
        if (s.working) glow(c, cx, cy, w * 0.2, D.glow, 0.3 + 0.2 * Math.sin(t * 8));
        break;
      }
      case 'habitat':
        bevelBox(c, x + 2, y + 2, w - 4, w - 4, D.base, D.dark, D.light);
        circle(c, cx, cy, w * 0.3, '#9fb0c0', D.dark, 2);
        ellipse(c, cx - w * 0.08, cy - w * 0.08, w * 0.12, w * 0.08, 'rgba(255,255,255,0.4)');
        rect(c, x + 4, y + 4, 5, 5, team);
        break;
      case 'extractor':
        bevelBox(c, x + 4, y + 4, w - 8, w - 8, D.base, D.dark, D.light);
        for (const [a, b] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) circle(c, x + w * a, y + w * b, w * 0.1, D.dark, '#111');
        circle(c, cx, cy, w * 0.18, '#284', '#0a3', 2);
        glow(c, cx, cy, w * 0.25, '#5dffa0', 0.4 + 0.2 * Math.sin(t * 4));
        rect(c, x + 6, cy - 3, 8, 6, team);
        break;
      case 'musterhall':
        bevelBox(c, x + 2, y + 2, w - 4, w - 4, D.base, D.dark, D.light);
        rect(c, x + w * 0.35, y + w * 0.78, w * 0.3, w * 0.2, '#22272d');
        for (let i = 0; i < 3; i++) rect(c, x + w * 0.15 + i * w * 0.25, y + w * 0.2, w * 0.18, w * 0.12, '#3b4a57');
        rect(c, x + w * 0.1, y + w * 0.45, w * 0.8, w * 0.1, team);
        if (s.working) glow(c, cx, y + w * 0.85, w * 0.2, D.glow, 0.6);
        break;
      case 'arsenal':
        bevelBox(c, x + 2, y + 2, w - 4, w - 4, D.dark, '#1b1f24', D.base);
        line(c, x + w * 0.2, y + w * 0.2, x + w * 0.8, y + w * 0.8, D.light, 5);
        line(c, x + w * 0.8, y + w * 0.2, x + w * 0.2, y + w * 0.8, D.light, 5);
        circle(c, cx, cy, w * 0.14, team, '#111');
        break;
      case 'turret': {
        circle(c, cx, cy, w * 0.45, D.dark, '#111', 2);
        c.save(); c.translate(cx, cy); c.rotate(s.seed + Math.sin(t * 0.4) * 0.3);
        rect(c, 0, -4, w * 0.55, 3, '#222'); rect(c, 0, 1, w * 0.55, 3, '#222');
        circle(c, 0, 0, w * 0.22, D.base, D.dark, 2); circle(c, 0, 0, w * 0.08, team);
        c.restore();
        break;
      }
      case 'foundry':
        bevelBox(c, x + 2, y + 2, w - 4, w - 4, D.base, D.dark, D.light);
        for (const sx of [0.25, 0.5]) { circle(c, x + w * sx, y + w * 0.22, w * 0.09, '#2d3238', '#111', 2); glow(c, x + w * sx, y + w * 0.22, w * 0.08, s.working ? '#ff7a1a' : '#552', 0.8); }
        rect(c, x + w * 0.62, y + w * 0.12, w * 0.25, w * 0.76, '#4b5663');
        for (let i = 0; i < 4; i++) line(c, x + w * 0.62, y + w * (0.2 + i * 0.18), x + w * 0.87, y + w * (0.2 + i * 0.18), D.dark, 2);
        rect(c, x + w * 0.1, y + w * 0.7, w * 0.4, w * 0.08, team);
        break;
      case 'skyport':
        bevelBox(c, x + 2, y + 2, w - 4, w - 4, D.base, D.dark, D.light);
        rect(c, x + w * 0.1, y + w * 0.4, w * 0.8, w * 0.2, '#2c3238');
        for (let i = 0; i < 5; i++) rect(c, x + w * (0.14 + i * 0.16), y + w * 0.49, w * 0.07, 2, (Math.floor(t * 4) % 5) === i ? '#ffe070' : '#665');
        circle(c, x + w * 0.78, y + w * 0.2, w * 0.1, '#9fe3ff', D.dark, 2);
        rect(c, x + w * 0.1, y + w * 0.12, w * 0.3, w * 0.08, team);
        break;
      case 'fusionworks':
        bevelBox(c, x + 2, y + 2, w - 4, w - 4, D.dark, '#15191d', D.base);
        circle(c, cx, cy, w * 0.33, '#2a3139', D.base, 3);
        c.save(); c.translate(cx, cy); c.rotate(t * 1.5);
        for (let i = 0; i < 3; i++) { c.rotate((Math.PI * 2) / 3); rect(c, w * 0.12, -3, w * 0.18, 6, D.base); }
        c.restore();
        glow(c, cx, cy, w * 0.28, '#7ad8ff', 0.8 + 0.2 * Math.sin(t * 5));
        circle(c, cx, cy, w * 0.08, '#e8fbff');
        rect(c, x + 5, y + 5, 7, 7, team);
        break;
      default:
        bevelBox(c, x + 2, y + 2, w - 4, w - 4, D.base, D.dark, D.light);
    }
  } else if (race === 'kyrrh') {
    const r = w / 2 - 2;
    switch (id) {
      case 'nest': case 'sanctum': case 'throne': {
        const tier = id === 'sanctum' ? 2 : id === 'throne' ? 3 : 1;
        blob(c, cx, cy, r, t, s.seed, K.dark, '#1d0a1b', 7, 0.08);
        blob(c, cx, cy, r * 0.8, t * 1.3, s.seed + 2, K.base, K.dark, 5, 0.1);
        for (let i = 0; i < 6 + tier * 3; i++) {
          const a = (i / (6 + tier * 3)) * Math.PI * 2 + s.seed;
          const len = tier >= 2 ? 0.35 : 0.2;
          poly(c, [cx + Math.cos(a - 0.1) * r * 0.75, cy + Math.sin(a - 0.1) * r * 0.75, cx + Math.cos(a) * r * (1 + len), cy + Math.sin(a) * r * (1 + len), cx + Math.cos(a + 0.1) * r * 0.75, cy + Math.sin(a + 0.1) * r * 0.75], K.bone, '#8a7d5a');
        }
        const open = 0.5 + 0.1 * Math.sin(t * 1.8);
        ellipse(c, cx, cy, r * 0.35, r * 0.35 * open, '#1a0418', K.light);
        glow(c, cx, cy, r * 0.4, tier === 3 ? '#ff5ae0' : K.accent, 0.5 + 0.2 * Math.sin(t * 2));
        if (tier >= 3) for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.35; poly(c, [cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75 - 6, cx + Math.cos(a + 0.12) * r * 0.45, cy + Math.sin(a + 0.12) * r * 0.45], '#ffd86a'); }
        circle(c, cx + r * 0.55, cy + r * 0.55, 5, team);
        // larva wriggle around the base
        for (let i = 0; i < Math.min(s.larva ?? 0, 19); i++) {
          const a = i * 2.39 + s.seed, rr = r * 1.05 + (i % 3) * 5;
          const lx = cx + Math.cos(a) * rr, ly = cy + Math.sin(a) * rr + Math.sin(t * 5 + i) * 1.2;
          ellipse(c, lx, ly, 4, 2.5, '#d8c79a', '#6a5a3a', a + Math.sin(t * 6 + i) * 0.4);
        }
        for (let i = 0; i < Math.min(s.eggs ?? 0, 19); i++) {
          const a = i * 2.39 + s.seed + 1.2, rr = r * 1.12;
          const ex = cx + Math.cos(a) * rr, ey = cy + Math.sin(a) * rr;
          ellipse(c, ex, ey, 5, 6, '#6a3a5e', '#2a1025');
          glow(c, ex, ey, 6, K.accent, 0.3 + 0.2 * Math.sin(t * 4 + i));
        }
        if (s.broodPulse) glow(c, cx, cy, r * 1.1, '#9dff5a', 0.25 + 0.15 * Math.sin(t * 6));
        break;
      }
      case 'siphon':
        blob(c, cx, cy, r * 0.9, t, s.seed, K.base, K.dark, 6, 0.12);
        circle(c, cx, cy, r * 0.4, '#1a3a24', '#0a1', 2);
        glow(c, cx, cy, r * 0.5, '#5dffa0', 0.5 + 0.2 * Math.sin(t * 3));
        circle(c, cx + r * 0.6, cy, 4, team);
        break;
      case 'mire':
        blob(c, cx, cy, r, t, s.seed, K.dark, '#1d0a1b', 6, 0.1);
        ellipse(c, cx, cy, r * 0.7, r * 0.55, '#3c6a1c', '#2a1');
        for (let i = 0; i < 5; i++) { const ph = (t * 0.8 + i * 0.37) % 1; circle(c, cx + Math.cos(i * 2.3) * r * 0.4, cy + Math.sin(i * 2.3) * r * 0.3, 2 + ph * 5, undefined, `rgba(200,255,90,${1 - ph})`, 1.5); }
        circle(c, cx + r * 0.7, cy + r * 0.5, 4, team);
        break;
      case 'mutagen':
        blob(c, cx, cy, r, t, s.seed, K.base, K.dark, 5, 0.1);
        for (let i = 0; i < 3; i++) { const a = t * 0.8 + (i * Math.PI * 2) / 3; circle(c, cx + Math.cos(a) * r * 0.4, cy + Math.sin(a) * r * 0.4, r * 0.18, K.light, K.dark); }
        glow(c, cx, cy, r * 0.35, K.accent, 0.7);
        circle(c, cx + r * 0.6, cy + r * 0.6, 4, team);
        break;
      case 'warren':
        blob(c, cx, cy, r, t, s.seed, K.dark, '#1d0a1b', 8, 0.1);
        for (let i = 0; i < 3; i++) ellipse(c, cx + (i - 1) * r * 0.5, cy + Math.sin(i) * r * 0.2, r * 0.22, r * 0.16, '#0c0208', '#3c6a1c');
        glow(c, cx, cy, r * 0.6, '#9dff5a', 0.25);
        circle(c, cx + r * 0.6, cy + r * 0.6, 4, team);
        break;
      case 'quillden':
        blob(c, cx, cy, r, t, s.seed, K.base, K.dark, 6, 0.1);
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; line(c, cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3, cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95, K.bone, 2.5); }
        circle(c, cx, cy, r * 0.28, K.dark, K.light);
        circle(c, cx + r * 0.7, cy + r * 0.6, 4, team);
        break;
      case 'aerie': case 'elderaerie': {
        const elder = id === 'elderaerie';
        blob(c, cx, cy, r * 0.6, t, s.seed, K.dark, '#1d0a1b', 5, 0.1);
        for (let i = 0; i < (elder ? 6 : 4); i++) { const a = (i / (elder ? 6 : 4)) * Math.PI * 2 + t * 0.2; poly(c, [cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3, cx + Math.cos(a + 0.35) * r * 1.0, cy + Math.sin(a + 0.35) * r * 1.0, cx + Math.cos(a + 0.6) * r * 0.5, cy + Math.sin(a + 0.6) * r * 0.5], elder ? '#7a2a6a' : K.base, K.dark); }
        circle(c, cx, cy, r * 0.3, K.light, K.dark, 2);
        glow(c, cx, cy, r * 0.45, elder ? '#ff5ae0' : K.accent, 0.6);
        circle(c, cx + r * 0.7, cy + r * 0.6, 4, team);
        break;
      }
      case 'cavern':
        blob(c, cx, cy, r, t, s.seed, '#2c0f28', '#12050f', 7, 0.12);
        ellipse(c, cx, cy, r * 0.55, r * 0.4, '#050103', K.base);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; poly(c, [cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.4, cx + Math.cos(a + 0.2) * r * 0.3, cy + Math.sin(a + 0.2) * r * 0.2, cx + Math.cos(a + 0.4) * r * 0.55, cy + Math.sin(a + 0.4) * r * 0.4], K.bone); }
        glow(c, cx, cy, r * 0.3, '#ff3a3a', 0.3 + 0.2 * Math.sin(t * 1.5));
        circle(c, cx + r * 0.7, cy + r * 0.6, 4, team);
        break;
      case 'thorn': {
        blob(c, cx, cy, r * 0.8, t, s.seed, K.base, K.dark, 5, 0.1);
        c.save(); c.translate(cx, cy); c.rotate(s.seed + Math.sin(t * 0.8) * 0.4);
        poly(c, [0, -r * 0.2, r * 1.15, 0, 0, r * 0.2], K.bone, '#8a7d5a');
        c.restore();
        circle(c, cx, cy, r * 0.3, K.light, K.dark);
        circle(c, cx - r * 0.4, cy + r * 0.4, 3, team);
        break;
      }
      default:
        blob(c, cx, cy, r, t, s.seed, K.base, K.dark);
    }
  } else {
    const r = w / 2 - 2;
    const plate = (sc = 1) => poly(c, [cx - r * 0.45 * sc, cy - r * sc, cx + r * 0.45 * sc, cy - r * sc, cx + r * sc, cy - r * 0.45 * sc, cx + r * sc, cy + r * 0.45 * sc, cx + r * 0.45 * sc, cy + r * sc, cx - r * 0.45 * sc, cy + r * sc, cx - r * sc, cy + r * 0.45 * sc, cx - r * sc, cy - r * 0.45 * sc], A.base, A.dark, 2);
    const crystal = (x0: number, y0: number, h: number, col = A.accent) => { poly(c, [x0, y0 - h, x0 + h * 0.35, y0, x0, y0 + h * 0.5, x0 - h * 0.35, y0], col, '#fff', 1); };
    switch (id) {
      case 'core': case 'radiantcore': case 'exaltedcore': {
        const tier = id === 'radiantcore' ? 2 : id === 'exaltedcore' ? 3 : 1;
        plate();
        plate(0.72);
        c.save(); c.translate(cx, cy); c.rotate(t * 0.5);
        circle(c, 0, 0, r * 0.62, undefined, A.accent, 2);
        for (let i = 0; i < 4 + tier * 2; i++) { const a = (i / (4 + tier * 2)) * Math.PI * 2; circle(c, Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, 3, A.white); }
        c.restore();
        glow(c, cx, cy, r * 0.55, A.accent, 0.6 + 0.2 * Math.sin(t * 2));
        crystal(cx, cy + r * 0.05, r * 0.5);
        if (tier >= 2) { crystal(cx - r * 0.45, cy + r * 0.3, r * 0.25); crystal(cx + r * 0.45, cy + r * 0.3, r * 0.25); }
        if (tier >= 3) { circle(c, cx, cy, r * 0.85, undefined, 'rgba(255,241,196,0.8)', 2); glow(c, cx, cy - r * 0.5, r * 0.3, '#fff1c4', 0.8); }
        rect(c, cx - r * 0.9, cy - 4, 8, 8, team);
        break;
      }
      case 'obelisk':
        circle(c, cx, cy, r * 0.8, A.dark, A.base, 2);
        crystal(cx, cy + r * 0.2, r * 0.95 + Math.sin(t * 2) * 2);
        glow(c, cx, cy, r * 0.9, A.accent, 0.5);
        rect(c, cx - 3, cy + r * 0.6, 6, 4, team);
        break;
      case 'tap':
        plate(0.9);
        circle(c, cx, cy, r * 0.4, '#15361f', A.accent, 2);
        glow(c, cx, cy, r * 0.5, '#5dffa0', 0.5 + 0.2 * Math.sin(t * 3));
        rect(c, cx + r * 0.6, cy - 3, 6, 6, team);
        break;
      case 'portal':
        plate();
        c.save(); c.translate(cx, cy); c.rotate(-t * 0.8);
        c.setLineDash([6, 5]); circle(c, 0, 0, r * 0.55, undefined, A.accent, 3); c.setLineDash([]);
        c.restore();
        glow(c, cx, cy, r * 0.5, s.working ? '#bafcff' : A.accent, s.working ? 0.9 : 0.4);
        rect(c, cx - r * 0.85, cy - 3, 6, 6, team);
        break;
      case 'resonance':
        plate();
        for (let i = 0; i < 3; i++) { const a = t + (i * Math.PI * 2) / 3; crystal(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.3); }
        glow(c, cx, cy, r * 0.4, A.accent, 0.5);
        rect(c, cx - r * 0.85, cy - 3, 6, 6, team);
        break;
      case 'crucible':
        plate();
        circle(c, cx, cy, r * 0.45, '#ffcf6a', A.dark, 2);
        glow(c, cx, cy, r * 0.5, '#ff9a3a', 0.6 + 0.2 * Math.sin(t * 4));
        rect(c, cx - r * 0.85, cy - 3, 6, 6, team);
        break;
      case 'spire':
        circle(c, cx, cy, r * 0.85, A.dark, A.base, 2);
        crystal(cx, cy + r * 0.2, r * 0.8);
        glow(c, cx, cy - r * 0.3, r * 0.4, A.accent, 0.8);
        rect(c, cx - 3, cy + r * 0.55, 6, 4, team);
        break;
      case 'makerforge':
        plate();
        rect(c, cx - r * 0.55, cy - r * 0.55, r * 1.1, r * 1.1, '#b8903e', A.dark);
        for (let i = 0; i < 3; i++) line(c, cx - r * 0.55, cy - r * 0.3 + i * r * 0.3, cx + r * 0.55, cy - r * 0.3 + i * r * 0.3, A.accent, 1.5);
        glow(c, cx, cy, r * 0.4, A.accent, s.working ? 0.9 : 0.3);
        rect(c, cx - r * 0.9, cy - 3, 6, 6, team);
        break;
      case 'skyforge':
        plate();
        poly(c, [cx + r * 0.7, cy, cx - r * 0.5, cy - r * 0.6, cx - r * 0.2, cy, cx - r * 0.5, cy + r * 0.6], A.white, A.dark);
        glow(c, cx, cy, r * 0.5, A.accent, 0.4 + 0.3 * Math.sin(t * 2));
        rect(c, cx - r * 0.9, cy - 3, 6, 6, team);
        break;
      case 'archive':
        plate();
        c.save(); c.translate(cx, cy);
        for (let k = 0; k < 2; k++) { c.rotate(t * (k ? -0.6 : 0.4)); poly(c, [0, -r * 0.7, r * 0.6, r * 0.35, -r * 0.6, r * 0.35], undefined, k ? A.accent : A.white, 2); }
        c.restore();
        glow(c, cx, cy, r * 0.45, '#b7a6ff', 0.8);
        crystal(cx, cy + 3, r * 0.35, '#d8ccff');
        rect(c, cx - r * 0.9, cy - 3, 6, 6, team);
        break;
      default:
        plate();
    }
  }
}

// ---------------------------------------------------------------- resources
export function drawMineral(c: Ctx, x: number, y: number, amount: number, seed: number, t: number) {
  const full = Math.min(1, amount / 1500);
  const n = 4 + Math.round(full * 3);
  for (let i = 0; i < n; i++) {
    const px = x + 6 + ((seed * 13 + i * 17) % 50) * (TILE * 2 - 12) / 50;
    const py = y + TILE * 0.2 + ((seed * 7 + i * 11) % 10) * 1.6;
    const h = 14 + ((seed + i * 5) % 9) + full * 6;
    const wv = 5 + ((seed + i) % 4);
    poly(c, [px, py + TILE * 0.8 - h, px + wv, py + TILE * 0.8 - h * 0.35, px + wv * 0.4, py + TILE * 0.8, px - wv * 0.8, py + TILE * 0.8, px - wv, py + TILE * 0.8 - h * 0.4], '#3fa6ff', '#bfe7ff');
    poly(c, [px, py + TILE * 0.8 - h, px + wv, py + TILE * 0.8 - h * 0.35, px, py + TILE * 0.8 - h * 0.25], '#9ad8ff');
  }
  glow(c, x + TILE, y + TILE * 0.5, TILE * 0.9, '#3fa6ff', 0.25 + 0.08 * Math.sin(t * 2 + seed));
}

export function drawGeyser(c: Ctx, x: number, y: number, t: number, amount: number) {
  const w = TILE * 3, cx = x + w / 2, cy = y + w / 2;
  circle(c, cx, cy, w * 0.45, '#2b2f2a', '#151815', 3);
  circle(c, cx, cy, w * 0.3, '#1c211c');
  if (amount > 0) {
    glow(c, cx, cy, w * 0.35, '#5dffa0', 0.5 + 0.2 * Math.sin(t * 2));
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.35 + i / 4) % 1;
      c.globalAlpha = (1 - ph) * 0.35;
      circle(c, cx + Math.sin(i * 3 + t) * 6, cy - ph * 30, 6 + ph * 14, '#9fe8b8');
      c.globalAlpha = 1;
    }
  }
}

export function drawIcon(c: Ctx, id: string, race: Race, size: number, team = '#3d9bff', kind: 'unit' | 'building' = 'unit') {
  c.save();
  if (kind === 'unit') {
    const art = UNIT_ART[id];
    c.translate(size / 2, size / 2);
    c.rotate(-Math.PI / 2);
    if (art) art(c, size * 0.34, team, { t: 0.4, moving: false, attacking: false, seed: 1 });
  } else {
    const sc = size / (3 * TILE);
    c.scale(sc, sc);
    drawBuilding(c, id, race, 0, 0, 3, team, { t: 0.5, progress: 1, built: true, working: false, powered: true, seed: 1 });
  }
  c.restore();
}
