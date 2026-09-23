import type { GameMap } from '../sim/map';
import { T_CHASM, T_GROUND, T_ROCK } from '../sim/map';
import { mulberry32 } from '../sim/util';
import { TILE } from './sprites';

const CHUNK = 16;
const NS = 256; // noise texture size

/** Realistic lit height-field terrain, pre-rendered into 16x16-tile chunks. */
export class TerrainRenderer {
  private chunks = new Map<number, HTMLCanvasElement | ImageBitmap>();
  private hgrid: Float32Array; // smoothed elevation per tile corner-ish sample
  private noiseA: Float32Array; // tileable fine noise
  private noiseB: Float32Array; // tileable coarse noise
  constructor(private map: GameMap) {
    const { w, h } = map;
    // raw elevation per tile: rock plateau +1, ground 0, chasm -1
    const raw = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) raw[i] = map.terrain[i] === T_ROCK ? 1 : map.terrain[i] === T_CHASM ? -1 : 0;
    // one-tile blur -> slopes about a tile wide
    this.hgrid = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy));
          const k = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          s += raw[yy * w + xx] * k; n += k;
        }
        this.hgrid[y * w + x] = s / n;
      }
    const rnd = mulberry32(map.seed * 31 + 5);
    this.noiseA = tileNoise(rnd, 8);
    this.noiseB = tileNoise(rnd, 3);
  }

  private h(fx: number, fy: number) {
    // bilinear sample of tile elevation at fractional tile coords (tile centres at +0.5)
    const m = this.map, w = m.w, hh = m.h;
    const x = Math.min(w - 1.001, Math.max(0, fx - 0.5)), y = Math.min(hh - 1.001, Math.max(0, fy - 0.5));
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const g = this.hgrid;
    const a = g[iy * w + ix], b = g[iy * w + ix + 1], c = g[(iy + 1) * w + ix], d = g[(iy + 1) * w + ix + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  private build(cx: number, cy: number): HTMLCanvasElement {
    const P = TILE; // px per tile
    const W = CHUNK * P;
    const cv = document.createElement('canvas');
    cv.width = cv.height = W;
    const c = cv.getContext('2d')!;
    const img = c.createImageData(W, W);
    const d = img.data;
    // elevation with detail, one pixel margin for normals
    const E = W + 2;
    const hf = new Float32Array(E * E);
    const ox = cx * CHUNK, oy = cy * CHUNK;
    for (let py = 0; py < E; py++)
      for (let px = 0; px < E; px++) {
        const fx = ox + (px - 1 + 0.5) / P, fy = oy + (py - 1 + 0.5) / P;
        let e = this.h(fx, fy);
        // sharpen plateau edges into cliffs
        const rock = smooth(0.25, 0.7, e), pit = smooth(-0.25, -0.7, e);
        e = rock * 1.0 - pit * 1.2 + e * 0.15;
        const na = this.noiseA[((Math.floor(fx * 24) % NS) + NS) % NS * NS + ((Math.floor(fy * 24) % NS) + NS) % NS];
        const nb = this.noiseB[((Math.floor(fx * 6) % NS) + NS) % NS * NS + ((Math.floor(fy * 6) % NS) + NS) % NS];
        e += (na - 0.5) * 0.05 + (nb - 0.5) * 0.12 * (0.4 + rock);
        hf[py * E + px] = e;
      }
    const L = norm3(-0.55, -0.6, 0.58); // sun from the upper-left
    for (let py = 0; py < W; py++)
      for (let px = 0; px < W; px++) {
        const i = (py + 1) * E + (px + 1);
        const e = hf[i];
        const dx = (hf[i + 1] - hf[i - 1]) * P * 0.5, dy = (hf[i + E] - hf[i - E]) * P * 0.5;
        const n = norm3(-dx * 0.9, -dy * 0.9, 1);
        let lit = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
        lit = 0.42 + Math.max(0, lit) * 0.75;
        const slope = Math.min(1, Math.hypot(dx, dy) * 0.9);
        const fx = ox + (px + 0.5) / P, fy = oy + (py + 0.5) / P;
        const nA = this.noiseA[((Math.floor(fx * 40) % NS) + NS) % NS * NS + ((Math.floor(fy * 40) % NS) + NS) % NS];
        const nB = this.noiseB[((Math.floor(fx * 2) % NS) + NS) % NS * NS + ((Math.floor(fy * 2) % NS) + NS) % NS];
        let r: number, g: number, b: number;
        if (e > 0.45) {
          // plateau rock: warm grey with strata
          const strata = 0.5 + 0.5 * Math.sin(e * 22 + nB * 6);
          r = 104 + strata * 18 + nA * 20; g = 92 + strata * 14 + nA * 16; b = 80 + strata * 8 + nA * 12;
        } else if (e < -0.45) {
          // chasm: near-black void with blue depth haze
          const depth = Math.min(1, (-e - 0.45) * 2);
          r = 16 - depth * 10 + nA * 6; g = 20 - depth * 10 + nA * 8; b = 34 - depth * 14 + nA * 14;
        } else {
          // ground: dusty teal-grey mixed with sand patches
          const sand = smooth(0.45, 0.75, nB);
          r = 70 + sand * 40 + nA * 22; g = 84 + sand * 26 + nA * 20; b = 84 + sand * 4 + nA * 16;
          if (nA > 0.82 && nB < 0.4) { r -= 12; g += 8; b += 6; } // sparse moss
        }
        // cliff faces: darker, streaked
        if (slope > 0.25) {
          const f = Math.min(1, (slope - 0.25) * 1.6);
          const streak = 0.75 + 0.25 * Math.sin(fx * 60 + nA * 3);
          r = r * (1 - f) + 78 * streak * f; g = g * (1 - f) + 66 * streak * f; b = b * (1 - f) + 58 * streak * f;
        }
        // chasm rim glow
        if (e < -0.2 && e > -0.6) { const gl = 1 - Math.abs(e + 0.4) / 0.2; if (gl > 0) { g += gl * 30; b += gl * 60; } }
        const o = (py * W + px) * 4;
        d[o] = clamp255(r * lit); d[o + 1] = clamp255(g * lit); d[o + 2] = clamp255(b * lit); d[o + 3] = 255;
      }
    c.putImageData(img, 0, 0);
    // scattered pebbles / debris with contact shadows
    const rnd = mulberry32(this.map.seed * 1000 + cy * 97 + cx);
    for (let k = 0; k < 90; k++) {
      const x = rnd() * W, y = rnd() * W;
      const t = this.map.terrain[Math.min(this.map.h - 1, oy + Math.floor(y / P)) * this.map.w + Math.min(this.map.w - 1, ox + Math.floor(x / P))];
      if (t !== T_GROUND) continue;
      const s = 1.5 + rnd() * 3.5;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x + 1.5, y + 1.5, s, s * 0.7, 0, 0, Math.PI * 2); c.fill();
      const v = 90 + rnd() * 50;
      c.fillStyle = `rgb(${v},${v - 6},${v - 12})`; c.beginPath(); c.ellipse(x, y, s, s * 0.7, rnd() * 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.ellipse(x - s * 0.3, y - s * 0.3, s * 0.4, s * 0.3, 0, 0, Math.PI * 2); c.fill();
    }
    return cv;
  }

  /** Build every chunk up front (call during loading) so scrolling never hitches. */
  async prebuild(onProgress?: (f: number) => void) {
    const n = Math.ceil(this.map.w / CHUNK);
    let done = 0;
    for (let cy = 0; cy < n; cy++)
      for (let cx = 0; cx < n; cx++) {
        const k = cy * 1000 + cx;
        if (!this.chunks.has(k)) {
          const cv = this.build(cx, cy);
          let bmp: HTMLCanvasElement | ImageBitmap = cv;
          try { bmp = await createImageBitmap(cv); } catch { /* keep canvas */ }
          this.chunks.set(k, bmp);
        }
        onProgress?.(++done / (n * n));
        if (done % 4 === 0) await new Promise(r => setTimeout(r, 0));
      }
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

  minimapImage(size: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d')!;
    const m = this.map;
    const img = c.createImageData(m.w, m.h);
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x;
        const e = this.hgrid[i];
        const shade = 1 + (this.hgrid[i] - (this.hgrid[Math.max(0, i - m.w - 1)] ?? e)) * 0.8;
        const k = m.terrain[i];
        const [r, g, b] = k === T_GROUND ? [74, 88, 86] : k === T_ROCK ? [112, 98, 84] : [12, 16, 28];
        img.data.set([clamp255(r * shade), clamp255(g * shade), clamp255(b * shade), 255], i * 4);
      }
    const tmp = document.createElement('canvas'); tmp.width = m.w; tmp.height = m.h;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    c.imageSmoothingEnabled = true;
    c.drawImage(tmp, 0, 0, size, size);
    return cv;
  }
}

function tileNoise(rnd: () => number, octaves: number) {
  // value noise summed over octaves on a tileable grid
  const out = new Float32Array(NS * NS);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const g = 4 << o;
    const grid = new Float32Array(g * g).map(() => rnd());
    for (let y = 0; y < NS; y++)
      for (let x = 0; x < NS; x++) {
        const fx = (x / NS) * g, fy = (y / NS) * g;
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
        const a = grid[(iy % g) * g + (ix % g)], b = grid[(iy % g) * g + ((ix + 1) % g)];
        const c = grid[((iy + 1) % g) * g + (ix % g)], d = grid[((iy + 1) % g) * g + ((ix + 1) % g)];
        out[y * NS + x] += ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) * amp;
      }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
const sm = (t: number) => t * t * (3 - 2 * t);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
function norm3(x: number, y: number, z: number): [number, number, number] { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }
