import { mulberry32 } from './util';

export const T_GROUND = 0;
export const T_ROCK = 1;
export const T_CHASM = 2;

export interface ResourceSpot { kind: 'mineral' | 'geyser'; tx: number; ty: number; w: number; h: number; amount: number; rich?: boolean }
export interface BaseSpot { x: number; y: number }

export interface GameMap {
  w: number;
  h: number;
  seed: number;
  terrain: Uint8Array; // T_*
  height: Float32Array; // visual only 0..1
  bases: BaseSpot[];
  starts: number[]; // base index for each start location
  resources: ResourceSpot[];
}

function valueNoise(seed: number, w: number, h: number, scale: number) {
  const rnd = mulberry32(seed);
  const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
  const grid = new Float32Array(gw * gh).map(() => rnd());
  const out = new Float32Array(w * h);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx = x / scale, gy = y / scale;
      const ix = Math.floor(gx), iy = Math.floor(gy);
      const fx = sm(gx - ix), fy = sm(gy - iy);
      const a = grid[iy * gw + ix], b = grid[iy * gw + ix + 1];
      const c = grid[(iy + 1) * gw + ix], d = grid[(iy + 1) * gw + ix + 1];
      out[y * w + x] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    }
  return out;
}

/** Generates a point-symmetric 1v1 map. Deterministic for a seed. */
export function generateMap(seed = 1337, size = 128): GameMap {
  const w = size, h = size;
  const n1 = valueNoise(seed, w, h, 14);
  const n2 = valueNoise(seed + 7, w, h, 6);
  const n3 = valueNoise(seed + 13, w, h, 22);
  const terrain = new Uint8Array(w * h);
  const height = new Float32Array(w * h);
  const field = (x: number, y: number) => n1[y * w + x] * 0.7 + n2[y * w + x] * 0.3;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const mx = w - 1 - x, my = h - 1 - y;
      const v = (field(x, y) + field(mx, my)) / 2;
      const hv = (n3[y * w + x] + n3[my * w + mx]) / 2;
      height[y * w + x] = hv;
      let t = T_GROUND;
      if (v > 0.62) t = T_ROCK;
      else if (v < 0.30) t = T_CHASM;
      if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) t = T_ROCK;
      terrain[y * w + x] = t;
    }

  const s = size / 128;
  const half: BaseSpot[] = [
    { x: 19.5, y: 108.5 },  // main
    { x: 20.5, y: 83.5 },   // natural
    { x: 45.5, y: 110.5 },  // third
    { x: 47.5, y: 85.5 },   // inner
    { x: 21.5, y: 58.5 },   // flank
  ].map(b => ({ x: b.x * s, y: b.y * s }));
  const bases: BaseSpot[] = [];
  for (const b of half) bases.push(b, { x: w - b.x, y: h - b.y });
  const starts = [0, 1];

  const carve = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) {
          terrain[y * w + x] = T_GROUND;
          terrain[(h - 1 - y) * w + (w - 1 - x)] = T_GROUND;
        }
      }
  };
  const carveLine = (ax: number, ay: number, bx: number, by: number, r: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    for (let i = 0; i <= len; i += 0.5) carve(ax + ((bx - ax) * i) / len, ay + ((by - ay) * i) / len, r);
  };
  const C = { x: w / 2, y: h / 2 };
  for (const b of bases) carve(b.x, b.y, 12.5);
  // lanes: main->nat->center, main->third, nat->inner, third->inner, inner->center, flank links
  const [m, n, t, i, f] = [0, 2, 4, 6, 8].map(k => bases[k]);
  carveLine(m.x, m.y, n.x, n.y, 3.5);
  carveLine(m.x, m.y, t.x, t.y, 3);
  carveLine(n.x, n.y, i.x, i.y, 3.5);
  carveLine(t.x, t.y, i.x, i.y, 3.5);
  carveLine(i.x, i.y, C.x, C.y, 4);
  carveLine(n.x, n.y, f.x, f.y, 3.5);
  carveLine(f.x, f.y, C.x, C.y, 3.5);
  carveLine(t.x, t.y, w - f.x, h - f.y, 3);
  carve(C.x, C.y, 8);

  // resources
  const resources: ResourceSpot[] = [];
  const occ = new Uint8Array(w * h);
  const free = (tx: number, ty: number, rw: number, rh: number, pad = 0) => {
    for (let y = ty - pad; y < ty + rh + pad; y++)
      for (let x = tx - pad; x < tx + rw + pad; x++) {
        if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) return false;
        if (occ[y * w + x]) return false;
      }
    return true;
  };
  const mark = (tx: number, ty: number, rw: number, rh: number) => {
    for (let y = ty; y < ty + rh; y++) for (let x = tx; x < tx + rw; x++) occ[y * w + x] = 1;
  };
  const placeRes = (spot: ResourceSpot) => {
    resources.push(spot);
    mark(spot.tx, spot.ty, spot.w, spot.h);
  };
  // reserve town hall footprints
  for (const b of bases) mark(Math.round(b.x - 2.5) - 3, Math.round(b.y - 2.5) - 3, 11, 11);
  for (let bi = 0; bi < half.length; bi++) {
    const b = bases[bi * 2];
    let dx = b.x - C.x, dy = b.y - C.y;
    const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    const ang0 = Math.atan2(dy, dx);
    const mine: ResourceSpot[] = [];
    for (let k = 0; k < 8; k++) {
      const a = ang0 + (-70 + k * 20) * (Math.PI / 180);
      for (let rad = 6.8 + (k % 2) * 0.9; rad < 12; rad += 0.5) {
        const px = b.x + Math.cos(a) * rad, py = b.y + Math.sin(a) * rad;
        const tx = Math.round(px - 1), ty = Math.round(py - 0.5);
        if (free(tx, ty, 2, 1)) {
          const spot: ResourceSpot = { kind: 'mineral', tx, ty, w: 2, h: 1, amount: k % 3 === 1 ? 900 : 1800 };
          placeRes(spot); mine.push(spot); break;
        }
      }
    }
    for (const side of [-1, 1]) {
      const a = ang0 + side * 108 * (Math.PI / 180);
      for (let rad = 7.5; rad < 13; rad += 0.5) {
        const px = b.x + Math.cos(a) * rad, py = b.y + Math.sin(a) * rad;
        const tx = Math.round(px - 1.5), ty = Math.round(py - 1.5);
        if (free(tx, ty, 3, 3, 1)) {
          const spot: ResourceSpot = { kind: 'geyser', tx, ty, w: 3, h: 3, amount: 2250 };
          placeRes(spot); mine.push(spot); break;
        }
      }
    }
    // mirror
    for (const sp of mine) {
      const mirror: ResourceSpot = { ...sp, tx: w - sp.tx - sp.w, ty: h - sp.ty - sp.h };
      placeRes(mirror);
    }
  }
  // make sure resource tiles and a margin around them are ground
  for (const r of resources)
    for (let y = r.ty - 1; y < r.ty + r.h + 1; y++)
      for (let x = r.tx - 1; x < r.tx + r.w + 1; x++)
        if (x >= 2 && y >= 2 && x < w - 2 && y < h - 2) terrain[y * w + x] = T_GROUND;

  return { w, h, seed, terrain, height, bases, starts, resources };
}
