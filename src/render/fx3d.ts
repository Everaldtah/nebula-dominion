import * as THREE from 'three';
import type { GameEvent } from '../sim/game';
import type { Camera } from './renderer2d';
import { TILE } from './sprites';

const MAX_P = 9000;

const VERT = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
varying float vAlpha;
varying vec3 vColor;
uniform float uZoom;
void main() {
  vAlpha = alpha;
  vColor = pcolor;
  gl_PointSize = size * uZoom;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * (0.6 + a), a * vAlpha);
}`;

interface Proj { x1: number; y1: number; x2: number; y2: number; t: number; dur: number; arc: number; color: THREE.Color; size: number; trail: string | null; impact: string; pi: number; spin?: boolean }
interface Timed { mesh: THREE.Object3D; t: number; dur: number; kind: 'ring' | 'beam' | 'pillar' | 'shield' | 'flash'; s0: number; s1: number; a0: number }
interface Debris { mesh: THREE.Mesh; vx: number; vy: number; vz: number; z: number; rx: number; ry: number; t: number; dur: number; bx: number; by: number }

const COL = (h: string) => new THREE.Color(h);

export class FX3D {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  shake = 0;
  /** 0..1 particle budget multiplier (software-rendering fallback uses fewer). */
  quality = 1;
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX_P * 3);
  private col = new Float32Array(MAX_P * 3);
  private size = new Float32Array(MAX_P);
  private alpha = new Float32Array(MAX_P);
  private vel = new Float32Array(MAX_P * 3);
  private life = new Float32Array(MAX_P);
  private maxLife = new Float32Array(MAX_P);
  private baseSize = new Float32Array(MAX_P);
  private grow = new Float32Array(MAX_P);
  private grav = new Float32Array(MAX_P);
  private drag = new Float32Array(MAX_P);
  private baseY = new Float32Array(MAX_P);
  private z = new Float32Array(MAX_P);
  private next = 0;
  private active = new Int32Array(MAX_P);
  private isActive = new Uint8Array(MAX_P);
  private nActive = 0;
  private pool = new Map<string, THREE.Mesh[]>();
  private mat: THREE.ShaderMaterial;
  private projs: Proj[] = [];
  private timed: Timed[] = [];
  private debris: Debris[] = [];
  private delayed: { t: number; fn: () => void }[] = [];
  private debrisGeo: Record<string, THREE.BufferGeometry>;
  private debrisMat: Record<string, THREE.MeshStandardMaterial>;
  private ringGeo = new THREE.RingGeometry(0.8, 1, 48);
  private planeGeo = new THREE.PlaneGeometry(1, 1);
  private cylGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
  private sphereGeo = new THREE.IcosahedronGeometry(1, 1);

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uZoom: { value: 1 } } });
    const pts = new THREE.Points(this.geo, this.mat);
    pts.frustumCulled = false;
    pts.renderOrder = 10;
    this.scene.add(pts);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(-1, 1.5, 2); this.scene.add(dl);
    this.debrisGeo = {
      directorate: new THREE.BoxGeometry(1, 0.6, 0.4),
      kyrrh: new THREE.IcosahedronGeometry(0.6, 0),
      aethel: new THREE.TetrahedronGeometry(0.8, 0),
    };
    this.debrisMat = {
      directorate: new THREE.MeshStandardMaterial({ color: 0x7d8a96, metalness: 0.7, roughness: 0.4, emissive: 0x331100 }),
      kyrrh: new THREE.MeshStandardMaterial({ color: 0x7a3a70, metalness: 0.1, roughness: 0.6, emissive: 0x220a20 }),
      aethel: new THREE.MeshStandardMaterial({ color: 0xd9b45a, metalness: 0.9, roughness: 0.25, emissive: 0x114455 }),
    };
  }

  resize(w: number, h: number) { this.renderer.setSize(w, h, false); }

  // --------------------------------------------------------------- particles
  private emit(x: number, y: number, vx: number, vy: number, color: THREE.Color, size: number, life: number, opts: { grow?: number; grav?: number; drag?: number; vz?: number; z?: number; alpha?: number } = {}) {
    const i = this.next; this.next = (this.next + 1) % MAX_P;
    if (!this.isActive[i]) { this.isActive[i] = 1; this.active[this.nActive++] = i; }
    this.pos[i * 3] = x; this.baseY[i] = -y; this.pos[i * 3 + 2] = 5;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = -vy; this.vel[i * 3 + 2] = opts.vz ?? 0;
    this.z[i] = opts.z ?? 0;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.size[i] = this.baseSize[i] = size;
    this.alpha[i] = opts.alpha ?? 1;
    this.life[i] = this.maxLife[i] = life;
    this.grow[i] = opts.grow ?? 0;
    this.grav[i] = opts.grav ?? 0;
    this.drag[i] = opts.drag ?? 0.9;
    this.pos[i * 3 + 1] = this.baseY[i] + this.z[i];
    return i;
  }

  burst(x: number, y: number, n: number, colors: string[], speed: number, size: number, life: number, opts: { grav?: number; up?: number; grow?: number; drag?: number } = {}) {
    n = Math.max(1, Math.round(n * this.quality));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s * 0.7, COL(colors[k % colors.length]), size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6),
        { grav: opts.grav ?? 0, vz: (opts.up ?? 0) * (0.5 + Math.random()), grow: opts.grow ?? 0, drag: opts.drag ?? 0.92 });
    }
  }

  private take(kind: string, geo: THREE.BufferGeometry, color: string, opacity: number, wire = false): THREE.Mesh {
    const list = this.pool.get(kind);
    let m = list?.pop();
    if (!m) {
      m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: wire }));
      m.userData.kind = kind;
      this.scene.add(m);
    }
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.set(color); mat.opacity = opacity;
    m.visible = true;
    m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    return m;
  }
  private release(m: THREE.Object3D) {
    m.visible = false;
    const k = m.userData.kind as string;
    if (!this.pool.has(k)) this.pool.set(k, []);
    this.pool.get(k)!.push(m as THREE.Mesh);
  }

  private ring(x: number, y: number, color: string, r0: number, r1: number, dur: number, a0 = 0.9) {
    const m = this.take('ring', this.ringGeo, color, a0);
    m.position.set(x, -y, 4);
    m.scale.set(r0, r0 * 0.7, 1);
    this.timed.push({ mesh: m, t: 0, dur, kind: 'ring', s0: r0, s1: r1, a0 });
  }

  beam(x1: number, y1: number, x2: number, y2: number, color: string, width: number, dur: number, a0 = 1) {
    const m = this.take('beam', this.planeGeo, color, a0);
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    m.position.set((x1 + x2) / 2, -(y1 + y2) / 2, 6);
    m.rotation.z = -Math.atan2(dy, dx);
    m.scale.set(L, width, 1);
    this.timed.push({ mesh: m, t: 0, dur, kind: 'beam', s0: width, s1: width * 0.2, a0 });
    // glow core
    this.emit(x2, y2, 0, 0, COL(color), width * 5, dur * 1.5, { alpha: 0.8 });
  }

  private pillar(x: number, y: number, color: string, r: number, h: number, dur: number) {
    const m = this.take('pillar', this.cylGeo, color, 0.6);
    m.position.set(x, -y + h / 2, 3);
    m.scale.set(r, h, r);
    m.rotation.x = 0.35;
    this.timed.push({ mesh: m, t: 0, dur, kind: 'pillar', s0: r, s1: r * 0.2, a0: 0.6 });
  }

  private shieldFlash(x: number, y: number, r: number) {
    const m = this.take('shield', this.sphereGeo, '#66ccff', 0.8, true);
    m.position.set(x, -y, 8);
    m.scale.setScalar(r);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.timed.push({ mesh: m, t: 0, dur: 0.3, kind: 'shield', s0: r, s1: r * 1.15, a0: 0.8 });
  }

  private flash(x: number, y: number, color: string, r: number, dur: number) {
    this.emit(x, y, 0, 0, COL(color), r, dur, { grow: r * 2, alpha: 0.9 });
  }

  private spawnDebris(x: number, y: number, race: string, n: number, force: number, scale: number) {
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(this.debrisGeo[race] ?? this.debrisGeo.directorate, this.debrisMat[race] ?? this.debrisMat.directorate);
      const s = scale * (0.5 + Math.random() * 0.8);
      m.scale.setScalar(s);
      m.position.set(x, -y, 10);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = force * (0.4 + Math.random() * 0.8);
      this.debris.push({ mesh: m, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: force * (0.8 + Math.random()), z: 0, rx: (Math.random() - 0.5) * 14, ry: (Math.random() - 0.5) * 14, t: 0, dur: 0.9 + Math.random() * 0.6, bx: x, by: y });
    }
  }

  private shoot(x1: number, y1: number, x2: number, y2: number, dur: number, color: string, size: number, arc: number, trail: string | null, impact: string, spin = false) {
    const pi = this.emit(x1, y1, 0, 0, COL(color), size, dur + 0.05, { alpha: 1 });
    this.projs.push({ x1, y1, x2, y2, t: 0, dur, arc, color: COL(color), size, trail, impact, pi, spin });
  }

  private impact(kind: string, x: number, y: number) {
    switch (kind) {
      case 'spark': this.burst(x, y, 5, ['#fff3a0', '#ffb347'], 90, 5, 0.18); break;
      case 'shell': this.burst(x, y, 10, ['#ffcf6a', '#ff7a1a', '#555'], 110, 8, 0.35, { up: 40, grav: 150 }); this.flash(x, y, '#ffb347', 14, 0.12); break;
      case 'artillery':
        this.burst(x, y, 26, ['#ffe07a', '#ff7a1a', '#ff3a1a'], 200, 12, 0.5, { up: 80, grav: 200 });
        this.burst(x, y, 10, ['#444', '#333'], 60, 22, 1.0, { grow: 20, drag: 0.95 });
        this.ring(x, y, '#ffb347', 8, 60, 0.35);
        this.shake = Math.max(this.shake, 3);
        break;
      case 'missile': this.burst(x, y, 12, ['#ffe07a', '#ff7a1a'], 130, 8, 0.3); this.burst(x, y, 4, ['#555'], 40, 16, 0.7, { grow: 14 }); break;
      case 'acid': this.burst(x, y, 12, ['#c8ff5a', '#6bff3a', '#3a8a1a'], 90, 7, 0.45, { up: 60, grav: 220 }); break;
      case 'bolt': this.burst(x, y, 8, ['#bafcff', '#5ef0ff'], 90, 6, 0.25); this.flash(x, y, '#5ef0ff', 12, 0.12); break;
      case 'glaive': this.burst(x, y, 6, ['#ff7ae0', '#c8ff5a'], 80, 6, 0.25); break;
      case 'spine': this.burst(x, y, 5, ['#e8dcb8', '#c8ff5a'], 70, 5, 0.2); break;
      case 'thorn': this.burst(x, y, 10, ['#e8dcb8', '#8a7d5a', '#c8ff5a'], 110, 7, 0.35, { up: 40, grav: 180 }); break;
      case 'claw': this.burst(x, y, 5, ['#ff5a8a', '#b56aa6'], 70, 5, 0.2); break;
    }
  }

  // --------------------------------------------------------------- events
  handle(ev: GameEvent, visible: (x: number, y: number) => boolean) {
    switch (ev.t) {
      case 'shot': {
        if (!visible(ev.x1, ev.y1) && !visible(ev.x2, ev.y2)) return;
        const x1 = ev.x1 * TILE, y1 = ev.y1 * TILE - (ev.unit === 'wasp' || ev.unit === 'dreadnought' || ev.unit === 'wyvern' || ev.unit === 'radiant' || ev.unit === 'empyrean' || ev.unit === 'gravemaw' ? 12 : 0);
        const x2 = ev.x2 * TILE + (Math.random() - 0.5) * 8, y2 = ev.y2 * TILE - (ev.air ? 12 : 0) + (Math.random() - 0.5) * 8;
        switch (ev.proj) {
          case 'bullet': this.beam(x1, y1, x2, y2, '#ffe07a', 1.6, 0.06); this.impact('spark', x2, y2); break;
          case 'laser': this.beam(x1, y1, x2, y2, '#ff4040', 2.2, 0.08); this.impact('spark', x2, y2); break;
          case 'shell': this.shoot(x1, y1, x2, y2, 0.14, '#ffcf6a', 7, 0, null, 'shell'); break;
          case 'artillery': this.shoot(x1, y1, x2, y2, 0.55, '#ffe07a', 10, 90, '#777', 'artillery'); this.flash(x1, y1, '#ffcf6a', 26, 0.15); break;
          case 'missile':
            this.shoot(x1, y1 - 8, x2, y2, 0.32, '#ffae40', 6, 20, '#888', 'missile');
            this.delayed.push({ t: 0.12, fn: () => this.shoot(x1, y1 + 8, x2, y2, 0.32, '#ffae40', 6, 20, '#888', 'missile') });
            break;
          case 'flame': {
            const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
            for (let k = 0; k < 18; k++) {
              const sp = L * (2.2 + Math.random()), sd = (Math.random() - 0.5) * 0.35;
              this.emit(x1, y1, (dx / L) * sp - (dy / L) * sp * sd, (dy / L) * sp + (dx / L) * sp * sd, COL(['#ffd27a', '#ff7a1a', '#ff3a1a'][k % 3]), 10 + Math.random() * 8, 0.35 + Math.random() * 0.15, { grow: 30, drag: 0.93 });
            }
            break;
          }
          case 'acid': this.shoot(x1, y1, x2, y2, 0.32, '#9dff5a', ev.unit === 'gravemaw' ? 14 : 9, ev.unit === 'gravemaw' ? 80 : 35, '#4a8a1a', 'acid'); break;
          case 'spine': this.shoot(x1, y1, x2, y2, 0.15, '#e8dcb8', 5, 8, null, 'spine'); break;
          case 'glaive': this.shoot(x1, y1, x2, y2, 0.2, '#ff7ae0', 8, 0, '#c8ff5a', 'glaive', true); break;
          case 'thorn': this.shoot(x1, y1, x2, y2, 0.22, '#e8dcb8', 9, 10, null, 'thorn'); break;
          case 'bolt': this.shoot(x1, y1, x2, y2, 0.2, '#5ef0ff', ev.unit === 'empyrean' ? 12 : 8, 0, '#5ef0ff', 'bolt'); break;
          case 'beam': {
            const c = ev.unit === 'strider' ? '#ff9a3a' : ev.unit === 'hierophant' ? '#bafcff' : '#5ef0ff';
            this.beam(x1, y1, x2, y2, c, ev.unit === 'radiant' ? 4 : 3, 0.14);
            this.impact('bolt', x2, y2);
            if (ev.unit === 'hierophant') this.ring(x2, y2, '#bafcff', 6, 50, 0.3);
            break;
          }
          case 'melee': case 'claw': this.impact(ev.race === 'aethel' ? 'bolt' : ev.race === 'kyrrh' ? 'claw' : 'spark', x2, y2); break;
        }
        break;
      }
      case 'hit':
        if (ev.shield && visible(ev.x, ev.y) && Math.random() < 0.5) this.shieldFlash(ev.x * TILE, ev.y * TILE, 14);
        break;
      case 'death': {
        if (!visible(ev.x, ev.y)) return;
        const x = ev.x * TILE, y = ev.y * TILE - (ev.air ? 12 : 0);
        const big = ev.building ? ev.radius * 1.4 : ev.radius;
        const r = big * TILE;
        if (ev.race === 'directorate' || ev.unit === 'mineral') {
          this.burst(x, y, Math.round(20 + r), ['#fff3a0', '#ffb347', '#ff7a1a', '#ff3a1a'], 80 + r * 4, 10 + r * 0.25, 0.6, { up: 60, grav: 90 });
          this.burst(x, y, Math.round(6 + r * 0.3), ['#3a3a3a', '#555'], 40 + r, 20 + r * 0.4, 1.4, { grow: 25, drag: 0.96, up: 20 });
          this.spawnDebris(x, y, 'directorate', Math.round(3 + big * 4), 120 + r * 3, 4 + big * 3);
          this.ring(x, y, '#ffb347', 6, r * 2.5 + 20, 0.4);
        } else if (ev.race === 'kyrrh') {
          this.burst(x, y, Math.round(18 + r), ['#b56aa6', '#7a3a70', '#c8ff5a', '#ff5a8a'], 70 + r * 3, 9 + r * 0.2, 0.7, { up: 80, grav: 260 });
          this.spawnDebris(x, y, 'kyrrh', Math.round(3 + big * 3), 100 + r * 2, 4 + big * 3);
          this.ring(x, y, '#9dff5a', 5, r * 2 + 15, 0.35, 0.6);
        } else {
          this.burst(x, y, Math.round(20 + r), ['#bafcff', '#5ef0ff', '#fff1c4', '#d9b45a'], 90 + r * 4, 8 + r * 0.2, 0.6, { up: 40, grav: 60 });
          this.spawnDebris(x, y, 'aethel', Math.round(3 + big * 4), 130 + r * 3, 4 + big * 3);
          this.ring(x, y, '#5ef0ff', 6, r * 2.6 + 20, 0.45);
          this.flash(x, y, '#bafcff', r + 10, 0.2);
        }
        if (ev.building) {
          for (let k = 1; k < 5; k++) this.delayed.push({ t: k * 0.16, fn: () => this.burst(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r * 1.6, 16, ev.race === 'aethel' ? ['#5ef0ff', '#fff1c4'] : ev.race === 'kyrrh' ? ['#b56aa6', '#c8ff5a'] : ['#ffb347', '#ff3a1a'], 150, 14, 0.6, { up: 80, grav: 120 }) });
          this.shake = Math.max(this.shake, 4 + big * 1.5);
        } else if (big >= 1) this.shake = Math.max(this.shake, 2 + big);
        break;
      }
      case 'spawn':
        if (!visible(ev.x, ev.y)) return;
        if (ev.race === 'aethel') { this.pillar(ev.x * TILE, ev.y * TILE, '#5ef0ff', 12, 50, 0.45); this.burst(ev.x * TILE, ev.y * TILE, 10, ['#bafcff'], 60, 5, 0.4); }
        else if (ev.race === 'kyrrh') this.burst(ev.x * TILE, ev.y * TILE, 12, ['#9dff5a', '#b56aa6'], 70, 6, 0.4, { up: 50, grav: 200 });
        else this.burst(ev.x * TILE, ev.y * TILE, 6, ['#999'], 40, 10, 0.5, { grow: 12 });
        break;
      case 'buildStart':
        if (!visible(ev.x, ev.y)) return;
        if (ev.race === 'aethel') { this.pillar(ev.x * TILE, ev.y * TILE, '#5ef0ff', ev.size * TILE * 0.45, ev.size * TILE * 2, 1.0); this.ring(ev.x * TILE, ev.y * TILE, '#5ef0ff', 5, ev.size * TILE, 0.6); }
        else if (ev.race === 'kyrrh') this.burst(ev.x * TILE, ev.y * TILE, 30, ['#7a3a70', '#9dff5a'], 100, 9, 0.6, { up: 60, grav: 200 });
        else this.burst(ev.x * TILE, ev.y * TILE, 16, ['#8a8a8a', '#666'], 70, 16, 0.8, { grow: 20 });
        break;
      case 'buildDone':
        if (!visible(ev.x, ev.y)) return;
        this.ring(ev.x * TILE, ev.y * TILE, ev.race === 'aethel' ? '#5ef0ff' : ev.race === 'kyrrh' ? '#9dff5a' : '#ffb347', 10, ev.size * TILE * 1.1, 0.6);
        this.burst(ev.x * TILE, ev.y * TILE, 20, ev.race === 'aethel' ? ['#fff1c4', '#5ef0ff'] : ev.race === 'kyrrh' ? ['#c8ff5a', '#b56aa6'] : ['#ffe07a', '#fff'], 90, 6, 0.6, { up: 60 });
        break;
      case 'ability': {
        if (!visible(ev.x, ev.y)) return;
        const x = ev.x * TILE, y = ev.y * TILE;
        switch (ev.ability) {
          case 'siege': case 'unsiege': this.ring(x, y, '#c9b28a', 8, 50, 0.5, 0.6); this.burst(x, y, 12, ['#8a7a60'], 60, 14, 0.7, { grow: 12 }); break;
          case 'overdrive': this.burst(x, y, 10, ['#ff3030', '#ffb347'], 50, 7, 0.4, { up: 30 }); break;
          case 'phase':
            this.flash(x, y, '#5ef0ff', 20, 0.25); this.flash(ev.x2! * TILE, ev.y2! * TILE, '#bafcff', 24, 0.3);
            this.beam(x, y, ev.x2! * TILE, ev.y2! * TILE, '#5ef0ff', 3, 0.2, 0.5);
            this.burst(ev.x2! * TILE, ev.y2! * TILE, 14, ['#bafcff', '#5ef0ff'], 80, 5, 0.35);
            break;
          case 'lanceCharge': for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, d = 40 + Math.random() * 20; this.emit(x + Math.cos(a) * d, y - 12 + Math.sin(a) * d, -Math.cos(a) * d * 1.8, -Math.sin(a) * d * 1.8, COL('#ffd24a'), 6, 0.5); } break;
          case 'solarlance': {
            const x2 = ev.x2! * TILE, y2 = ev.y2! * TILE;
            this.beam(x, y - 12, x2, y2, '#fff1a0', 14, 0.45); this.beam(x, y - 12, x2, y2, '#ffb347', 30, 0.35, 0.5);
            this.impact('artillery', x2, y2); this.ring(x2, y2, '#fff1a0', 10, 90, 0.5); this.shake = Math.max(this.shake, 7);
            break;
          }
          case 'spawnbrood': for (let k = 0; k < 24; k++) { const a = (k / 24) * 6.28; this.emit(x + Math.cos(a) * 60, y + Math.sin(a) * 50, -Math.sin(a) * 60, Math.cos(a) * 60, COL('#9dff5a'), 8, 0.9, { drag: 0.97 }); } break;
          case 'broodDone': this.burst(x, y, 30, ['#9dff5a', '#e8dcb8', '#b56aa6'], 120, 8, 0.6, { up: 60, grav: 200 }); break;
        }
        break;
      }
    }
  }

  // --------------------------------------------------------------- frame
  render(cam: Camera, dt: number) {
    dt = Math.min(dt, 0.05);
    const W = cam.w / cam.zoom, H = cam.h / cam.zoom;
    let sx = 0, sy = 0;
    if (this.shake > 0.05) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; this.shake *= Math.pow(0.02, dt); } else this.shake = 0;
    this.camera.left = cam.x + sx; this.camera.right = cam.x + W + sx;
    this.camera.top = -cam.y + sy; this.camera.bottom = -(cam.y + H) + sy;
    this.camera.updateProjectionMatrix();
    this.mat.uniforms.uZoom.value = cam.zoom * this.renderer.getPixelRatio();

    for (let i = this.delayed.length - 1; i >= 0; i--) { const d = this.delayed[i]; d.t -= dt; if (d.t <= 0) { this.delayed.splice(i, 1); d.fn(); } }

    // projectiles
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const x = p.x1 + (p.x2 - p.x1) * k, yy = p.y1 + (p.y2 - p.y1) * k;
      const lift = Math.sin(k * Math.PI) * p.arc;
      const pi = p.pi;
      this.pos[pi * 3] = x; this.baseY[pi] = -yy; this.z[pi] = lift; this.vel[pi * 3] = this.vel[pi * 3 + 1] = this.vel[pi * 3 + 2] = 0;
      this.size[pi] = p.size * (1 + lift / 120);
      this.life[pi] = Math.max(this.life[pi], 0.05);
      if (p.trail && Math.random() < 0.8) this.emit(x, yy - lift, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, COL(p.trail), p.size * 0.9, 0.3, { grow: 6, alpha: 0.5 });
      if (k >= 1) { this.projs.splice(i, 1); this.life[pi] = 0.001; this.impact(p.impact, p.x2, p.y2); }
    }

    // particles
    for (let k = this.nActive - 1; k >= 0; k--) {
      const i = this.active[k];
      if (this.life[i] <= 0) {
        this.alpha[i] = 0; this.size[i] = 0; this.isActive[i] = 0;
        this.active[k] = this.active[--this.nActive];
        continue;
      }
      this.life[i] -= dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.baseY[i] += this.vel[i * 3 + 1] * dt;
      this.vel[i * 3 + 2] -= this.grav[i] * dt;
      this.z[i] = Math.max(0, this.z[i] + this.vel[i * 3 + 2] * dt);
      this.pos[i * 3 + 1] = this.baseY[i] + this.z[i];
      this.size[i] = Math.max(0, this.size[i] + this.grow[i] * dt);
      this.alpha[i] = f;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.pcolor as THREE.BufferAttribute).needsUpdate = true;

    // timed meshes
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const m = this.timed[i];
      m.t += dt;
      const k = m.t / m.dur;
      const mat = (m.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (k >= 1) { this.release(m.mesh); this.timed.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - k, 3);
      if (m.kind === 'ring') { const s = m.s0 + (m.s1 - m.s0) * e; m.mesh.scale.set(s, s * 0.7, 1); mat.opacity = m.a0 * (1 - k); }
      else if (m.kind === 'beam') { m.mesh.scale.y = m.s0 + (m.s1 - m.s0) * k; mat.opacity = m.a0 * (1 - k); }
      else if (m.kind === 'pillar') { m.mesh.scale.x = m.mesh.scale.z = m.s0 + (m.s1 - m.s0) * k; m.mesh.rotation.y += dt * 4; mat.opacity = m.a0 * (1 - k); }
      else if (m.kind === 'shield') { m.mesh.scale.setScalar(m.s0 + (m.s1 - m.s0) * k); m.mesh.rotation.y += dt * 3; mat.opacity = m.a0 * (1 - k); }
    }
    // debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      d.vz -= 520 * dt;
      d.z += d.vz * dt;
      if (d.z < 0) { d.z = 0; d.vz *= -0.35; d.vx *= 0.6; d.vy *= 0.6; }
      d.bx += d.vx * dt; d.by += d.vy * dt;
      d.mesh.position.set(d.bx, -d.by + d.z, 10);
      d.mesh.rotation.x += d.rx * dt; d.mesh.rotation.y += d.ry * dt;
      const k = d.t / d.dur;
      if (k > 0.7) d.mesh.scale.multiplyScalar(0.9);
      if (k >= 1) { this.scene.remove(d.mesh); this.debris.splice(i, 1); }
    }
    this.renderer.render(this.scene, this.camera);
  }

  clear() {
    for (const m of this.timed) this.release(m.mesh);
    for (const d of this.debris) this.scene.remove(d.mesh);
    this.timed = []; this.debris = []; this.projs = []; this.delayed = [];
    this.life.fill(0); this.alpha.fill(0); this.size.fill(0); this.isActive.fill(0); this.nActive = 0;
  }
}
