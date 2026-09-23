export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Spatial hash for fast neighbour queries. Cells of CELL tiles. */
export class SpatialHash<T extends { x: number; y: number }> {
  readonly cell = 4;
  private cols: number;
  private rows: number;
  private buckets: T[][];
  constructor(w: number, h: number) {
    this.cols = Math.ceil(w / this.cell) + 1;
    this.rows = Math.ceil(h / this.cell) + 1;
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }
  clear() { for (const b of this.buckets) b.length = 0; }
  insert(e: T) {
    const cx = clamp(Math.floor(e.x / this.cell), 0, this.cols - 1);
    const cy = clamp(Math.floor(e.y / this.cell), 0, this.rows - 1);
    this.buckets[cy * this.cols + cx].push(e);
  }
  query(x: number, y: number, r: number, out: T[] = []): T[] {
    out.length = 0;
    const x0 = clamp(Math.floor((x - r) / this.cell), 0, this.cols - 1);
    const x1 = clamp(Math.floor((x + r) / this.cell), 0, this.cols - 1);
    const y0 = clamp(Math.floor((y - r) / this.cell), 0, this.rows - 1);
    const y1 = clamp(Math.floor((y + r) / this.cell), 0, this.rows - 1);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.buckets[cy * this.cols + cx];
        for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    return out;
  }
}
