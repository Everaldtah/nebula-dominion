/** Grid A* with octile heuristic, binary heap and generation stamps (no per-call allocations). */
export interface Pt { x: number; y: number }

export class Pathfinder {
  private g: Float32Array;
  private f: Float32Array;
  private parent: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private gen = 1;
  private heap: Int32Array;
  private heapSize = 0;
  constructor(public w: number, public h: number, public blocked: (i: number) => boolean) {
    const n = w * h;
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Int32Array(n * 2);
  }

  private push(i: number) {
    let k = this.heapSize++;
    const h = this.heap, f = this.f;
    h[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (f[h[p]] <= f[h[k]]) break;
      const t = h[p]; h[p] = h[k]; h[k] = t; k = p;
    }
  }
  private pop(): number {
    const h = this.heap, f = this.f;
    const top = h[0];
    h[0] = h[--this.heapSize];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < this.heapSize && f[h[l]] < f[h[m]]) m = l;
      if (r < this.heapSize && f[h[r]] < f[h[m]]) m = r;
      if (m === k) break;
      const t = h[m]; h[m] = h[k]; h[k] = t; k = m;
    }
    return top;
  }

  isFree(tx: number, ty: number) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h && !this.blocked(ty * this.w + tx);
  }

  nearestFree(tx: number, ty: number, maxR = 12, fromX?: number, fromY?: number): Pt | null {
    if (this.isFree(tx, ty)) return { x: tx, y: ty };
    let best: Pt | null = null, bestD = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx, y = ty + dy;
          if (!this.isFree(x, y)) continue;
          let d = dx * dx + dy * dy;
          if (fromX !== undefined) d += 0.02 * ((x - fromX!) ** 2 + (y - fromY!) ** 2);
          if (d < bestD) { bestD = d; best = { x, y }; }
        }
      if (best) return best;
    }
    return null;
  }

  /** Returns world-space waypoints (tile centres, smoothed), or null. Partial path if goal unreachable. */
  find(sx: number, sy: number, gx: number, gy: number, maxNodes = 9000): Pt[] | null {
    const w = this.w;
    let stx = Math.floor(sx), sty = Math.floor(sy);
    let gtx = Math.floor(gx), gty = Math.floor(gy);
    const s = this.nearestFree(stx, sty, 4);
    if (!s) return null;
    stx = s.x; sty = s.y;
    const gFree = this.nearestFree(gtx, gty, 14, stx, sty);
    if (!gFree) return null;
    const exactGoal = gFree.x === gtx && gFree.y === gty;
    gtx = gFree.x; gty = gFree.y;
    const start = sty * w + stx, goal = gty * w + gtx;
    if (start === goal) return [{ x: exactGoal ? gx : gtx + 0.5, y: exactGoal ? gy : gty + 0.5 }];

    this.gen++;
    const gen = this.gen;
    const heur = (i: number) => {
      const dx = Math.abs((i % w) - gtx), dy = Math.abs(((i / w) | 0) - gty);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    this.heapSize = 0;
    this.g[start] = 0; this.f[start] = heur(start); this.stamp[start] = gen; this.parent[start] = -1;
    this.push(start);
    let best = start, bestH = heur(start), expanded = 0;
    let found = false;
    while (this.heapSize > 0) {
      const cur = this.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) { found = true; best = cur; break; }
      const hc = this.f[cur] - this.g[cur];
      if (hc < bestH) { bestH = hc; best = cur; }
      if (++expanded > maxNodes) break;
      const cx = cur % w, cy = (cur / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.isFree(nx, ny)) continue;
          if (dx && dy && (!this.isFree(cx + dx, cy) || !this.isFree(cx, cy + dy))) continue;
          const ni = ny * w + nx;
          if (this.closed[ni] === gen) continue;
          const ng = this.g[cur] + (dx && dy ? Math.SQRT2 : 1);
          if (this.stamp[ni] !== gen || ng < this.g[ni]) {
            this.stamp[ni] = gen; this.g[ni] = ng; this.f[ni] = ng + heur(ni); this.parent[ni] = cur;
            this.push(ni);
          }
        }
    }
    const tiles: Pt[] = [];
    for (let i = best; i !== -1; i = this.parent[i]) tiles.push({ x: (i % w) + 0.5, y: ((i / w) | 0) + 0.5 });
    tiles.reverse();
    if (found && exactGoal) tiles[tiles.length - 1] = { x: gx, y: gy };
    return this.smooth({ x: sx, y: sy }, tiles);
  }

  lineClear(ax: number, ay: number, bx: number, by: number, pad = 0.3): boolean {
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(len / 0.25);
    const nx = len ? -(by - ay) / len : 0, ny = len ? (bx - ax) / len : 0;
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (!this.isFree(Math.floor(x), Math.floor(y))) return false;
      if (pad && (!this.isFree(Math.floor(x + nx * pad), Math.floor(y + ny * pad)) || !this.isFree(Math.floor(x - nx * pad), Math.floor(y - ny * pad)))) return false;
    }
    return true;
  }

  private smooth(from: Pt, tiles: Pt[]): Pt[] {
    const out: Pt[] = [];
    let anchor = from;
    let i = 0;
    while (i < tiles.length) {
      let far = i;
      for (let j = tiles.length - 1; j > i; j--) {
        if (this.lineClear(anchor.x, anchor.y, tiles[j].x, tiles[j].y)) { far = j; break; }
      }
      out.push(tiles[far]);
      anchor = tiles[far];
      i = far + 1;
    }
    return out;
  }
}

/** Dijkstra distance fields toward a goal tile, cached and shared by every unit heading there. */
export class FlowFields {
  private cache = new Map<number, { dist: Float32Array; version: number; tick: number; used: number }>();
  private heap: Int32Array;
  private heapSize = 0;
  private cur!: Float32Array;
  constructor(private pf: Pathfinder, private maxEntries = 40) {
    this.heap = new Int32Array(pf.w * pf.h * 4);
  }
  get(gtx: number, gty: number, version: number, tick: number): Float32Array | null {
    const g = this.pf.nearestFree(gtx, gty, 14);
    if (!g) return null;
    const key = g.y * this.pf.w + g.x;
    const hit = this.cache.get(key);
    if (hit && (hit.version === version || tick - hit.tick < 40)) { hit.used = tick; return hit.dist; }
    const dist = hit?.dist ?? new Float32Array(this.pf.w * this.pf.h);
    this.compute(key, dist);
    this.cache.set(key, { dist, version, tick, used: tick });
    if (this.cache.size > this.maxEntries) {
      let oldK = -1, oldU = Infinity;
      for (const [k, v] of this.cache) if (v.used < oldU) { oldU = v.used; oldK = k; }
      this.cache.delete(oldK);
    }
    return dist;
  }
  private push(i: number) {
    const h = this.heap, f = this.cur;
    let k = this.heapSize++;
    h[k] = i;
    while (k > 0) { const p = (k - 1) >> 1; if (f[h[p]] <= f[h[k]]) break; const t = h[p]; h[p] = h[k]; h[k] = t; k = p; }
  }
  private pop() {
    const h = this.heap, f = this.cur;
    const top = h[0];
    h[0] = h[--this.heapSize];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1; let m = k;
      if (l < this.heapSize && f[h[l]] < f[h[m]]) m = l;
      if (r < this.heapSize && f[h[r]] < f[h[m]]) m = r;
      if (m === k) break;
      const t = h[m]; h[m] = h[k]; h[k] = t; k = m;
    }
    return top;
  }
  private compute(goal: number, dist: Float32Array) {
    const { w } = this.pf;
    dist.fill(Infinity);
    this.cur = dist;
    this.heapSize = 0;
    dist[goal] = 0;
    this.push(goal);
    while (this.heapSize > 0) {
      const c = this.pop();
      const cx = c % w, cy = (c / w) | 0, dc = dist[c];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.pf.isFree(nx, ny)) continue;
          if (dx && dy && (!this.pf.isFree(cx + dx, cy) || !this.pf.isFree(cx, cy + dy))) continue;
          const ni = ny * w + nx;
          const nd = dc + (dx && dy ? Math.SQRT2 : 1);
          if (nd < dist[ni]) { dist[ni] = nd; if (this.heapSize < this.heap.length) this.push(ni); }
        }
    }
  }
  /** Walk downhill from (x,y) and return the farthest point (≤ steps) in straight line of sight. */
  steer(dist: Float32Array, x: number, y: number, pad: number, steps = 10): Pt | null {
    const { w } = this.pf;
    let cx = Math.floor(x), cy = Math.floor(y);
    if (!this.pf.isFree(cx, cy)) { const n = this.pf.nearestFree(cx, cy, 3); if (!n) return null; cx = n.x; cy = n.y; }
    if (!isFinite(dist[cy * w + cx])) return null;
    let best: Pt | null = null;
    for (let s = 0; s < steps; s++) {
      let bi = -1, bd = dist[cy * w + cx];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.pf.isFree(nx, ny)) continue;
          if (dx && dy && (!this.pf.isFree(cx + dx, cy) || !this.pf.isFree(cx, cy + dy))) continue;
          const d = dist[ny * w + nx];
          if (d < bd) { bd = d; bi = ny * w + nx; }
        }
      if (bi < 0) break;
      cx = bi % w; cy = (bi / w) | 0;
      const p = { x: cx + 0.5, y: cy + 0.5 };
      if (!best || this.pf.lineClear(x, y, p.x, p.y, pad)) best = p;
      else break;
      if (bd === 0) break;
    }
    return best;
  }
}
