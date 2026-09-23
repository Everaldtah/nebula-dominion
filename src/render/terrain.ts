import type { GameMap } from '../sim/map';
import { T_CHASM, T_GROUND, T_ROCK } from '../sim/map';
import { mulberry32 } from '../sim/util';
import { TILE } from './sprites';

const CHUNK = 16;

/** Lazily pre-renders terrain in 16x16-tile chunks. */
export class TerrainRenderer {
  private chunks = new Map<number, HTMLCanvasElement>();
  constructor(private map: GameMap) {}

  private t(x: number, y: number) {
    const m = this.map;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return T_ROCK;
    return m.terrain[y * m.w + x];
  }

  private build(cx: number, cy: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = cv.height = CHUNK * TILE;
    const c = cv.getContext('2d')!;
    const m = this.map;
    const rnd = mulberry32(m.seed * 1000 + cy * 97 + cx);
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const X = cx * CHUNK + tx, Y = cy * CHUNK + ty;
        const px = tx * TILE, py = ty * TILE;
        const kind = this.t(X, Y);
        const hgt = m.height[Math.min(m.h - 1, Y) * m.w + Math.min(m.w - 1, X)] ?? 0.5;
        if (kind === T_GROUND) {
          const l = 20 + hgt * 14;
          c.fillStyle = `hsl(${188 + hgt * 30}, 14%, ${l}%)`;
          c.fillRect(px, py, TILE, TILE);
          for (let k = 0; k < 7; k++) {
            c.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rnd() * 0.05})`;
            c.fillRect(px + rnd() * TILE, py + rnd() * TILE, 2 + rnd() * 5, 2 + rnd() * 5);
          }
          if (rnd() < 0.05) { // pebbles
            c.fillStyle = 'rgba(30,38,40,0.8)';
            c.beginPath(); c.ellipse(px + rnd() * TILE, py + rnd() * TILE, 2 + rnd() * 3, 1.5 + rnd() * 2, rnd() * 3, 0, Math.PI * 2); c.fill();
          }
          if (rnd() < 0.03) { // crack
            c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; c.beginPath();
            let x = px + rnd() * TILE, y = py + rnd() * TILE; c.moveTo(x, y);
            for (let s = 0; s < 4; s++) { x += (rnd() - 0.5) * 14; y += (rnd() - 0.5) * 14; c.lineTo(x, y); }
            c.stroke();
          }
          if (rnd() < 0.02) { // alien moss glow
            const g = c.createRadialGradient(px + 16, py + 16, 0, px + 16, py + 16, 18);
            g.addColorStop(0, 'rgba(90,200,170,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = g; c.fillRect(px - 4, py - 4, TILE + 8, TILE + 8);
          }
        } else if (kind === T_ROCK) {
          const l = 30 + hgt * 12;
          c.fillStyle = `hsl(${25 + hgt * 20}, 16%, ${l}%)`;
          c.fillRect(px, py, TILE, TILE);
          for (let k = 0; k < 5; k++) {
            c.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
            c.beginPath();
            const bx = px + rnd() * TILE, by = py + rnd() * TILE;
            c.moveTo(bx, by); c.lineTo(bx + 6 + rnd() * 6, by + rnd() * 4); c.lineTo(bx + rnd() * 5, by + 6 + rnd() * 6); c.fill();
          }
          // cliff edges: bright top/left rim, dark drop below
          if (this.t(X, Y - 1) !== T_ROCK) { c.fillStyle = 'rgba(255,230,200,0.28)'; c.fillRect(px, py, TILE, 4); }
          if (this.t(X - 1, Y) !== T_ROCK) { c.fillStyle = 'rgba(255,230,200,0.15)'; c.fillRect(px, py, 3, TILE); }
          if (this.t(X, Y + 1) !== T_ROCK) { c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(px, py + TILE - 7, TILE, 7); }
          if (this.t(X + 1, Y) !== T_ROCK) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(px + TILE - 4, py, 4, TILE); }
        } else if (kind === T_CHASM) {
          c.fillStyle = '#05070d';
          c.fillRect(px, py, TILE, TILE);
          for (let k = 0; k < 3; k++) {
            if (rnd() < 0.5) { c.fillStyle = `rgba(${150 + rnd() * 100},${150 + rnd() * 100},255,${0.3 + rnd() * 0.6})`; c.fillRect(px + rnd() * TILE, py + rnd() * TILE, 1.2, 1.2); }
          }
          const edge = (dx: number, dy: number) => this.t(X + dx, Y + dy) === T_GROUND;
          c.fillStyle = 'rgba(80,160,255,0.22)';
          if (edge(0, -1)) c.fillRect(px, py, TILE, 3);
          if (edge(0, 1)) c.fillRect(px, py + TILE - 3, TILE, 3);
          if (edge(-1, 0)) c.fillRect(px, py, 3, TILE);
          if (edge(1, 0)) c.fillRect(px + TILE - 3, py, 3, TILE);
        }
        // shadow cast by rocks onto ground below/right
        if (kind === T_GROUND && this.t(X, Y - 1) === T_ROCK) { const g = c.createLinearGradient(0, py, 0, py + 12); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px, py, TILE, 12); }
        if (kind === T_GROUND && this.t(X, Y - 1) === T_CHASM) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(px, py, TILE, 3); }
      }
    return cv;
  }

  draw(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
    const cx0 = Math.max(0, Math.floor(x0 / (CHUNK * TILE))), cy0 = Math.max(0, Math.floor(y0 / (CHUNK * TILE)));
    const nC = Math.ceil(this.map.w / CHUNK);
    const cx1 = Math.min(nC - 1, Math.floor(x1 / (CHUNK * TILE))), cy1 = Math.min(nC - 1, Math.floor(y1 / (CHUNK * TILE)));
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = cy * 1000 + cx;
        let ch = this.chunks.get(k);
        if (!ch) { ch = this.build(cx, cy); this.chunks.set(k, ch); }
        c.drawImage(ch, cx * CHUNK * TILE, cy * CHUNK * TILE);
      }
  }

  /** Small overview image for the minimap. */
  minimapImage(size: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d')!;
    const m = this.map;
    const img = c.createImageData(m.w, m.h);
    for (let i = 0; i < m.w * m.h; i++) {
      const k = m.terrain[i], h = m.height[i];
      const [r, g, b] = k === T_GROUND ? [45 + h * 30, 62 + h * 30, 66 + h * 30] : k === T_ROCK ? [95 + h * 30, 80 + h * 20, 66] : [6, 8, 16];
      img.data.set([r, g, b, 255], i * 4);
    }
    const tmp = document.createElement('canvas'); tmp.width = m.w; tmp.height = m.h;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(tmp, 0, 0, size, size);
    return cv;
  }
}
