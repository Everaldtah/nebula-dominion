// Procedural PBR 3D models for every unit, building, resource and prop.
// Used by the sprite baker (16-direction sprite sheets), the HUD portrait and the menu.
// Convention: 1 world unit = 1 map tile. +X = forward, +Y = up, ground at y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface ModelInst {
  root: THREE.Group;
  /** phase: 0..1 animation cycle (walk / idle loop). */
  pose: (phase: number) => void;
  air?: number; // hover altitude (tiles) for flyers
}
type Builder = (k: Kit, team: THREE.Material, variant?: string) => ModelInst;

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ textures
function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat = 1, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function panelTexture(base: string, line: string, seed: number) {
  return canvasTex(256, (c, s) => {
    const r = rng(seed);
    c.fillStyle = base; c.fillRect(0, 0, s, s);
    // grime noise
    for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`; c.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3); }
    // panel grid
    c.strokeStyle = line; c.lineWidth = 2;
    const cells = [0, 64, 128, 192, 256];
    for (const y of cells) { c.beginPath(); c.moveTo(0, y); c.lineTo(s, y); c.stroke(); }
    for (let row = 0; row < 4; row++) { const off = row % 2 ? 32 : 0; for (let x = off; x <= s; x += 64 + (row % 3) * 32) { c.beginPath(); c.moveTo(x, row * 64); c.lineTo(x, row * 64 + 64); c.stroke(); } }
    // rivets
    c.fillStyle = 'rgba(255,255,255,0.25)';
    for (let y = 6; y < s; y += 64) for (let x = 6; x < s; x += 16) { c.beginPath(); c.arc(x, y, 1.3, 0, TAU); c.fill(); }
    // streaks
    for (let i = 0; i < 18; i++) { const x = r() * s; const g = c.createLinearGradient(x, 0, x, 60); g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x, Math.floor(r() * 4) * 64, 2 + r() * 4, 60); }
  });
}
function roughTexture(seed: number) {
  return canvasTex(256, (c, s) => {
    const r = rng(seed);
    c.fillStyle = '#8a8a8a'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 2000; i++) { const v = Math.floor(90 + r() * 120); c.fillStyle = `rgb(${v},${v},${v})`; c.globalAlpha = 0.25; c.fillRect(r() * s, r() * s, 2 + r() * 6, 2 + r() * 6); }
    c.globalAlpha = 1;
    c.strokeStyle = '#d0d0d0'; c.lineWidth = 3;
    for (let y = 0; y <= s; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(s, y); c.stroke(); }
  }, 1, false);
}
function organicTexture(base: string, vein: string, seed: number) {
  return canvasTex(256, (c, s) => {
    const r = rng(seed);
    c.fillStyle = base; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) { const x = r() * s, y = r() * s, rad = 6 + r() * 26; const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(255,255,255,${0.04 + r() * 0.06})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    c.strokeStyle = vein; c.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      let x = r() * s, y = r() * s; c.lineWidth = 1 + r() * 2.5; c.globalAlpha = 0.5 + r() * 0.4; c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; c.lineTo(x, y); }
      c.stroke();
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 700; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.12})`; c.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2); }
  });
}
function goldTexture(seed: number) {
  return canvasTex(256, (c, s) => {
    const r = rng(seed);
    c.fillStyle = '#d8b25a'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,240,200' : '120,80,20'},${r() * 0.12})`; c.fillRect(0, r() * s, s, 1); }
    c.strokeStyle = 'rgba(110,70,20,0.55)'; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const y = 20 + i * 42; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= s; x += 32) c.quadraticCurveTo(x + 16, y + (i % 2 ? 10 : -10), x + 32, y); c.stroke(); }
  });
}
function hazardTexture() {
  return canvasTex(64, (c, s) => {
    c.fillStyle = '#e8b020'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#1b1b1b';
    for (let i = -s; i < s * 2; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 8, 0); c.lineTo(i + 8 - s, s); c.lineTo(i - s, s); c.fill(); }
  }, 2);
}
function padTexture() {
  return canvasTex(256, (c, s) => {
    c.fillStyle = '#4a545f'; c.fillRect(0, 0, s, s);
    c.strokeStyle = '#e8b020'; c.lineWidth = 10; c.beginPath(); c.arc(s / 2, s / 2, s * 0.38, 0, TAU); c.stroke();
    c.fillStyle = '#e8e8e8'; c.font = `bold ${s * 0.42}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', s / 2, s / 2 + 4);
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 2; for (let i = 0; i < s; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, s); c.stroke(); }
  });
}

// ------------------------------------------------------------------ kit (shared materials + geometry cache)
export class Kit {
  private geoCache = new Map<string, THREE.BufferGeometry>();
  m: Record<string, THREE.Material>;
  constructor() {
    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
    const phys = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(o);
    const rough = roughTexture(3);
    this.m = {
      // Directorate
      hull: std({ color: 0xaeb8c4, map: panelTexture('#9aa6b3', 'rgba(20,28,36,0.55)', 1), roughnessMap: rough, metalness: 0.75, roughness: 0.55 }),
      hullDark: std({ color: 0x5b6570, map: panelTexture('#5d6771', 'rgba(10,14,18,0.6)', 2), roughnessMap: rough, metalness: 0.7, roughness: 0.6 }),
      gunmetal: std({ color: 0x33383f, metalness: 0.9, roughness: 0.35 }),
      rubber: std({ color: 0x1a1c1f, metalness: 0.1, roughness: 0.95 }),
      glass: phys({ color: 0x0f2230, metalness: 0.2, roughness: 0.05, clearcoat: 1, emissive: 0x0a3a5a, emissiveIntensity: 0.6 }),
      visor: std({ color: 0xffa640, emissive: 0xff8a20, emissiveIntensity: 1.4, roughness: 0.2 }),
      lamp: std({ color: 0xffd27a, emissive: 0xffb040, emissiveIntensity: 2.2 }),
      redLamp: std({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 2.4 }),
      blueGlow: std({ color: 0x8ad8ff, emissive: 0x3ab0ff, emissiveIntensity: 2.6 }),
      hazard: std({ map: hazardTexture(), metalness: 0.4, roughness: 0.5 }),
      pad: std({ map: padTexture(), metalness: 0.5, roughness: 0.6 }),
      white: std({ color: 0xe8ecef, metalness: 0.3, roughness: 0.4, map: panelTexture('#e4e8ec', 'rgba(60,70,80,0.35)', 5) }),
      medGreen: std({ color: 0x3dff8a, emissive: 0x20c060, emissiveIntensity: 1.2 }),
      // Kyrrh
      chitin: phys({ color: 0x5a2352, map: organicTexture('#6a2a60', 'rgba(20,4,18,0.8)', 7), metalness: 0.15, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.2 }),
      chitinDark: phys({ color: 0x2e0f2a, map: organicTexture('#3a1435', 'rgba(0,0,0,0.8)', 8), metalness: 0.2, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 }),
      flesh: phys({ color: 0xa04a8c, map: organicTexture('#b0579a', 'rgba(90,10,60,0.7)', 9), roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(0xff9ad8), sheenRoughness: 0.5 }),
      bone: std({ color: 0xe6dcc0, roughness: 0.55, map: organicTexture('#e9dfc4', 'rgba(120,100,60,0.4)', 10) }),
      gland: std({ color: 0xc8ff5a, emissive: 0x88ff22, emissiveIntensity: 1.8, roughness: 0.3 }),
      membrane: phys({ color: 0xb05a9a, map: organicTexture('#b86aa4', 'rgba(70,10,50,0.85)', 11), roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.88, sheen: 1, sheenColor: new THREE.Color(0xffb0e0) }),
      maw: std({ color: 0x1a0418, roughness: 0.9, emissive: 0x3a0a20, emissiveIntensity: 0.6 }),
      goo: phys({ color: 0x3d6a1c, roughness: 0.1, clearcoat: 1, emissive: 0x1a4a0a, emissiveIntensity: 0.5 }),
      // Aethel
      gold: phys({ color: 0xffd98a, map: goldTexture(12), metalness: 1, roughness: 0.22, clearcoat: 0.6 }),
      goldDark: phys({ color: 0x9a7030, metalness: 1, roughness: 0.3 }),
      ivory: phys({ color: 0xf4eee2, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
      crystal: phys({ color: 0x7ef6ff, emissive: 0x19b6ff, emissiveIntensity: 1.6, roughness: 0.05, metalness: 0.1, clearcoat: 1 }),
      energy: std({ color: 0xbafcff, emissive: 0x5ef0ff, emissiveIntensity: 3.2, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      alloy: std({ color: 0x2f2c3a, metalness: 0.85, roughness: 0.3 }),
      violet: std({ color: 0xd8ccff, emissive: 0x8a70ff, emissiveIntensity: 2.2 }),
      // neutral
      mineral: phys({ color: 0x4fb8ff, emissive: 0x1a70d0, emissiveIntensity: 1.1, roughness: 0.08, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.94 }),
      rock: std({ color: 0x6e6a64, roughness: 0.95, map: organicTexture('#76716a', 'rgba(30,26,22,0.35)', 13) }),
      rockDark: std({ color: 0x3e3b38, roughness: 0.95 }),
      vent: std({ color: 0x2a2f2a, roughness: 0.9 }),
      fluxGlow: std({ color: 0x9dffc4, emissive: 0x3dff8a, emissiveIntensity: 2.4 }),
      plant: phys({ color: 0x3aa890, roughness: 0.5, sheen: 1, sheenColor: new THREE.Color(0x9affe0) }),
    };
  }
  geo<T extends THREE.BufferGeometry>(key: string, f: () => T): T {
    let g = this.geoCache.get(key) as T | undefined;
    if (!g) { g = f(); this.geoCache.set(key, g); }
    return g;
  }
  box(w: number, h: number, d: number, r = 0.04) { return this.geo(`b${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1))); }
  cyl(rt: number, rb: number, h: number, seg = 16) { return this.geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)); }
  sphere(r: number, ws = 16, hs = 12) { return this.geo(`s${r},${ws}`, () => new THREE.SphereGeometry(r, ws, hs)); }
  cone(r: number, h: number, seg = 12) { return this.geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)); }
  capsule(r: number, len: number) { return this.geo(`p${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 4, 10)); }
  torus(r: number, t: number, seg = 32, arc = TAU) { return this.geo(`t${r},${t},${seg},${arc}`, () => new THREE.TorusGeometry(r, t, 8, seg, arc)); }
  oct(r: number) { return this.geo(`o${r}`, () => new THREE.OctahedronGeometry(r, 0)); }
  ico(r: number, d = 0) { return this.geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)); }
  lathe(key: string, pts: [number, number][], seg = 24) { return this.geo('l' + key, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)); }
  blob(r: number, seed: number, amp = 0.12, detail = 3) {
    return this.geo(`bl${r},${seed},${amp},${detail}`, () => {
      const g = new THREE.IcosahedronGeometry(r, detail);
      const p = g.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = Math.sin(v.x * 7 / r + seed) * Math.sin(v.y * 5 / r + seed * 1.7) * Math.sin(v.z * 6 / r + seed * 0.7);
        v.multiplyScalar(1 + n * amp);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    });
  }
  tube(key: string, pts: [number, number, number][], r: number, taper = false) {
    return this.geo('tb' + key, () => {
      const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
      const g = new THREE.TubeGeometry(curve, 24, r, 8, false);
      if (taper) {
        const pos = g.attributes.position as THREE.BufferAttribute;
        const v = new THREE.Vector3(), c = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          const seg = Math.floor(i / 9) / 24;
          curve.getPointAt(Math.min(1, seg), c);
          v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(Math.max(0.05, 1 - seg)).add(c);
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        g.computeVertexNormals();
      }
      return g;
    });
  }
  extrude(key: string, pts: [number, number][], depth: number, bevel = 0.03) {
    return this.geo('ex' + key, () => {
      const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
      g.translate(0, 0, -depth / 2);
      g.computeVertexNormals();
      return g;
    });
  }
}

// ------------------------------------------------------------------ placement helper
function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function grp(parent: THREE.Object3D, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
const S = (p: number) => Math.sin(p * TAU);
const C = (p: number) => Math.cos(p * TAU);

/** Two-segment leg with hip + knee pivots. Swings along X. */
function leg(k: Kit, parent: THREE.Object3D, x: number, y: number, z: number, upper: number, lower: number, r: number, mat: THREE.Material, footMat?: THREE.Material) {
  const hip = grp(parent, x, y, z);
  add(hip, k.capsule(r, upper), mat, 0, -upper / 2, 0);
  const knee = grp(hip, 0, -upper, 0);
  add(knee, k.capsule(r * 0.85, lower), mat, 0, -lower / 2, 0);
  if (footMat) add(knee, k.box(r * 3.2, r * 1.1, r * 2.2, r * 0.4), footMat, r * 0.6, -lower, 0);
  return { hip, knee };
}
function walkLegs(legs: { hip: THREE.Group; knee: THREE.Group }[], phase: number, amp = 0.55) {
  legs.forEach((l, i) => {
    const p = phase + (i % 2 ? 0.5 : 0);
    l.hip.rotation.z = S(p) * amp;
    l.knee.rotation.z = -Math.max(0, S(p + 0.25)) * amp * 1.2;
  });
}
/** Insect leg (3 segments) splayed sideways. side = ±1 (z). */
function bugLeg(k: Kit, parent: THREE.Object3D, x: number, y: number, side: number, len: number, r: number, mat: THREE.Material) {
  const root = grp(parent, x, y, side * 0.1);
  root.rotation.x = side * 0.9;
  add(root, k.capsule(r, len * 0.45), mat, 0, len * 0.22, 0);
  const j = grp(root, 0, len * 0.45, 0);
  j.rotation.x = -side * 1.9;
  add(j, k.capsule(r * 0.8, len * 0.6), mat, 0, len * 0.3, 0);
  add(j, k.cone(r * 0.8, len * 0.2, 6), mat, 0, len * 0.66, 0);
  return root;
}
function scuttle(legs: THREE.Group[], phase: number, amp = 0.35) {
  legs.forEach((l, i) => { const side = l.rotation.x > 0 ? 1 : -1; l.rotation.z = S(phase + (i % 2) * 0.5 + (i >> 1) * 0.17) * amp; l.rotation.x = side * (0.9 + Math.max(0, S(phase + (i % 2) * 0.5)) * 0.25); });
}

// ================================================================== UNITS
const U: Record<string, Builder> = {};

// ---------------- Directorate
U.rigger = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0.42, 0);
  const legs = [leg(k, root, -0.02, 0.36, -0.12, 0.17, 0.17, 0.05, k.m.hullDark, k.m.gunmetal), leg(k, root, -0.02, 0.36, 0.12, 0.17, 0.17, 0.05, k.m.hullDark, k.m.gunmetal)];
  add(body, k.box(0.34, 0.3, 0.36, 0.08), k.m.hull, 0, 0.05, 0);
  add(body, k.sphere(0.13), k.m.glass, 0.13, 0.1, 0, 0, 0, 0, 1, 0.8, 1);
  add(body, k.cyl(0.08, 0.08, 0.28), k.m.hazard, -0.2, 0.08, 0, Math.PI / 2);
  add(body, k.box(0.1, 0.18, 0.28, 0.03), team, -0.14, 0.12, 0);
  const arm = grp(body, 0.08, 0.02, 0.22);
  add(arm, k.capsule(0.035, 0.2), k.m.gunmetal, 0.1, 0, 0, 0, 0, Math.PI / 2);
  add(arm, k.cone(0.04, 0.1, 8), k.m.lamp, 0.25, 0, 0, 0, 0, -Math.PI / 2);
  const claw = grp(body, 0.08, 0.02, -0.22);
  add(claw, k.capsule(0.035, 0.18), k.m.gunmetal, 0.1, 0, 0, 0, 0, Math.PI / 2);
  add(claw, k.box(0.06, 0.04, 0.08), k.m.hullDark, 0.22, 0, 0);
  add(body, k.cyl(0.008, 0.008, 0.25, 4), k.m.gunmetal, -0.12, 0.32, 0.1);
  add(body, k.sphere(0.02), k.m.redLamp, -0.12, 0.45, 0.1);
  return { root, pose: p => { walkLegs(legs, p, 0.45); body.position.y = 0.42 + Math.abs(S(p)) * 0.02; arm.rotation.z = S(p) * 0.2; } };
};
function infantry(k: Kit, team: THREE.Material, o: { bulk: number; armor: THREE.Material; gun: 'rifle' | 'launcher' | 'none'; pack?: THREE.Material }) {
  const root = new THREE.Group();
  const b = o.bulk;
  const legs = [leg(k, root, 0, 0.5, -0.1 * b, 0.23, 0.23, 0.055 * b, o.armor, k.m.gunmetal), leg(k, root, 0, 0.5, 0.1 * b, 0.23, 0.23, 0.055 * b, o.armor, k.m.gunmetal)];
  const torso = grp(root, 0, 0.52, 0);
  add(torso, k.box(0.26 * b, 0.32, 0.34 * b, 0.07), o.armor, 0, 0.18, 0);
  add(torso, k.box(0.2 * b, 0.14, 0.28 * b, 0.05), k.m.gunmetal, 0, 0.02, 0);
  for (const z of [-1, 1]) add(torso, k.sphere(0.12 * b, 14, 10), team, 0, 0.3, z * 0.22 * b, 0, 0, 0, 1, 0.75, 1);
  const head = grp(torso, 0.02, 0.42, 0);
  add(head, k.sphere(0.1, 16, 12), o.armor, 0, 0, 0, 0, 0, 0, 1.05, 1, 1);
  add(head, k.box(0.06, 0.05, 0.14, 0.02), k.m.visor, 0.08, 0.005, 0);
  add(torso, k.box(0.14, 0.28, 0.26 * b, 0.05), o.pack ?? k.m.hullDark, -0.2, 0.2, 0);
  let gun: THREE.Group | null = null;
  if (o.gun !== 'none') {
    gun = grp(torso, 0.16, 0.16, 0.12 * b);
    if (o.gun === 'rifle') {
      add(gun, k.box(0.44, 0.07, 0.06, 0.015), k.m.gunmetal, 0.12, 0, 0);
      add(gun, k.cyl(0.015, 0.015, 0.2, 8), k.m.gunmetal, 0.42, 0.01, 0, 0, 0, Math.PI / 2);
      add(gun, k.box(0.08, 0.1, 0.04, 0.01), k.m.hullDark, 0.02, -0.07, 0);
    } else {
      add(gun, k.cyl(0.06, 0.06, 0.46, 12), k.m.gunmetal, 0.14, 0, 0, 0, 0, Math.PI / 2);
      add(gun, k.cyl(0.09, 0.09, 0.14, 10), k.m.hullDark, 0.02, 0, 0, 0, 0, Math.PI / 2);
      add(gun, k.torus(0.06, 0.012, 12), k.m.hazard, 0.37, 0, 0, 0, Math.PI / 2, 0);
    }
  }
  return { root, legs, torso, head, gun };
}
U.trooper = (k, team) => {
  const r = infantry(k, team, { bulk: 1, armor: k.m.hull, gun: 'rifle' });
  return { root: r.root, pose: p => { walkLegs(r.legs, p); r.torso.position.y = 0.52 + Math.abs(S(p)) * 0.03; r.torso.rotation.y = S(p) * 0.08; } };
};
U.breacher = (k, team) => {
  const r = infantry(k, team, { bulk: 1.35, armor: k.m.hullDark, gun: 'launcher', pack: k.m.hazard });
  return { root: r.root, pose: p => { walkLegs(r.legs, p, 0.45); r.torso.position.y = 0.52 + Math.abs(S(p)) * 0.03; } };
};
U.mender = (k, team) => {
  const r = infantry(k, team, { bulk: 1, armor: k.m.white, gun: 'none', pack: k.m.white });
  add(r.torso, k.box(0.03, 0.14, 0.05, 0.005), k.m.medGreen, -0.28, 0.24, 0);
  add(r.torso, k.box(0.03, 0.05, 0.14, 0.005), k.m.medGreen, -0.28, 0.24, 0);
  const emitter = grp(r.torso, 0.16, 0.14, 0.14);
  add(emitter, k.cyl(0.03, 0.04, 0.16, 8), k.m.gunmetal, 0.06, 0, 0, 0, 0, Math.PI / 2);
  add(emitter, k.sphere(0.035), k.m.medGreen, 0.15, 0, 0);
  return { root: r.root, pose: p => { walkLegs(r.legs, p); } };
};
U.scorcher = (k, team) => {
  const root = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.3, -0.34], [0.32, -0.34], [-0.3, 0.34], [0.32, 0.34]]) {
    const w = add(root, k.cyl(0.14, 0.14, 0.12, 14), k.m.rubber, x, 0.14, z, Math.PI / 2);
    add(w, k.cyl(0.07, 0.07, 0.13, 8), k.m.gunmetal, 0, 0, 0);
    wheels.push(w);
  }
  add(root, k.extrude('scorch', [[-0.5, 0], [0.42, 0], [0.55, 0.1], [0.3, 0.2], [-0.45, 0.2]], 0.5, 0.03), k.m.hull, 0, 0.14, 0);
  add(root, k.box(0.3, 0.08, 0.52, 0.02), team, -0.2, 0.36, 0);
  for (const z of [-0.2, 0.2]) add(root, k.tube(`cage${z}`, [[-0.3, 0.35, z], [-0.1, 0.55, z], [0.15, 0.52, z], [0.25, 0.36, z]], 0.02), k.m.gunmetal);
  const tur = grp(root, 0.08, 0.4, 0);
  add(tur, k.cyl(0.1, 0.12, 0.1, 12), k.m.hullDark, 0, 0, 0);
  add(tur, k.cyl(0.035, 0.05, 0.4, 10), k.m.gunmetal, 0.22, 0.03, 0, 0, 0, Math.PI / 2);
  add(tur, k.cyl(0.05, 0.05, 0.03, 10), k.m.lamp, 0.43, 0.03, 0, 0, 0, Math.PI / 2);
  for (const z of [-0.14, 0.14]) add(root, k.capsule(0.06, 0.2), k.m.hazard, -0.38, 0.42, z, 0, 0, Math.PI / 2);
  add(root, k.box(0.06, 0.06, 0.14), k.m.glass, 0.3, 0.32, 0);
  return { root, pose: p => { wheels.forEach(w => { w.rotation.y = -p * TAU; }); root.rotation.x = S(p * 2) * 0.01; } };
};
U.juggernaut = (k, team, variant) => {
  const root = new THREE.Group();
  const sieged = variant === 'sieged';
  const treads: THREE.Mesh[] = [];
  const bodyY = sieged ? 0.16 : 0.22;
  for (const z of [-0.42, 0.42]) {
    add(root, k.box(1.1, 0.26, 0.24, 0.1), k.m.rubber, 0, 0.14, z);
    for (let i = 0; i < 5; i++) treads.push(add(root, k.cyl(0.08, 0.08, 0.26, 10), k.m.gunmetal, -0.4 + i * 0.2, 0.14, z, Math.PI / 2));
    add(root, k.box(1.14, 0.06, 0.28, 0.02), k.m.hullDark, 0, 0.29, z);
  }
  const hull = grp(root, 0, bodyY, 0);
  add(hull, k.extrude('jugHull', [[-0.55, 0], [0.45, 0], [0.6, 0.12], [0.45, 0.24], [-0.5, 0.26]], 0.66, 0.04), k.m.hull, 0, 0.02, 0);
  add(hull, k.box(0.18, 0.1, 0.5, 0.02), team, -0.38, 0.28, 0);
  add(hull, k.box(0.16, 0.08, 0.2, 0.02), k.m.hullDark, -0.52, 0.2, 0);
  for (const z of [-0.2, 0.2]) add(hull, k.cyl(0.035, 0.035, 0.12, 8), k.m.gunmetal, -0.5, 0.35, z);
  const tur = grp(hull, 0.02, 0.3, 0);
  add(tur, k.cyl(0.26, 0.3, 0.16, 16), k.m.hull, 0, 0.05, 0);
  add(tur, k.box(0.36, 0.14, 0.34, 0.05), k.m.hullDark, -0.05, 0.14, 0);
  add(tur, k.sphere(0.04), k.m.lamp, 0.1, 0.22, 0.12);
  if (sieged) {
    for (const [x, z] of [[0.45, -0.45], [0.45, 0.45], [-0.45, -0.45], [-0.45, 0.45]]) {
      const s = add(root, k.box(0.5, 0.06, 0.08, 0.02), k.m.gunmetal, x * 1.15, 0.08, z * 1.15, 0, Math.atan2(-z, x), -0.35);
      void s;
      add(root, k.cyl(0.08, 0.1, 0.04, 10), k.m.hullDark, x * 1.55, 0.02, z * 1.55);
    }
    add(tur, k.cyl(0.06, 0.08, 1.1, 12), k.m.gunmetal, 0.62, 0.24, 0, 0, 0, Math.PI / 2 - 0.2);
    add(tur, k.cyl(0.1, 0.1, 0.14, 12), k.m.hullDark, 1.14, 0.35, 0, 0, 0, Math.PI / 2 - 0.2);
  } else {
    add(tur, k.cyl(0.04, 0.05, 0.72, 12), k.m.gunmetal, 0.46, 0.14, 0, 0, 0, Math.PI / 2);
    add(tur, k.cyl(0.07, 0.07, 0.1, 10), k.m.hullDark, 0.82, 0.14, 0, 0, 0, Math.PI / 2);
  }
  return { root, pose: p => { treads.forEach(t => { t.rotation.y = p * TAU; }); if (!sieged) hull.position.y = bodyY + S(p * 2) * 0.006; } };
};
U.wasp = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0, 0);
  add(body, k.capsule(0.16, 0.7), k.m.hull, 0, 0, 0, 0, 0, Math.PI / 2, 1, 0.8, 1);
  add(body, k.sphere(0.14), k.m.glass, 0.42, 0.04, 0, 0, 0, 0, 1.2, 0.7, 0.9);
  add(body, k.box(0.3, 0.05, 0.9, 0.02), k.m.hullDark, -0.05, 0, 0);
  add(body, k.box(0.2, 0.06, 0.24, 0.02), team, -0.18, 0.13, 0);
  add(body, k.cone(0.08, 0.5, 8), k.m.hullDark, -0.62, 0.04, 0, 0, 0, Math.PI / 2);
  add(body, k.box(0.14, 0.2, 0.02, 0.01), k.m.hullDark, -0.8, 0.12, 0);
  const rotors: THREE.Group[] = [];
  for (const z of [-0.6, 0.6]) {
    add(body, k.torus(0.28, 0.035, 24), k.m.hull, 0, 0.02, z, Math.PI / 2);
    const rot = grp(body, 0, 0.02, z);
    for (let i = 0; i < 3; i++) add(rot, k.box(0.5, 0.01, 0.06, 0.005), k.m.gunmetal, 0, 0, 0, 0, (i * TAU) / 3, 0);
    rotors.push(rot);
    for (const y of [-0.08, 0.08]) add(body, k.cyl(0.035, 0.035, 0.3, 8), k.m.hazard, 0.1, y - 0.06, z * 0.72, 0, 0, Math.PI / 2);
  }
  return { root, air: 1.1, pose: p => { rotors.forEach((r, i) => { r.rotation.y = p * TAU * 3 * (i ? 1 : -1); }); body.rotation.x = S(p) * 0.03; } };
};
U.dreadnought = (k, team) => {
  const root = new THREE.Group();
  const hull = grp(root, 0, 0, 0);
  add(hull, k.extrude('dreadHull', [[-1.2, -0.5], [0.6, -0.42], [1.35, 0], [0.6, 0.42], [-1.2, 0.5], [-1.35, 0]], 0.3, 0.06), k.m.hull, 0, 0, 0, Math.PI / 2);
  add(hull, k.extrude('dreadDeck', [[-0.9, -0.28], [0.5, -0.22], [0.95, 0], [0.5, 0.22], [-0.9, 0.28]], 0.18, 0.04), k.m.hullDark, 0, 0.2, 0, Math.PI / 2);
  add(hull, k.box(0.4, 0.3, 0.34, 0.05), k.m.hull, -0.55, 0.38, 0);
  add(hull, k.box(0.18, 0.1, 0.3, 0.03), k.m.glass, -0.4, 0.5, 0);
  add(hull, k.box(0.5, 0.05, 0.6, 0.02), team, -0.1, 0.3, 0);
  for (const x of [0.35, -0.05]) for (const z of [-0.26, 0.26]) {
    const t = grp(hull, x, 0.3, z);
    add(t, k.cyl(0.09, 0.1, 0.07, 12), k.m.hullDark);
    for (const dz of [-0.03, 0.03]) add(t, k.cyl(0.015, 0.015, 0.22, 6), k.m.gunmetal, 0.12, 0.03, dz, 0, 0, Math.PI / 2);
  }
  const engines: THREE.Mesh[] = [];
  for (const z of [-0.3, 0, 0.3]) {
    add(hull, k.cyl(0.12, 0.14, 0.3, 14), k.m.gunmetal, -1.3, 0.05, z, 0, 0, Math.PI / 2);
    engines.push(add(hull, k.cyl(0.1, 0.1, 0.02, 14), k.m.blueGlow, -1.46, 0.05, z, 0, 0, Math.PI / 2));
  }
  add(hull, k.box(0.8, 0.04, 0.02, 0.01), k.m.lamp, 0.2, 0.24, 0.3);
  add(hull, k.box(0.8, 0.04, 0.02, 0.01), k.m.lamp, 0.2, 0.24, -0.3);
  return { root, air: 1.5, pose: p => { engines.forEach((e, i) => { e.scale.set(1, 1, 1 + S(p + i * 0.3) * 0.15); }); hull.rotation.x = S(p) * 0.015; } };
};
U.titan = (k, team) => {
  const root = new THREE.Group();
  const legs = [leg(k, root, -0.05, 1.05, -0.45, 0.55, 0.55, 0.14, k.m.hullDark, k.m.gunmetal), leg(k, root, -0.05, 1.05, 0.45, 0.55, 0.55, 0.14, k.m.hullDark, k.m.gunmetal)];
  for (const l of legs) { add(l.hip, k.cyl(0.05, 0.05, 0.45, 8), k.m.hazard, 0.12, -0.3, 0); add(l.hip, k.sphere(0.18), k.m.gunmetal, 0, 0, 0); }
  const torso = grp(root, 0, 1.05, 0);
  add(torso, k.box(0.9, 0.6, 1.1, 0.12), k.m.hull, 0, 0.25, 0);
  add(torso, k.box(0.5, 0.3, 0.8, 0.08), k.m.hullDark, -0.2, 0.62, 0);
  add(torso, k.box(0.22, 0.16, 0.5, 0.05), k.m.glass, 0.4, 0.4, 0);
  add(torso, k.box(0.3, 0.12, 0.6, 0.03), team, -0.3, 0.8, 0);
  for (const z of [-0.72, 0.72]) {
    const pod = grp(torso, 0.05, 0.4, z);
    add(pod, k.box(0.7, 0.34, 0.36, 0.06), k.m.hullDark, 0, 0, 0);
    for (const dy of [-0.08, 0.08]) add(pod, k.cyl(0.06, 0.07, 0.8, 12), k.m.gunmetal, 0.55, dy, 0, 0, 0, Math.PI / 2);
    add(pod, k.box(0.1, 0.3, 0.3, 0.02), k.m.hazard, -0.3, 0, 0);
  }
  add(torso, k.sphere(0.05), k.m.redLamp, -0.4, 0.82, 0.25);
  return { root, pose: p => { walkLegs(legs, p, 0.35); torso.position.y = 1.05 + Math.abs(S(p)) * 0.05; torso.rotation.x = S(p) * 0.03; } };
};

// ---------------- Kyrrh
function segBody(k: Kit, parent: THREE.Object3D, n: number, len: number, r: number, mat: THREE.Material, alt: THREE.Material, seed: number) {
  const segs: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const rr = r * (0.7 + 0.3 * Math.sin(t * Math.PI));
    segs.push(add(parent, k.blob(rr, seed + i, 0.06, 2), i % 2 ? mat : alt, -len / 2 + t * len, 0, 0, 0, 0, 0, 1.1, 0.8, 1));
  }
  return segs;
}
U.grub = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0.2, 0);
  segBody(k, body, 3, 0.36, 0.17, k.m.chitin, k.m.chitinDark, 1);
  add(body, k.blob(0.12, 3, 0.08, 2), k.m.flesh, 0.26, 0.02, 0);
  for (const z of [-1, 1]) add(body, k.tube(`mand${z}`, [[0.32, 0, z * 0.05], [0.42, -0.02, z * 0.1], [0.48, -0.03, z * 0.04]], 0.015, true), k.m.bone);
  add(body, k.sphere(0.05), k.m.gland, -0.05, 0.15, 0);
  add(body, k.sphere(0.04), team, -0.2, 0.12, 0);
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) legs.push(bugLeg(k, body, -0.15 + Math.floor(i / 2) * 0.15, -0.02, i % 2 ? 1 : -1, 0.3, 0.018, k.m.chitinDark));
  return { root, pose: p => { scuttle(legs, p); body.position.y = 0.2 + S(p * 2) * 0.01; } };
};
U.drover = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0, 0);
  const sac = add(body, k.blob(0.62, 5, 0.07, 3), k.m.membrane, 0, 0.1, 0, 0, 0, 0, 1.15, 0.85, 1);
  add(body, k.blob(0.3, 6, 0.1, 2), k.m.chitin, 0.5, -0.1, 0);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; add(body, k.sphere(0.07), k.m.gland, Math.cos(a) * 0.35, 0.35, Math.sin(a) * 0.35); }
  const tents: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; tents.push(add(body, k.tube(`tent${i}`, [[0, 0, 0], [Math.cos(a) * 0.2, -0.3, Math.sin(a) * 0.2], [Math.cos(a) * 0.3, -0.6, Math.sin(a) * 0.3], [Math.cos(a) * 0.25, -0.85, Math.sin(a) * 0.25]], 0.04, true), k.m.flesh, 0, -0.3, 0)); }
  add(body, k.sphere(0.08), team, 0.3, 0.55, 0);
  return { root, air: 1.3, pose: p => { sac.scale.set(1.15 + S(p) * 0.04, 0.85 - S(p) * 0.03, 1 + S(p) * 0.04); tents.forEach((t, i) => { t.rotation.z = S(p + i / 6) * 0.15; t.rotation.x = C(p + i / 6) * 0.12; }); } };
};
U.skitterling = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0.18, 0);
  segBody(k, body, 3, 0.4, 0.13, k.m.chitin, k.m.flesh, 12);
  add(body, k.blob(0.1, 14, 0.1, 2), k.m.chitinDark, 0.26, 0.04, 0);
  const blades: THREE.Mesh[] = [];
  for (const z of [-1, 1]) blades.push(add(body, k.tube(`scy${z}`, [[0.15, 0.08, z * 0.08], [0.3, 0.28, z * 0.14], [0.48, 0.2, z * 0.12], [0.58, 0.0, z * 0.06]], 0.022, true), k.m.bone));
  add(body, k.tube('ltail', [[-0.22, 0, 0], [-0.4, 0.04, 0], [-0.55, 0.12, 0]], 0.03, true), k.m.chitin);
  add(body, k.sphere(0.035), team, -0.08, 0.12, 0);
  add(body, k.sphere(0.03), k.m.gland, 0.34, 0.08, 0.05);
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) legs.push(bugLeg(k, body, -0.1 + Math.floor(i / 2) * 0.2, -0.02, i % 2 ? 1 : -1, 0.3, 0.016, k.m.chitinDark));
  return { root, pose: p => { scuttle(legs, p, 0.5); blades.forEach((b, i) => { b.rotation.z = S(p + i * 0.5) * 0.12; }); body.rotation.z = S(p * 2) * 0.04; } };
};
U.carapid = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0.3, 0);
  for (let i = 0; i < 4; i++) add(body, k.sphere(0.34 - i * 0.02, 18, 10), i % 2 ? k.m.chitin : k.m.chitinDark, -0.35 + i * 0.2, 0.02, 0, 0, 0, 0, 0.7, 0.75, 1.05);
  add(body, k.blob(0.2, 21, 0.08, 2), k.m.flesh, 0.45, -0.05, 0);
  for (const z of [-0.1, 0, 0.1]) add(body, k.sphere(0.05), k.m.gland, 0.6, 0, z);
  add(body, k.sphere(0.05), team, -0.3, 0.3, 0);
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) legs.push(bugLeg(k, body, -0.25 + Math.floor(i / 2) * 0.25, -0.1, i % 2 ? 1 : -1, 0.42, 0.028, k.m.chitinDark));
  return { root, pose: p => { scuttle(legs, p, 0.3); body.position.y = 0.3 + S(p * 2) * 0.012; } };
};
U.quillback = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0, 0);
  const segs: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    segs.push(add(body, k.sphere(0.2 - t * 0.08 + (i === 0 ? 0.02 : 0), 14, 10), i % 2 ? k.m.chitin : k.m.flesh, 0.35 - i * 0.16, 0.22 + (i === 0 ? 0.25 : 0), 0));
  }
  add(body, k.blob(0.17, 31, 0.1, 2), k.m.chitinDark, 0.5, 0.52, 0);
  for (const z of [-1, 1]) add(body, k.tube(`frill${z}`, [[0.45, 0.6, z * 0.1], [0.35, 0.78, z * 0.25], [0.25, 0.7, z * 0.3]], 0.025, true), k.m.bone);
  add(body, k.sphere(0.04), k.m.gland, 0.65, 0.55, 0.06);
  add(body, k.sphere(0.04), k.m.gland, 0.65, 0.55, -0.06);
  const quills: THREE.Mesh[] = [];
  for (let i = 1; i < 6; i++) for (const z of [-1, 1]) quills.push(add(segs[i], k.cone(0.03, 0.34, 6), k.m.bone, -0.02, 0.18, z * 0.08, z * 0.5, 0, 0.5));
  add(segs[2], k.sphere(0.05), team, 0, 0.16, 0);
  return { root, pose: p => { segs.forEach((s, i) => { s.position.z = S(p - i * 0.12) * 0.06 * (i / 3); }); } };
};
function wing(k: Kit, key: string, span: number, chord: number) {
  return k.geo('wing' + key, () => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.bezierCurveTo(chord * 0.6, span * 0.3, chord * 0.4, span * 0.8, -chord * 0.1, span);
    sh.lineTo(-chord * 0.3, span * 0.7); sh.lineTo(-chord * 0.6, span * 0.85); sh.lineTo(-chord * 0.55, span * 0.45); sh.lineTo(-chord * 0.9, span * 0.4); sh.lineTo(-chord * 0.4, 0);
    const g = new THREE.ShapeGeometry(sh, 8);
    g.rotateX(Math.PI / 2);
    return g;
  });
}
U.wyvern = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0, 0);
  add(body, k.capsule(0.12, 0.5), k.m.chitin, 0, 0, 0, 0, 0, Math.PI / 2);
  add(body, k.blob(0.12, 41, 0.1, 2), k.m.flesh, 0.38, 0.03, 0);
  add(body, k.tube('wtail', [[-0.25, 0, 0], [-0.55, 0.05, 0], [-0.85, 0.12, 0], [-1.05, 0.08, 0]], 0.06, true), k.m.chitinDark);
  add(body, k.sphere(0.04), k.m.gland, 0.48, 0.06, 0.05);
  add(body, k.sphere(0.045), team, -0.05, 0.14, 0);
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const w = grp(body, 0.05, 0.05, side * 0.1);
    add(w, wing(k, 'wy', 0.85, 0.55), k.m.membrane, 0, 0, 0, 0, 0, 0, 1, 1, side);
    add(w, k.tube(`wbone${side}`, [[0, 0, 0], [0.1, 0.05, side * 0.4], [-0.05, 0.02, side * 0.85]], 0.018), k.m.bone);
    wings.push(w);
  }
  return { root, air: 1.2, pose: p => { wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * S(p) * 0.7; }); body.position.y = -S(p) * 0.05; } };
};
U.behemoth = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0.72, 0);
  add(body, k.blob(0.62, 51, 0.08, 3), k.m.flesh, 0, 0, 0, 0, 0, 0, 1.35, 0.75, 1);
  for (let i = 0; i < 5; i++) add(body, k.sphere(0.5 - Math.abs(i - 2) * 0.06, 18, 10, ), i % 2 ? k.m.chitin : k.m.chitinDark, -0.55 + i * 0.28, 0.2, 0, 0, 0, 0, 0.55, 0.55, 1.05);
  for (let i = 0; i < 5; i++) add(body, k.cone(0.07, 0.4, 6), k.m.bone, -0.55 + i * 0.28, 0.62, 0, 0, 0, -0.35);
  const head = grp(body, 0.85, -0.1, 0);
  add(head, k.blob(0.3, 52, 0.08, 2), k.m.chitinDark, 0, 0, 0);
  for (const z of [-1, 1]) add(head, k.tube(`tusk${z}`, [[0.1, -0.05, z * 0.18], [0.45, -0.2, z * 0.35], [0.8, 0.05, z * 0.4], [0.95, 0.35, z * 0.3]], 0.07, true), k.m.bone);
  for (const z of [-0.08, 0.08]) add(head, k.sphere(0.04), k.m.gland, 0.26, 0.08, z);
  add(body, k.sphere(0.07), team, -0.5, 0.45, 0);
  const legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  for (const [x, z] of [[0.45, -0.45], [0.45, 0.45], [-0.45, -0.45], [-0.45, 0.45]]) legs.push(leg(k, root, x, 0.7, z, 0.36, 0.36, 0.11, k.m.chitinDark, k.m.bone));
  return { root, pose: p => { walkLegs([legs[0], legs[3], legs[1], legs[2]], p, 0.3); body.position.y = 0.72 + Math.abs(S(p)) * 0.04; head.rotation.z = S(p) * 0.06; } };
};
U.matron = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0.35, 0);
  add(body, k.blob(0.3, 61, 0.08, 2), k.m.chitin, -0.25, 0, 0, 0, 0, 0, 1.3, 0.8, 1);
  const thorax = grp(body, 0.15, 0.1, 0);
  add(thorax, k.blob(0.2, 62, 0.08, 2), k.m.flesh, 0, 0.2, 0, 0, 0, -0.5, 1, 1.4, 1);
  add(thorax, k.blob(0.14, 63, 0.1, 2), k.m.chitinDark, 0.1, 0.52, 0);
  for (let i = 0; i < 5; i++) add(thorax, k.cone(0.03, 0.26, 6), k.m.bone, 0.02, 0.64, (i - 2) * 0.06, (i - 2) * 0.3, 0, 0.3);
  add(thorax, k.sphere(0.07), k.m.gland, 0.12, 0.3, 0);
  const arms: THREE.Mesh[] = [];
  for (const z of [-1, 1]) for (const y of [0.25, 0.4]) arms.push(add(thorax, k.tube(`marm${z}${y}`, [[0, y, z * 0.12], [0.2, y + 0.1, z * 0.3], [0.45, y - 0.05, z * 0.25]], 0.025, true), k.m.bone));
  add(body, k.sphere(0.06), team, -0.4, 0.25, 0);
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) legs.push(bugLeg(k, body, -0.3 + Math.floor(i / 2) * 0.3, -0.05, i % 2 ? 1 : -1, 0.4, 0.025, k.m.chitinDark));
  return { root, pose: p => { scuttle(legs, p, 0.3); arms.forEach((a, i) => { a.rotation.y = S(p + i * 0.25) * 0.1; }); thorax.rotation.z = S(p) * 0.04; } };
};
U.gravemaw = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0, 0);
  add(body, k.blob(0.62, 71, 0.06, 3), k.m.chitin, -0.1, 0, 0, 0, 0, 0, 1.9, 0.75, 1);
  for (let i = 0; i < 6; i++) add(body, k.sphere(0.35, 14, 8), k.m.chitinDark, -0.9 + i * 0.3, 0.26, 0, 0, 0, 0, 0.4, 0.3, 1.1);
  const jaw = grp(body, 0.95, -0.05, 0);
  add(jaw, k.blob(0.34, 72, 0.08, 2), k.m.flesh, 0, 0.1, 0, 0, 0, 0, 1, 0.6, 1);
  const lower = add(jaw, k.blob(0.3, 73, 0.08, 2), k.m.flesh, 0, -0.14, 0, 0, 0, 0, 1, 0.45, 0.95);
  add(jaw, k.sphere(0.24, 14, 10), k.m.maw, 0.2, -0.02, 0, 0, 0, 0, 0.6, 0.5, 0.9);
  for (let i = 0; i < 8; i++) add(jaw, k.cone(0.025, 0.12, 5), k.m.bone, 0.3, 0.06, -0.2 + i * 0.057, Math.PI, 0, 0);
  for (let i = 0; i < 5; i++) add(body, k.sphere(0.09), k.m.gland, -0.4 + i * 0.25, -0.35, (i % 2 ? 1 : -1) * 0.3);
  const fins: THREE.Group[] = [];
  for (const side of [-1, 1]) { const f = grp(body, 0, 0, side * 0.45); add(f, wing(k, 'fin', 0.75, 0.9), k.m.membrane, 0, 0, 0, 0, 0, 0, 1, 1, side); fins.push(f); }
  add(body, k.tube('gtail', [[-1.1, 0, 0], [-1.45, 0.1, 0], [-1.75, 0.05, 0]], 0.14, true), k.m.chitin);
  add(body, k.sphere(0.09), team, -0.5, 0.5, 0);
  return { root, air: 1.7, pose: p => { fins.forEach((f, i) => { f.rotation.x = (i ? 1 : -1) * S(p) * 0.35; }); lower.position.y = -0.14 - Math.max(0, S(p)) * 0.06; body.rotation.z = S(p) * 0.03; } };
};

// ---------------- Aethel
U.acolyte = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0, 0);
  add(body, k.oct(0.2), k.m.gold, 0, 0, 0, 0, 0, 0, 1.2, 0.8, 1);
  add(body, k.oct(0.09), k.m.crystal, 0.02, 0.12, 0);
  const ring = add(body, k.torus(0.28, 0.018, 32), k.m.gold, 0, 0, 0, Math.PI / 2);
  for (const z of [-1, 1]) add(body, k.cone(0.05, 0.22, 4), k.m.ivory, -0.05, -0.05, z * 0.2, z * 1.2, 0, 0);
  add(body, k.cyl(0.02, 0.03, 0.18, 6), k.m.goldDark, 0.25, -0.02, 0, 0, 0, Math.PI / 2);
  add(body, k.sphere(0.025), k.m.energy, 0.34, -0.02, 0);
  add(body, k.sphere(0.04), team, -0.16, 0.05, 0);
  return { root, air: 0.45, pose: p => { ring.rotation.y = p * TAU; ring.rotation.x = Math.PI / 2 + S(p) * 0.25; body.position.y = S(p) * 0.04; } };
};
U.vindicator = (k, team) => {
  const root = new THREE.Group();
  const legs = [leg(k, root, 0, 0.52, -0.11, 0.25, 0.25, 0.055, k.m.gold, k.m.goldDark), leg(k, root, 0, 0.52, 0.11, 0.25, 0.25, 0.055, k.m.gold, k.m.goldDark)];
  const torso = grp(root, 0, 0.54, 0);
  add(torso, k.lathe('vtorso', [[0, 0], [0.16, 0.02], [0.2, 0.2], [0.17, 0.36], [0, 0.4]], 16), k.m.ivory, 0, 0, 0, 0, 0, 0, 0.8, 1, 1);
  add(torso, k.box(0.12, 0.2, 0.28, 0.05), k.m.gold, 0.08, 0.2, 0);
  for (const z of [-1, 1]) add(torso, k.lathe('vpaul', [[0, 0], [0.13, 0.02], [0.1, 0.1], [0, 0.12]], 12), k.m.gold, 0, 0.3, z * 0.22, 0, 0, z * 0.4);
  const head = grp(torso, 0.02, 0.46, 0);
  add(head, k.sphere(0.085), k.m.ivory, 0, 0, 0, 0, 0, 0, 1.1, 1, 0.9);
  add(head, k.cone(0.05, 0.2, 4), k.m.gold, -0.06, 0.1, 0, 0, 0, 0.9);
  add(head, k.box(0.03, 0.02, 0.1, 0.005), k.m.energy, 0.08, 0, 0);
  add(torso, k.box(0.03, 0.26, 0.22, 0.01), team, -0.16, 0.18, 0);
  const blades: THREE.Group[] = [];
  for (const z of [-1, 1]) {
    const arm = grp(torso, 0.05, 0.22, z * 0.26);
    add(arm, k.capsule(0.04, 0.18), k.m.gold, 0.1, 0, 0, 0, 0, Math.PI / 2);
    add(arm, k.box(0.55, 0.012, 0.06, 0.004), k.m.energy, 0.48, 0.02, 0);
    blades.push(arm);
  }
  return { root, pose: p => { walkLegs(legs, p); torso.position.y = 0.54 + Math.abs(S(p)) * 0.03; blades.forEach((b, i) => { b.rotation.y = (i ? -1 : 1) * (0.15 + S(p) * 0.08); }); } };
};
U.seeker = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0.55, 0);
  add(body, k.lathe('seekbody', [[0, -0.12], [0.3, -0.08], [0.34, 0], [0.28, 0.08], [0, 0.12]], 20), k.m.gold, 0, 0, 0, 0, 0, 0, 1.2, 1, 1);
  add(body, k.oct(0.12), k.m.crystal, 0.1, 0.14, 0, 0, 0, 0, 1, 1.3, 1);
  add(body, k.cyl(0.04, 0.05, 0.36, 8), k.m.alloy, 0.38, 0, 0, 0, 0, Math.PI / 2);
  add(body, k.sphere(0.05), k.m.energy, 0.56, 0, 0);
  add(body, k.box(0.1, 0.06, 0.18, 0.02), team, -0.3, 0.06, 0);
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const l = grp(body, Math.cos(a) * 0.24, -0.04, Math.sin(a) * 0.24);
    l.rotation.y = -a;
    add(l, k.capsule(0.03, 0.3), k.m.goldDark, 0.15, 0.05, 0, 0, 0, -1.1);
    add(l, k.capsule(0.025, 0.45), k.m.ivory, 0.34, -0.25, 0, 0, 0, -0.25);
    legs.push(l);
  }
  return { root, pose: p => { legs.forEach((l, i) => { l.rotation.z = S(p + (i % 2) * 0.5) * 0.2; }); body.position.y = 0.55 + Math.abs(S(p * 2)) * 0.03; } };
};
U.bulwark = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0.45, 0);
  add(body, k.extrude('bulw', [[-0.4, -0.35], [0.3, -0.4], [0.5, 0], [0.3, 0.4], [-0.4, 0.35], [-0.5, 0]], 0.3, 0.05), k.m.gold, 0, 0, 0, Math.PI / 2);
  add(body, k.box(0.3, 0.14, 0.5, 0.05), k.m.ivory, -0.1, 0.2, 0);
  const shield = add(body, k.torus(0.42, 0.03, 32, Math.PI), k.m.energy, 0.45, 0.05, 0, 0, Math.PI / 2, Math.PI / 2);
  for (const z of [-0.18, 0.18]) add(body, k.cyl(0.05, 0.06, 0.5, 10), k.m.alloy, 0.45, 0.2, z, 0, 0, Math.PI / 2);
  add(body, k.oct(0.1), k.m.crystal, -0.15, 0.35, 0);
  add(body, k.box(0.08, 0.1, 0.3, 0.02), team, -0.42, 0.12, 0);
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const l = grp(body, Math.cos(a) * 0.3, -0.08, Math.sin(a) * 0.3);
    l.rotation.y = -a;
    add(l, k.box(0.34, 0.1, 0.12, 0.03), k.m.goldDark, 0.14, -0.08, 0, 0, 0, -0.7);
    add(l, k.box(0.1, 0.12, 0.16, 0.03), k.m.alloy, 0.28, -0.34, 0);
    legs.push(l);
  }
  return { root, pose: p => { legs.forEach((l, i) => { l.rotation.z = S(p + (i % 2) * 0.5) * 0.15; }); (shield.material as THREE.Material).opacity = 0.7; body.position.y = 0.45 + Math.abs(S(p * 2)) * 0.015; } };
};
U.strider = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 1.55, 0);
  add(body, k.lathe('strbody', [[0, -0.2], [0.38, -0.12], [0.44, 0.02], [0.3, 0.16], [0, 0.2]], 20), k.m.ivory, 0, 0, 0);
  add(body, k.torus(0.44, 0.04, 32), k.m.gold, 0, 0, 0, Math.PI / 2);
  for (const z of [-0.2, 0.2]) { add(body, k.cyl(0.05, 0.07, 0.5, 10), k.m.gold, 0.4, -0.05, z, 0, 0, Math.PI / 2); add(body, k.sphere(0.06), k.m.lamp, 0.66, -0.05, z); }
  add(body, k.oct(0.14), k.m.crystal, 0, 0.26, 0);
  add(body, k.box(0.16, 0.06, 0.2, 0.02), team, -0.3, 0.1, 0);
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 3;
    const l = grp(body, Math.cos(a) * 0.3, -0.1, Math.sin(a) * 0.3);
    l.rotation.y = -a;
    add(l, k.capsule(0.05, 0.9), k.m.gold, 0.4, -0.1, 0, 0, 0, -1.25);
    const lower = grp(l, 0.82, -0.3, 0);
    add(lower, k.capsule(0.04, 1.1), k.m.ivory, 0.12, -0.55, 0, 0, 0, -0.2);
    add(lower, k.cone(0.06, 0.14, 8), k.m.goldDark, 0.24, -1.12, 0, Math.PI, 0, 0);
    legs.push(l);
  }
  return { root, pose: p => { legs.forEach((l, i) => { l.rotation.z = S(p + i / 3) * 0.12; }); body.position.y = 1.55 + S(p * 3) * 0.04; body.rotation.y = S(p) * 0.06; } };
};
U.radiant = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0, 0);
  add(body, k.extrude('rad', [[0.95, 0], [-0.6, -0.75], [-0.35, 0], [-0.6, 0.75]], 0.12, 0.04), k.m.gold, 0, 0, 0, Math.PI / 2);
  add(body, k.extrude('rad2', [[0.6, 0], [-0.35, -0.4], [-0.2, 0], [-0.35, 0.4]], 0.08, 0.02), k.m.ivory, 0, 0.1, 0, Math.PI / 2);
  const prism = add(body, k.cone(0.2, 0.55, 3), k.m.crystal, 0.1, 0.2, 0, 0, 0, -Math.PI / 2);
  for (const z of [-1, 1]) add(body, k.box(0.3, 0.2, 0.02, 0.01), k.m.goldDark, -0.45, 0.12, z * 0.35, 0, 0, 0.3);
  add(body, k.box(0.14, 0.04, 0.2, 0.01), team, -0.25, 0.14, 0);
  add(body, k.sphere(0.05), k.m.energy, 0.62, 0.02, 0);
  return { root, air: 1.2, pose: p => { prism.rotation.x = p * TAU; body.rotation.x = S(p) * 0.04; } };
};
U.empyrean = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0, 0);
  add(body, k.torus(1.0, 0.16, 40, Math.PI * 1.3), k.m.gold, -0.35, 0, 0, Math.PI / 2, 0, Math.PI - 0.95, 1, 1, 0.6);
  add(body, k.lathe('empc', [[0, -0.18], [0.45, -0.1], [0.5, 0.02], [0.3, 0.16], [0, 0.2]], 24), k.m.ivory, 0.2, 0, 0, 0, 0, 0, 1.5, 1, 1);
  add(body, k.oct(0.2), k.m.crystal, 0.2, 0.28, 0, 0, 0, 0, 1, 1.4, 1);
  for (let i = 0; i < 7; i++) { const a = -1.3 + i * 0.43; add(body, k.oct(0.07), k.m.crystal, -0.35 + Math.cos(a) * 1.0, 0.1, Math.sin(a) * 1.0); }
  const engines: THREE.Mesh[] = [];
  for (const z of [-0.5, 0.5]) engines.push(add(body, k.sphere(0.1), k.m.energy, -1.3, 0, z));
  add(body, k.box(0.2, 0.05, 0.4, 0.02), team, -0.1, 0.18, 0);
  return { root, air: 1.6, pose: p => { engines.forEach((e, i) => { e.scale.setScalar(1 + S(p + i * 0.5) * 0.2); }); body.rotation.x = S(p) * 0.02; } };
};
U.hierophant = (k, team) => {
  const root = new THREE.Group();
  const body = grp(root, 0, 0.1, 0);
  add(body, k.lathe('hrobe', [[0, 0], [0.62, 0.05], [0.5, 0.5], [0.36, 0.95], [0.3, 1.2], [0, 1.25]], 24), k.m.ivory, 0, 0, 0);
  add(body, k.lathe('hrobe2', [[0.63, 0.05], [0.66, 0.12], [0.52, 0.5], [0.5, 0.45]], 24), k.m.gold, 0, 0, 0);
  add(body, k.box(0.3, 0.5, 0.5, 0.08), k.m.gold, 0.1, 1.2, 0);
  for (const z of [-1, 1]) { add(body, k.sphere(0.18), k.m.gold, 0.05, 1.42, z * 0.36, 0, 0, 0, 1, 0.8, 1); add(body, k.capsule(0.07, 0.4), k.m.ivory, 0.25, 1.2, z * 0.45, 0, 0, 1.0); add(body, k.oct(0.08), k.m.crystal, 0.5, 1.05, z * 0.45); }
  const head = grp(body, 0.08, 1.62, 0);
  add(head, k.sphere(0.13), k.m.ivory, 0, 0, 0, 0, 0, 0, 1, 1.15, 0.9);
  const halo = add(head, k.torus(0.28, 0.025, 32), k.m.energy, -0.08, 0.12, 0, 0, Math.PI / 2 - 0.3, 0);
  add(body, k.box(0.04, 0.3, 0.3, 0.01), team, -0.14, 1.2, 0);
  const shards: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) shards.push(add(body, k.oct(0.09), k.m.crystal, 0, 0, 0));
  return { root, pose: p => {
    body.position.y = 0.1 + S(p) * 0.05;
    halo.rotation.z = p * TAU;
    shards.forEach((s, i) => { const a = p * TAU + (i / 6) * TAU; s.position.set(Math.cos(a) * 0.95, 0.9 + S(p * 2 + i / 6) * 0.12, Math.sin(a) * 0.95); s.rotation.y = a * 2; });
  } };
};

// ================================================================== BUILDINGS
const B: Record<string, Builder> = {};
// footprint s (tiles) centred at origin; parts sized to fit s x s

// ---------------- Directorate
function bastionModel(k: Kit, team: THREE.Material, tier: number): ModelInst {
  const root = new THREE.Group();
  const s = 5;
  const oct = (r: number): [number, number][] => { const pts: [number, number][] = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } return pts; };
  add(root, k.extrude('bas0', oct(s * 0.52), 0.35, 0.08), k.m.hullDark, 0, 0.2, 0, Math.PI / 2);
  add(root, k.extrude('bas1', oct(s * 0.46), 0.5, 0.08), k.m.hull, 0, 0.55, 0, Math.PI / 2);
  add(root, k.cyl(1.25, 1.35, 0.3, 32), k.m.hullDark, 0, 0.95, 0);
  add(root, k.cyl(1.15, 1.15, 0.04, 32), k.m.pad, 0, 1.12, 0);
  for (const [x, z] of [[1.7, 1.7], [-1.7, 1.7], [1.7, -1.7], [-1.7, -1.7]]) {
    add(root, k.box(0.7, 0.9, 0.7, 0.1), k.m.hull, x, 0.95, z);
    add(root, k.box(0.5, 0.1, 0.5, 0.05), k.m.hullDark, x, 1.45, z);
    add(root, k.sphere(0.06), k.m.redLamp, x, 1.55, z);
  }
  add(root, k.box(0.5, 0.35, 1.8, 0.05), team, -2.1, 0.8, 0);
  add(root, k.box(1.6, 0.8, 0.9, 0.08), k.m.hullDark, 2.0, 0.6, 0);
  add(root, k.box(0.1, 0.5, 0.6, 0.02), k.m.hazard, 2.5, 0.55, 0);
  for (let i = 0; i < 6; i++) add(root, k.box(0.28, 0.06, 0.02, 0.01), k.m.lamp, -1.2 + i * 0.5, 0.82, 2.18);
  const lights: THREE.Mesh[] = [];
  const antenna = grp(root, -1.7, 1.5, -1.7);
  add(antenna, k.cyl(0.03, 0.05, 1.0, 6), k.m.gunmetal, 0, 0.5, 0);
  lights.push(add(antenna, k.sphere(0.07), k.m.redLamp, 0, 1.05, 0));
  let dish: THREE.Group | null = null;
  if (tier >= 2) {
    for (const [x, z] of [[1.7, -1.7], [-1.7, 1.7]]) {
      const t = grp(root, x, 1.55, z);
      add(t, k.cyl(0.3, 0.35, 0.3, 14), k.m.hullDark, 0, 0.1, 0);
      for (const dz of [-0.08, 0.08]) add(t, k.cyl(0.04, 0.04, 0.8, 8), k.m.gunmetal, 0.4, 0.2, dz, 0, 0, Math.PI / 2);
    }
    dish = grp(root, 1.7, 1.6, 1.7);
    add(dish, k.lathe('dish', [[0, 0], [0.45, 0.15], [0.5, 0.2]], 20), k.m.white, 0, 0.25, 0, 0.6, 0, 0);
    add(dish, k.cyl(0.04, 0.04, 0.3, 6), k.m.gunmetal, 0, 0.1, 0);
  }
  if (tier >= 3) {
    add(root, k.lathe('sdome', [[0, 0], [0.9, 0], [0.8, 0.4], [0.5, 0.7], [0, 0.8]], 28), k.m.glass, 0, 1.14, 0);
    const ring = add(root, k.torus(1.05, 0.08, 40), k.m.blueGlow, 0, 1.3, 0, Math.PI / 2);
    lights.push(ring);
    for (const [x, z] of [[2.2, 0], [-2.2, 0], [0, 2.2], [0, -2.2]]) add(root, k.cyl(0.2, 0.25, 1.4, 10), k.m.gunmetal, x * 0.9, 1.0, z * 0.9);
  }
  return { root, pose: p => { lights[0].scale.setScalar(0.7 + 0.5 * Math.max(0, S(p))); if (dish) dish.rotation.y = p * TAU; if (lights[1]) lights[1].rotation.z = p * TAU; } };
}
B.bastion = (k, t) => bastionModel(k, t, 1);
B.citadel = (k, t) => bastionModel(k, t, 2);
B.stronghold = (k, t) => bastionModel(k, t, 3);
B.habitat = (k, team) => {
  const root = new THREE.Group();
  add(root, k.box(1.9, 0.25, 1.9, 0.06), k.m.hullDark, 0, 0.12, 0);
  const domes: [number, number, number][] = [[-0.35, -0.35, 0.55], [0.45, 0.35, 0.45], [0.45, -0.45, 0.32]];
  for (const [x, z, r] of domes) {
    add(root, k.cyl(r, r, 0.3, 20), k.m.hull, x, 0.4, z);
    add(root, k.lathe(`hdome${r}`, [[0, 0], [r, 0], [r * 0.85, r * 0.45], [r * 0.5, r * 0.75], [0, r * 0.82]], 20), k.m.white, x, 0.55, z);
    add(root, k.torus(r * 0.75, 0.02, 24), k.m.lamp, x, 0.62, z, Math.PI / 2);
  }
  add(root, k.box(0.5, 0.15, 0.14, 0.03), team, -0.4, 0.35, 0.8);
  add(root, k.box(0.1, 0.3, 0.6, 0.03), k.m.hazard, 0.9, 0.3, 0);
  const lamp = add(root, k.sphere(0.06), k.m.redLamp, -0.8, 0.6, -0.8);
  return { root, pose: p => { lamp.scale.setScalar(0.6 + 0.5 * Math.max(0, S(p))); } };
};
B.extractor = (k, team) => {
  const root = new THREE.Group();
  add(root, k.box(2.8, 0.3, 2.8, 0.08), k.m.hullDark, 0, 0.15, 0);
  add(root, k.cyl(0.8, 0.9, 0.7, 20), k.m.hull, 0, 0.6, 0);
  add(root, k.cyl(0.55, 0.55, 0.1, 20), k.m.fluxGlow, 0, 0.98, 0);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { add(root, k.cyl(0.28, 0.3, 1.0, 14), k.m.hull, x, 0.7, z); add(root, k.torus(0.3, 0.03, 16), k.m.hazard, x, 1.0, z, Math.PI / 2); }
  add(root, k.tube('pipe1', [[1, 0.9, 1], [0.6, 1.2, 0.4], [0, 1.0, 0]], 0.07), k.m.gunmetal);
  add(root, k.tube('pipe2', [[-1, 0.9, -1], [-0.6, 1.2, -0.4], [0, 1.0, 0]], 0.07), k.m.gunmetal);
  const derrick = grp(root, 0, 1.0, 0);
  for (const a of [0, 1, 2]) add(derrick, k.cyl(0.03, 0.05, 1.4, 6), k.m.gunmetal, Math.cos(a * 2.1) * 0.25, 0.6, Math.sin(a * 2.1) * 0.25, Math.sin(a * 2.1) * 0.18, 0, -Math.cos(a * 2.1) * 0.18);
  add(derrick, k.box(0.4, 0.2, 0.3, 0.03), team, 0, 1.3, 0);
  const lamp = add(derrick, k.sphere(0.07), k.m.redLamp, 0, 1.45, 0);
  const glow = add(root, k.sphere(0.4, 16, 10), k.m.fluxGlow, 0, 0.95, 0, 0, 0, 0, 1, 0.2, 1);
  return { root, pose: p => { lamp.scale.setScalar(0.6 + 0.6 * Math.max(0, S(p))); glow.scale.set(1 + S(p) * 0.1, 0.2, 1 + S(p) * 0.1); derrick.position.y = 1.0 + S(p) * 0.08; } };
};
B.musterhall = (k, team) => {
  const root = new THREE.Group();
  add(root, k.box(2.9, 0.2, 2.9, 0.05), k.m.hullDark, 0, 0.1, 0);
  add(root, k.box(2.4, 0.9, 2.2, 0.1), k.m.hull, -0.1, 0.65, 0);
  add(root, k.cyl(1.1, 1.1, 2.3, 24, ), k.m.hullDark, -0.1, 1.1, 0, Math.PI / 2, 0, 0, 1, 1, 0.45);
  add(root, k.box(0.12, 0.7, 1.0, 0.03), k.m.gunmetal, 1.15, 0.55, 0);
  add(root, k.box(0.14, 0.1, 1.1, 0.02), k.m.hazard, 1.16, 0.95, 0);
  for (let i = 0; i < 4; i++) add(root, k.box(0.02, 0.12, 0.2, 0.01), k.m.lamp, 1.12, 0.75, -0.35 + i * 0.23);
  add(root, k.box(1.6, 0.4, 0.06, 0.02), team, -0.2, 0.75, 1.12);
  const flagPole = grp(root, -1.1, 1.1, 1.0);
  add(flagPole, k.cyl(0.02, 0.02, 1.2, 6), k.m.gunmetal, 0, 0.6, 0);
  const flag = add(flagPole, k.box(0.4, 0.25, 0.01, 0.005), team, 0.2, 1.05, 0);
  for (const x of [-0.8, 0.4]) add(root, k.box(0.3, 0.3, 0.3, 0.05), k.m.gunmetal, x, 1.55, -0.3);
  return { root, pose: p => { flag.rotation.y = S(p) * 0.25; flag.scale.x = 1 + S(p * 2) * 0.05; } };
};
B.arsenal = (k, team) => {
  const root = new THREE.Group();
  add(root, k.box(2.9, 0.2, 2.9, 0.05), k.m.hullDark, 0, 0.1, 0);
  add(root, k.extrude('ars', [[-1.3, 0], [1.3, 0], [1.1, 0.9], [-1.1, 0.9]], 2.3, 0.06), k.m.hullDark, 0, 0.2, 0);
  add(root, k.box(1.6, 0.2, 1.4, 0.05), k.m.hull, 0, 1.2, 0);
  for (const z of [-0.5, 0.5]) add(root, k.cyl(0.08, 0.1, 1.4, 12), k.m.gunmetal, 0.2, 1.4, z, 0, 0, Math.PI / 2 - 0.4);
  for (let i = 0; i < 3; i++) add(root, k.box(0.4, 0.3, 0.4, 0.03), i % 2 ? k.m.hazard : k.m.hullDark, 1.1, 0.35 + i * 0.001, -1 + i * 0.45);
  add(root, k.box(0.5, 0.35, 0.06, 0.02), team, -0.5, 0.6, 1.16);
  const crane = grp(root, -1.0, 1.3, -0.9);
  add(crane, k.box(0.08, 0.08, 1.2, 0.02), k.m.hazard, 0, 0.2, 0.5);
  add(crane, k.cyl(0.05, 0.05, 0.4, 6), k.m.gunmetal, 0, 0, 0);
  return { root, pose: p => { crane.rotation.y = S(p) * 0.6; } };
};
B.turret = (k, team) => {
  const root = new THREE.Group();
  add(root, k.cyl(0.9, 1.0, 0.35, 8), k.m.hullDark, 0, 0.18, 0);
  add(root, k.cyl(0.6, 0.7, 0.4, 16), k.m.hull, 0, 0.55, 0);
  add(root, k.torus(0.65, 0.04, 24), k.m.hazard, 0, 0.72, 0, Math.PI / 2);
  const tur = grp(root, 0, 0.85, 0);
  add(tur, k.box(0.6, 0.35, 0.6, 0.08), k.m.hull, 0, 0.1, 0);
  for (const z of [-0.14, 0.14]) { add(tur, k.cyl(0.045, 0.05, 0.8, 10), k.m.gunmetal, 0.55, 0.12, z, 0, 0, Math.PI / 2); add(tur, k.cyl(0.07, 0.07, 0.1, 10), k.m.hullDark, 0.95, 0.12, z, 0, 0, Math.PI / 2); }
  add(tur, k.box(0.2, 0.1, 0.3, 0.03), team, -0.25, 0.3, 0);
  add(tur, k.sphere(0.05), k.m.visor, 0.3, 0.3, 0);
  return { root, pose: p => { tur.rotation.y = S(p) * 0.5; } };
};
B.foundry = (k, team) => {
  const root = new THREE.Group();
  add(root, k.box(2.9, 0.2, 2.9, 0.05), k.m.hullDark, 0, 0.1, 0);
  add(root, k.box(2.5, 1.1, 2.3, 0.1), k.m.hull, 0, 0.75, 0);
  add(root, k.box(0.12, 0.8, 1.3, 0.03), k.m.gunmetal, 1.26, 0.6, 0);
  add(root, k.box(0.14, 0.12, 1.4, 0.02), k.m.hazard, 1.27, 1.05, 0);
  const stacks: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.7, -0.6], [-0.2, -0.6]]) { add(root, k.cyl(0.18, 0.22, 1.2, 14), k.m.gunmetal, x, 1.8, z); stacks.push(add(root, k.cyl(0.15, 0.15, 0.04, 14), k.m.lamp, x, 2.41, z)); }
  add(root, k.box(0.7, 0.25, 2.4, 0.03), k.m.hullDark, 0.6, 1.4, 0);
  add(root, k.box(1.5, 0.1, 0.1, 0.02), k.m.hazard, 0.3, 1.9, 0.9);
  add(root, k.box(0.8, 0.3, 0.06, 0.02), team, -0.5, 0.9, 1.16);
  return { root, pose: p => { stacks.forEach((s, i) => { (s.material as THREE.MeshStandardMaterial); s.scale.setScalar(0.8 + 0.3 * Math.max(0, S(p + i * 0.5))); }); } };
};
B.skyport = (k, team) => {
  const root = new THREE.Group();
  add(root, k.box(2.9, 0.3, 2.9, 0.06), k.m.hullDark, 0, 0.15, 0);
  add(root, k.box(2.6, 0.06, 1.2, 0.02), k.m.gunmetal, 0, 0.33, 0.4);
  const lights: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) lights.push(add(root, k.box(0.12, 0.04, 0.06, 0.01), k.m.lamp, -1.1 + i * 0.44, 0.37, 0.95));
  add(root, k.box(1.0, 0.8, 0.9, 0.08), k.m.hull, -0.8, 0.7, -0.8);
  const tower = grp(root, 0.9, 0.3, -0.9);
  add(tower, k.cyl(0.18, 0.25, 1.4, 10), k.m.hull, 0, 0.7, 0);
  add(tower, k.cyl(0.38, 0.3, 0.3, 12), k.m.glass, 0, 1.5, 0);
  add(tower, k.cyl(0.4, 0.4, 0.06, 12), k.m.hullDark, 0, 1.68, 0);
  add(tower, k.sphere(0.06), k.m.redLamp, 0, 1.8, 0);
  add(root, k.box(0.8, 0.2, 0.06, 0.02), team, -0.8, 0.8, -0.34);
  return { root, pose: p => { lights.forEach((l, i) => { l.scale.setScalar(Math.floor(p * 6) === i ? 1.6 : 0.6); }); } };
};
B.fusionworks = (k, team) => {
  const root = new THREE.Group();
  add(root, k.box(2.9, 0.3, 2.9, 0.06), k.m.hullDark, 0, 0.15, 0);
  add(root, k.cyl(1.2, 1.3, 0.6, 24), k.m.hull, 0, 0.6, 0);
  const core = add(root, k.sphere(0.55, 24, 16), k.m.blueGlow, 0, 1.25, 0);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) rings.push(add(root, k.torus(0.85 + i * 0.12, 0.05, 40), i === 1 ? k.m.hull : k.m.gunmetal, 0, 1.25, 0, Math.PI / 2 + i * 0.5, i * 0.7, 0));
  for (const [x, z] of [[1.1, 1.1], [-1.1, 1.1], [1.1, -1.1], [-1.1, -1.1]]) { add(root, k.cyl(0.12, 0.16, 1.4, 10), k.m.gunmetal, x, 0.9, z); add(root, k.sphere(0.1), k.m.blueGlow, x, 1.65, z); }
  add(root, k.box(0.6, 0.2, 0.06, 0.02), team, 0, 0.6, 1.3);
  return { root, pose: p => { rings.forEach((r, i) => { r.rotation.z = p * TAU * (i % 2 ? 1 : -1); }); core.scale.setScalar(1 + S(p) * 0.06); } };
};

// ---------------- Kyrrh
function mound(k: Kit, parent: THREE.Object3D, r: number, h: number, seed: number, mat: THREE.Material) {
  return add(parent, k.blob(r, seed, 0.1, 3), mat, 0, h * 0.2, 0, 0, 0, 0, 1, h / r, 1);
}
function hiveModel(k: Kit, team: THREE.Material, tier: number): ModelInst {
  const root = new THREE.Group();
  mound(k, root, 2.5, 1.1, 81, k.m.chitinDark);
  mound(k, root, 2.0, 1.5, 82, k.m.flesh).position.y = 0.3;
  const ribs = 8 + tier * 3;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * TAU;
    const len = 1.0 + tier * 0.35;
    add(root, k.tube(`rib${tier}${i}`, [[Math.cos(a) * 1.3, 0.5, Math.sin(a) * 1.3], [Math.cos(a) * 1.9, 1.2 + len * 0.3, Math.sin(a) * 1.9], [Math.cos(a) * 2.2, 0.8 + len * 0.6, Math.sin(a) * 2.2]], 0.1, true), k.m.bone);
  }
  const maw = add(root, k.sphere(0.6, 20, 12), k.m.maw, 0, 1.55, 0, 0, 0, 0, 1, 0.45, 1);
  const eye = add(root, k.sphere(0.35, 20, 12), tier === 3 ? k.m.violet : k.m.gland, 0, 1.62, 0, 0, 0, 0, 1, 0.5, 1);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; add(root, k.sphere(0.14), k.m.gland, Math.cos(a) * 1.5, 0.9, Math.sin(a) * 1.5); }
  if (tier >= 2) for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; add(root, k.cone(0.16, 1.1, 8), k.m.chitin, Math.cos(a) * 1.0, 1.9, Math.sin(a) * 1.0, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
  if (tier >= 3) { for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; add(root, k.cone(0.09, 0.9, 6), k.m.bone, Math.cos(a) * 0.55, 2.3, Math.sin(a) * 0.55, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); } }
  add(root, k.sphere(0.18), team, 1.6, 0.7, 1.2);
  return { root, pose: p => { maw.scale.set(1 + S(p) * 0.08, 0.45 + S(p) * 0.06, 1 + S(p) * 0.08); eye.scale.set(1, 0.5 + S(p) * 0.08, 1); } };
}
B.nest = (k, t) => hiveModel(k, t, 1);
B.sanctum = (k, t) => hiveModel(k, t, 2);
B.throne = (k, t) => hiveModel(k, t, 3);
B.siphon = (k, team) => {
  const root = new THREE.Group();
  mound(k, root, 1.35, 0.6, 91, k.m.chitinDark);
  add(root, k.lathe('siph', [[0.7, 0], [0.55, 0.5], [0.4, 1.0], [0.5, 1.3], [0.35, 1.4]], 18), k.m.flesh, 0, 0.3, 0);
  const glow = add(root, k.cyl(0.33, 0.33, 0.05, 16), k.m.fluxGlow, 0, 1.72, 0);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; add(root, k.tube(`sten${i}`, [[Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5], [Math.cos(a) * 1.0, 0.5, Math.sin(a) * 1.0], [Math.cos(a) * 1.3, 0.1, Math.sin(a) * 1.3]], 0.1, true), k.m.chitin); }
  add(root, k.sphere(0.12), team, 0.9, 0.6, 0.6);
  return { root, pose: p => { glow.scale.setScalar(1 + S(p) * 0.15); } };
};
B.mire = (k, team) => {
  const root = new THREE.Group();
  mound(k, root, 1.45, 0.45, 101, k.m.chitinDark);
  add(root, k.cyl(1.05, 1.05, 0.05, 28), k.m.goo, 0, 0.42, 0);
  const bubbles: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) bubbles.push(add(root, k.sphere(0.1), k.m.gland, Math.cos(i * 2.3) * 0.6, 0.45, Math.sin(i * 2.3) * 0.5));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; add(root, k.tube(`mrib${i}`, [[Math.cos(a) * 1.2, 0.3, Math.sin(a) * 1.2], [Math.cos(a) * 1.25, 1.0, Math.sin(a) * 1.25], [Math.cos(a) * 0.9, 1.3, Math.sin(a) * 0.9]], 0.07, true), k.m.bone); }
  add(root, k.sphere(0.12), team, 1.1, 0.4, 0.8);
  return { root, pose: p => { bubbles.forEach((b, i) => { const q = (p + i / 6) % 1; b.position.y = 0.42 + q * 0.3; b.scale.setScalar(0.5 + q); }); } };
};
B.mutagen = (k, team) => {
  const root = new THREE.Group();
  mound(k, root, 1.4, 0.55, 111, k.m.chitin);
  const pods: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; pods.push(add(root, k.blob(0.45, 112 + i, 0.08, 2), k.m.flesh, Math.cos(a) * 0.5, 0.95, Math.sin(a) * 0.5, 0, 0, 0, 1, 1.4, 1)); }
  add(root, k.sphere(0.3), k.m.gland, 0, 1.45, 0);
  add(root, k.sphere(0.12), team, 1.0, 0.5, 0.8);
  return { root, pose: p => { pods.forEach((d, i) => { d.scale.set(1 + S(p + i / 3) * 0.06, 1.4 + S(p + i / 3) * 0.1, 1 + S(p + i / 3) * 0.06); }); } };
};
B.warren = (k, team) => {
  const root = new THREE.Group();
  mound(k, root, 1.45, 0.7, 121, k.m.chitinDark);
  for (let i = 0; i < 3; i++) { const x = -0.6 + i * 0.6; add(root, k.torus(0.3, 0.12, 16), k.m.flesh, x, 0.75, Math.sin(i) * 0.3, Math.PI / 2 - 0.4); add(root, k.cyl(0.26, 0.26, 0.05, 14), k.m.maw, x, 0.8, Math.sin(i) * 0.3); }
  const glow = add(root, k.sphere(0.2), k.m.gland, 0, 1.1, -0.6);
  add(root, k.sphere(0.12), team, 1.0, 0.5, 0.8);
  return { root, pose: p => { glow.scale.setScalar(1 + S(p) * 0.2); } };
};
B.quillden = (k, team) => {
  const root = new THREE.Group();
  mound(k, root, 1.4, 0.75, 131, k.m.flesh);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; add(root, k.cone(0.07, 1.1, 6), k.m.bone, Math.cos(a) * 0.8, 1.0, Math.sin(a) * 0.8, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); }
  const eye = add(root, k.sphere(0.25), k.m.gland, 0, 1.15, 0);
  add(root, k.sphere(0.12), team, 1.0, 0.5, 0.8);
  return { root, pose: p => { eye.scale.setScalar(1 + S(p) * 0.12); } };
};
function aerieModel(k: Kit, team: THREE.Material, elder: boolean): ModelInst {
  const root = new THREE.Group();
  mound(k, root, 1.4, 0.55, elder ? 141 : 142, k.m.chitinDark);
  const h = elder ? 3.2 : 2.4;
  add(root, k.lathe(`spire${elder}`, [[0.7, 0], [0.5, h * 0.3], [0.3, h * 0.7], [0.12, h]], 16), k.m.chitin, 0, 0.3, 0);
  const vanes: THREE.Group[] = [];
  const n = elder ? 5 : 3;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const v = grp(root, Math.cos(a) * 0.3, h * 0.55, Math.sin(a) * 0.3); v.rotation.y = -a; add(v, wing(k, 'vane', 1.1, 0.9), k.m.membrane, 0, 0, 0, Math.PI / 2 + 0.3, 0, 0); vanes.push(v); }
  const top = add(root, k.sphere(elder ? 0.3 : 0.22), elder ? k.m.violet : k.m.gland, 0, h + 0.35, 0);
  add(root, k.sphere(0.12), team, 1.0, 0.5, 0.8);
  return { root, pose: p => { vanes.forEach((v, i) => { v.rotation.z = S(p + i / n) * 0.12; }); top.scale.setScalar(1 + S(p) * 0.15); } };
}
B.aerie = (k, t) => aerieModel(k, t, false);
B.elderaerie = (k, t) => aerieModel(k, t, true);
B.cavern = (k, team) => {
  const root = new THREE.Group();
  mound(k, root, 1.45, 0.65, 151, k.m.chitinDark);
  add(root, k.torus(1.0, 0.18, 24, Math.PI), k.m.bone, 0, 0.35, 0, 0, 0.3, 0);
  add(root, k.torus(0.75, 0.13, 24, Math.PI), k.m.bone, 0, 0.35, 0, 0, 1.4, 0);
  add(root, k.sphere(0.6, 20, 12), k.m.maw, 0, 0.5, 0, 0, 0, 0, 1, 0.35, 1);
  const glow = add(root, k.sphere(0.25), k.m.redLamp, 0, 0.55, 0);
  add(root, k.sphere(0.12), team, 1.0, 0.5, 0.8);
  return { root, pose: p => { glow.scale.setScalar(0.8 + 0.3 * Math.max(0, S(p))); } };
};
B.thorn = (k, team) => {
  const root = new THREE.Group();
  mound(k, root, 0.9, 0.45, 161, k.m.flesh);
  const spine = grp(root, 0, 0.5, 0);
  add(spine, k.tube('thorn', [[0, 0, 0], [0.2, 0.7, 0], [0.55, 1.0, 0], [1.0, 0.95, 0]], 0.13, true), k.m.bone);
  add(spine, k.blob(0.25, 162, 0.1, 2), k.m.chitin, 0, 0.1, 0);
  add(root, k.sphere(0.1), team, 0.6, 0.4, 0.5);
  return { root, pose: p => { spine.rotation.y = S(p) * 0.6; spine.rotation.z = S(p * 2) * 0.05; } };
};

// ---------------- Aethel
function platform(k: Kit, parent: THREE.Object3D, s: number, h = 0.3) {
  const r = s * 0.5;
  const pts: [number, number][] = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  add(parent, k.extrude(`plat${s}${h}`, pts, h, 0.05), k.m.gold, 0, h / 2 + 0.02, 0, Math.PI / 2);
  const pts2 = pts.map(([x, y]) => [x * 0.8, y * 0.8] as [number, number]);
  add(parent, k.extrude(`plat2${s}`, pts2, 0.12, 0.03), k.m.ivory, 0, h + 0.1, 0, Math.PI / 2);
}
function coreModel(k: Kit, team: THREE.Material, tier: number): ModelInst {
  const root = new THREE.Group();
  platform(k, root, 5, 0.4);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; add(root, k.extrude('fin', [[0, 0], [0.5, 0], [0.2, 1.6]], 0.2, 0.04), k.m.gold, Math.cos(a) * 1.5, 0.5, Math.sin(a) * 1.5, 0, -a, 0); }
  const cr = add(root, k.oct(0.75), k.m.crystal, 0, 2.2, 0, 0, 0, 0, 1, 1.5, 1);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < tier + 1; i++) rings.push(add(root, k.torus(1.25 + i * 0.25, 0.05, 48), i % 2 ? k.m.gold : k.m.ivory, 0, 1.9, 0, Math.PI / 2 + 0.3 * i, 0, 0));
  if (tier >= 2) for (const z of [-1.4, 1.4]) add(root, k.oct(0.3), k.m.crystal, 0, 1.2, z, 0, 0, 0, 1, 1.6, 1);
  if (tier >= 3) { add(root, k.torus(1.9, 0.07, 48), k.m.energy, 0, 0.8, 0, Math.PI / 2); for (const x of [-1.4, 1.4]) add(root, k.oct(0.3), k.m.crystal, x, 1.2, 0, 0, 0, 0, 1, 1.6, 1); }
  add(root, k.box(0.4, 0.14, 0.4, 0.04), team, 2.0, 0.55, 0);
  return { root, pose: p => { cr.rotation.y = p * TAU; cr.position.y = 2.2 + S(p) * 0.1; rings.forEach((r, i) => { r.rotation.z = p * TAU * (i % 2 ? -1 : 1); }); } };
}
B.core = (k, t) => coreModel(k, t, 1);
B.radiantcore = (k, t) => coreModel(k, t, 2);
B.exaltedcore = (k, t) => coreModel(k, t, 3);
B.obelisk = (k, team) => {
  const root = new THREE.Group();
  platform(k, root, 1.9, 0.25);
  add(root, k.cyl(0.3, 0.45, 0.4, 8), k.m.goldDark, 0, 0.55, 0);
  const cr = add(root, k.oct(0.4), k.m.crystal, 0, 1.55, 0, 0, 0, 0, 0.8, 2.2, 0.8);
  const ring = add(root, k.torus(0.55, 0.03, 32), k.m.gold, 0, 1.3, 0, Math.PI / 2);
  add(root, k.box(0.2, 0.1, 0.2, 0.03), team, 0.7, 0.4, 0.3);
  return { root, pose: p => { cr.rotation.y = p * TAU; ring.position.y = 1.2 + S(p) * 0.25; } };
};
B.tap = (k, team) => {
  const root = new THREE.Group();
  platform(k, root, 2.9, 0.3);
  add(root, k.lathe('tapdome', [[1.0, 0], [0.9, 0.5], [0.55, 0.9], [0, 1.0]], 24), k.m.gold, 0, 0.45, 0);
  const glow = add(root, k.torus(0.7, 0.06, 32), k.m.fluxGlow, 0, 0.95, 0, Math.PI / 2);
  add(root, k.oct(0.2), k.m.crystal, 0, 1.6, 0);
  add(root, k.box(0.3, 0.12, 0.3, 0.03), team, 1.1, 0.5, 0);
  return { root, pose: p => { glow.scale.setScalar(1 + S(p) * 0.06); } };
};
B.portal = (k, team) => {
  const root = new THREE.Group();
  platform(k, root, 2.9, 0.3);
  add(root, k.torus(0.95, 0.14, 40, Math.PI), k.m.gold, 0, 0.45, 0, 0, Math.PI / 2, 0);
  const gate = add(root, k.cyl(0.85, 0.85, 0.03, 32, ), k.m.energy, 0, 0.45, 0, Math.PI / 2, Math.PI / 2, 0, 1, 1, 1);
  for (const z of [-1, 1]) add(root, k.box(0.3, 0.9, 0.3, 0.06), k.m.ivory, 0, 0.8, z * 0.95);
  add(root, k.oct(0.18), k.m.crystal, 0, 1.55, 0);
  add(root, k.box(0.3, 0.12, 0.3, 0.03), team, -1.0, 0.5, 0.6);
  return { root, pose: p => { gate.scale.set(1, 1, 1); (gate.material as THREE.MeshStandardMaterial).opacity = 0.35 + 0.25 * (0.5 + 0.5 * S(p)); gate.rotation.y = Math.PI / 2 + S(p) * 0.02; } };
};
B.resonance = (k, team) => {
  const root = new THREE.Group();
  platform(k, root, 2.9, 0.3);
  add(root, k.cyl(0.5, 0.7, 0.6, 8), k.m.ivory, 0, 0.75, 0);
  const crs: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) crs.push(add(root, k.oct(0.22), k.m.crystal, 0, 0, 0, 0, 0, 0, 1, 1.6, 1));
  add(root, k.sphere(0.25), k.m.energy, 0, 1.3, 0);
  add(root, k.box(0.3, 0.12, 0.3, 0.03), team, 1.1, 0.5, 0.3);
  return { root, pose: p => { crs.forEach((c, i) => { const a = p * TAU + (i / 3) * TAU; c.position.set(Math.cos(a) * 0.9, 1.3 + S(p * 2 + i / 3) * 0.1, Math.sin(a) * 0.9); c.rotation.y = a; }); } };
};
B.crucible = (k, team) => {
  const root = new THREE.Group();
  platform(k, root, 2.9, 0.3);
  add(root, k.lathe('cruc', [[0.4, 0], [0.9, 0.3], [1.0, 0.7], [0.85, 0.72], [0.75, 0.4]], 24), k.m.gold, 0, 0.45, 0);
  const molten = add(root, k.cyl(0.8, 0.8, 0.04, 24), k.m.lamp, 0, 1.05, 0);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; add(root, k.capsule(0.05, 0.9), k.m.goldDark, Math.cos(a) * 0.8, 1.5, Math.sin(a) * 0.8, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
  add(root, k.oct(0.15), k.m.crystal, 0, 1.9, 0);
  add(root, k.box(0.3, 0.12, 0.3, 0.03), team, 1.1, 0.5, 0.3);
  return { root, pose: p => { molten.scale.set(1, 1 + S(p), 1); } };
};
B.spire = (k, team) => {
  const root = new THREE.Group();
  platform(k, root, 1.9, 0.25);
  add(root, k.lathe('spire', [[0.4, 0], [0.3, 0.6], [0.2, 1.1], [0.25, 1.3]], 8), k.m.gold, 0, 0.4, 0);
  const cr = add(root, k.oct(0.3), k.m.crystal, 0, 2.05, 0, 0, 0, 0, 0.8, 1.8, 0.8);
  add(root, k.torus(0.35, 0.03, 24), k.m.energy, 0, 1.75, 0, Math.PI / 2);
  add(root, k.box(0.2, 0.1, 0.2, 0.03), team, 0.6, 0.4, 0.4);
  return { root, pose: p => { cr.rotation.y = p * TAU; } };
};
B.makerforge = (k, team) => {
  const root = new THREE.Group();
  platform(k, root, 2.9, 0.3);
  for (const [x, z] of [[0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [-0.9, -0.9]]) add(root, k.box(0.2, 1.6, 0.2, 0.05), k.m.gold, x, 1.2, z);
  add(root, k.box(2.0, 0.14, 0.2, 0.04), k.m.gold, 0, 2.0, 0.9); add(root, k.box(2.0, 0.14, 0.2, 0.04), k.m.gold, 0, 2.0, -0.9);
  const loom = grp(root, 0, 1.2, 0);
  for (let i = 0; i < 5; i++) add(loom, k.box(1.7, 0.02, 0.02, 0.005), k.m.energy, 0, -0.5 + i * 0.25, 0);
  add(root, k.oct(0.3), k.m.crystal, 0, 1.2, 0);
  add(root, k.box(0.3, 0.12, 0.3, 0.03), team, 1.1, 0.5, 0.2);
  return { root, pose: p => { loom.position.y = 1.2 + S(p) * 0.3; loom.rotation.y = p * Math.PI; } };
};
B.skyforge = (k, team) => {
  const root = new THREE.Group();
  platform(k, root, 2.9, 0.3);
  const arms: THREE.Group[] = [];
  for (const z of [-1, 1]) { const a = grp(root, -0.4, 0.5, z * 0.9); add(a, k.extrude('sfarm', [[0, 0], [1.6, 0.3], [1.7, 0.55], [0, 0.4]], 0.2, 0.04), k.m.gold, 0, 0, 0, 0, 0, 0); arms.push(a); }
  const ship = add(root, k.extrude('sfship', [[0.6, 0], [-0.4, -0.3], [-0.25, 0], [-0.4, 0.3]], 0.1, 0.02), k.m.ivory, 0.2, 1.0, 0, Math.PI / 2);
  add(root, k.oct(0.2), k.m.crystal, 0.2, 1.25, 0);
  add(root, k.box(0.3, 0.12, 0.3, 0.03), team, -1.1, 0.5, 0);
  return { root, pose: p => { ship.position.y = 1.0 + S(p) * 0.08; arms.forEach((a, i) => { a.rotation.x = (i ? -1 : 1) * S(p) * 0.05; }); } };
};
B.archive = (k, team) => {
  const root = new THREE.Group();
  platform(k, root, 2.9, 0.3);
  const p1 = add(root, k.cone(0.8, 1.2, 4), k.m.gold, 0, 1.35, 0);
  const p2 = add(root, k.cone(0.55, 0.8, 4), k.m.violet, 0, 2.35, 0, Math.PI, 0, 0);
  const ring = add(root, k.torus(1.1, 0.04, 48), k.m.energy, 0, 1.3, 0, Math.PI / 2);
  add(root, k.box(0.3, 0.12, 0.3, 0.03), team, 1.1, 0.5, 0.3);
  return { root, pose: p => { p1.rotation.y = p * TAU * 0.25; p2.rotation.y = -p * TAU * 0.25; p2.position.y = 2.35 + S(p) * 0.1; ring.rotation.x = Math.PI / 2 + S(p) * 0.3; } };
};

// ================================================================== RESOURCES + PROPS
export function mineralModel(k: Kit, variant: number): ModelInst {
  const root = new THREE.Group();
  const r = rng(variant * 31 + 7);
  add(root, k.blob(0.5, variant, 0.2, 1), k.m.rockDark, 0, 0.02, 0, 0, 0, 0, 1.6, 0.25, 0.8);
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.45 + r() * 0.55, w = 0.1 + r() * 0.08;
    add(root, k.cyl(w * 0.35, w, h, 6), k.m.mineral, -0.7 + (i / (n - 1)) * 1.4 + (r() - 0.5) * 0.15, h / 2, (r() - 0.5) * 0.35, (r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5);
    add(root, k.cone(w * 0.35, 0.12, 6), k.m.mineral, 0, 0, 0).visible = false;
  }
  return { root, pose: () => {} };
}
export function geyserModel(k: Kit): ModelInst {
  const root = new THREE.Group();
  add(root, k.blob(1.4, 201, 0.15, 2), k.m.rock, 0, 0.05, 0, 0, 0, 0, 1, 0.28, 1);
  add(root, k.lathe('vent', [[1.0, 0], [0.8, 0.35], [0.55, 0.45], [0.45, 0.3]], 24), k.m.rockDark, 0, 0.1, 0);
  const glow = add(root, k.cyl(0.45, 0.45, 0.04, 20), k.m.fluxGlow, 0, 0.42, 0);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; add(root, k.blob(0.25, 202 + i, 0.2, 1), k.m.rock, Math.cos(a) * 1.1, 0.12, Math.sin(a) * 1.1); }
  return { root, pose: p => { glow.scale.setScalar(1 + S(p) * 0.08); } };
}
export function propModel(k: Kit, kind: 'rock' | 'plant' | 'bones' | 'crystal', seed: number): ModelInst {
  const root = new THREE.Group();
  const r = rng(seed);
  if (kind === 'rock') { for (let i = 0; i < 3; i++) add(root, k.blob(0.2 + r() * 0.25, seed + i, 0.25, 1), k.m.rock, (r() - 0.5) * 0.5, 0.08, (r() - 0.5) * 0.5, 0, r() * 3, 0, 1, 0.6, 1); }
  else if (kind === 'plant') { for (let i = 0; i < 5; i++) add(root, k.tube(`pl${seed}${i}`, [[0, 0, 0], [(r() - 0.5) * 0.3, 0.25, (r() - 0.5) * 0.3], [(r() - 0.5) * 0.5, 0.45 + r() * 0.2, (r() - 0.5) * 0.5]], 0.03, true), k.m.plant); add(root, k.sphere(0.05), k.m.fluxGlow, 0, 0.1, 0); }
  else if (kind === 'bones') { add(root, k.tube(`bn${seed}`, [[-0.4, 0.05, 0], [0, 0.3, 0.1], [0.4, 0.05, 0]], 0.05, true), k.m.bone); add(root, k.sphere(0.12), k.m.bone, -0.45, 0.08, 0, 0, 0, 0, 1.3, 0.8, 1); }
  else { for (let i = 0; i < 3; i++) add(root, k.cone(0.06, 0.3 + r() * 0.2, 5), k.m.crystal, (r() - 0.5) * 0.3, 0.15, (r() - 0.5) * 0.3, (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6); }
  return { root, pose: () => {} };
}

export const UNIT_MODELS = U;
export const BUILDING_MODELS = B;

export function buildModel(k: Kit, id: string, team: THREE.Material, variant?: string): ModelInst | null {
  const f = U[id] ?? B[id];
  return f ? f(k, team, variant) : null;
}
export function teamMaterial(color: string) {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), metalness: 0.45, roughness: 0.35, clearcoat: 0.6, emissive: new THREE.Color(color), emissiveIntensity: 0.25 });
}
