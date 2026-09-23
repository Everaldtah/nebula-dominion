// Sprite atlas: pre-rendered 3D sprite sheets (AI-generated models rendered in Blender).
// Sheet layout: columns = facing directions (0 = east, clockwise), rows = team x animation frame.
import { TILE } from './sprites';

export interface SheetMeta {
  id: string; cell: number; anchor: [number, number]; ppt: number; dirs: number; frames: number;
  teams: string[]; height: number; air: number; anim: string;
}
interface Sheet { meta: SheetMeta; img: HTMLImageElement | ImageBitmap; turn?: HTMLImageElement | ImageBitmap }

const BASE = (import.meta as any).env?.BASE_URL ?? '/';

class Atlas {
  sheets = new Map<string, Sheet>();
  loaded = 0;
  total = 0;
  ready = false;
  private listeners: (() => void)[] = [];

  async load(onProgress?: (f: number) => void) {
    let manifest: Record<string, SheetMeta> = {};
    try {
      const r = await fetch(`${BASE}sprites/manifest.json`, { cache: 'no-cache' });
      if (r.ok) manifest = await r.json();
    } catch { /* no sprites: procedural fallback */ }
    const ids = Object.keys(manifest);
    this.total = ids.length * 2;
    const loadImg = (src: string) => new Promise<HTMLImageElement | null>(res => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
    await Promise.all(ids.map(async id => {
      const [img, turn] = await Promise.all([loadImg(`${BASE}sprites/${id}.png`), loadImg(`${BASE}sprites/${id}_turn.png`)]);
      this.loaded += 2;
      onProgress?.(this.loaded / Math.max(1, this.total));
      if (!img) return;
      let bmp: HTMLImageElement | ImageBitmap = img;
      try { bmp = await createImageBitmap(img); } catch { /* keep element */ }
      this.sheets.set(id, { meta: manifest[id], img: bmp, turn: turn ?? undefined });
    }));
    this.ready = true;
    this.listeners.forEach(f => f());
  }
  onReady(f: () => void) { if (this.ready) f(); else this.listeners.push(f); }
  has(id: string) { return this.sheets.has(id); }
  meta(id: string) { return this.sheets.get(id)?.meta; }

  /** Draw a sprite so that its ground centre lands on world pixel (x, y). Returns false if missing. */
  draw(c: CanvasRenderingContext2D, id: string, x: number, y: number, facing: number, frame: number, team: number, alpha = 1, clipBottomFrac = 1): boolean {
    const s = this.sheets.get(id);
    if (!s) return false;
    const m = s.meta;
    let dir = 0;
    if (m.dirs > 1) {
      const a = ((facing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      dir = Math.round(a / (Math.PI * 2 / m.dirs)) % m.dirs;
    }
    const row = (Math.min(team, m.teams.length - 1)) * m.frames + (((frame % m.frames) + m.frames) % m.frames);
    const k = TILE / m.ppt;
    const w = m.cell * k;
    if (alpha !== 1) c.globalAlpha *= alpha;
    if (clipBottomFrac < 1) {
      // construction: reveal from the ground up
      const visH = m.cell * clipBottomFrac + (m.cell - m.anchor[1]);
      const sy0 = Math.max(0, m.cell - visH);
      c.drawImage(s.img, dir * m.cell, row * m.cell + sy0, m.cell, m.cell - sy0, x - m.anchor[0] * k, y - m.anchor[1] * k + sy0 * k, w, (m.cell - sy0) * k);
    } else {
      c.drawImage(s.img, dir * m.cell, row * m.cell, m.cell, m.cell, x - m.anchor[0] * k, y - m.anchor[1] * k, w, w);
    }
    if (alpha !== 1) c.globalAlpha /= alpha;
    return true;
  }

  /** Paint the turntable frame i (0..23) into a 2D canvas (HUD portrait). */
  drawTurn(c: CanvasRenderingContext2D, id: string, i: number, size: number): boolean {
    const s = this.sheets.get(id);
    if (!s?.turn) return false;
    const f = ((Math.floor(i) % 24) + 24) % 24;
    c.drawImage(s.turn, f * 128, 0, 128, 128, 0, 0, size, size);
    return true;
  }

  /** Static icon (facing south-east) into a square canvas. */
  icon(c: CanvasRenderingContext2D, id: string, size: number, team = 0): boolean {
    const s = this.sheets.get(id);
    if (!s) return false;
    const m = s.meta;
    const dir = m.dirs > 1 ? Math.round(m.dirs * 0.125) % m.dirs : 0;
    const row = Math.min(team, m.teams.length - 1) * m.frames;
    c.drawImage(s.img, dir * m.cell, row * m.cell, m.cell, m.cell, 0, 0, size, size);
    return true;
  }
}

export const atlas = new Atlas();
