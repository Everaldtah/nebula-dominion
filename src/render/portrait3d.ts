import * as THREE from 'three';
import { DEFS, Race } from '../sim/data';

type Anim = (t: number) => void;
interface Model { group: THREE.Group; anim: Anim }

const mats = {
  steel: () => new THREE.MeshStandardMaterial({ color: 0x8795a3, metalness: 0.75, roughness: 0.35 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x2f3842, metalness: 0.6, roughness: 0.5 }),
  orange: () => new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8a20, emissiveIntensity: 0.8 }),
  flesh: () => new THREE.MeshStandardMaterial({ color: 0x7a3a70, metalness: 0.05, roughness: 0.55 }),
  carapace: () => new THREE.MeshStandardMaterial({ color: 0x3d1737, metalness: 0.3, roughness: 0.3 }),
  bone: () => new THREE.MeshStandardMaterial({ color: 0xe8dcb8, roughness: 0.6 }),
  gland: () => new THREE.MeshStandardMaterial({ color: 0xc8ff5a, emissive: 0x88ff22, emissiveIntensity: 1 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xd9b45a, metalness: 1, roughness: 0.22 }),
  ivory: () => new THREE.MeshStandardMaterial({ color: 0xf5efe0, metalness: 0.3, roughness: 0.3 }),
  crystal: () => new THREE.MeshStandardMaterial({ color: 0x5ef0ff, emissive: 0x22c8ff, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }),
};

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  parent?.add(o);
  return o;
}

function organic(radius: number, seed: number, detail = 3) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 5 + seed) * Math.sin(v.y * 4 + seed * 2) * Math.sin(v.z * 6 + seed) * 0.12;
    v.multiplyScalar(1 + n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function build(id: string, race: Race, team: THREE.Color): Model {
  const g = new THREE.Group();
  const def = DEFS[id];
  const teamMat = new THREE.MeshStandardMaterial({ color: team, emissive: team, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.4 });
  const anims: Anim[] = [];
  const isBuilding = def?.kind === 'building';
  const air = !!def?.air;

  if (race === 'directorate') {
    const steel = mats.steel(), dark = mats.dark(), orange = mats.orange();
    if (isBuilding) {
      mesh(new THREE.BoxGeometry(2, 0.9, 2), steel, 0, -0.3, 0, g);
      mesh(new THREE.BoxGeometry(1.2, 0.8, 1.2), dark, 0, 0.5, 0, g);
      mesh(new THREE.BoxGeometry(2.05, 0.15, 0.3), teamMat, 0, -0.1, 0.9, g);
      const tower = mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8), steel, 0.6, 0.9, -0.5, g);
      const light = mesh(new THREE.SphereGeometry(0.12), orange, 0.6, 1.55, -0.5, g);
      anims.push(t => { light.scale.setScalar(0.8 + Math.sin(t * 5) * 0.3); tower.rotation.y = t; });
      if (def.tier && def.tier >= 2) mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 8), dark, -0.7, 0.4, 0.6, g);
      if (def.tier && def.tier >= 3) mesh(new THREE.TorusGeometry(0.5, 0.08, 8, 24), orange, 0, 1.1, 0, g).rotation.x = Math.PI / 2;
    } else if (air) {
      const hull = mesh(new THREE.ConeGeometry(0.6, 2.4, 6), steel, 0, 0, 0, g); hull.rotation.z = -Math.PI / 2;
      mesh(new THREE.BoxGeometry(1.2, 0.15, 2.2), dark, -0.2, 0, 0, g);
      mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), teamMat, -0.3, 0.2, 0, g);
      for (const z of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.2), orange, -0.8, 0, z, g); anims.push(t => e.scale.setScalar(0.8 + Math.random() * 0.4)); }
      if (id === 'wasp') for (const z of [-1.2, 1.2]) { const rot = mesh(new THREE.BoxGeometry(1.6, 0.03, 0.12), dark, 0, 0.25, z, g); anims.push(t => { rot.rotation.y = t * 25; }); }
      anims.push(t => { g.position.y = Math.sin(t * 2) * 0.1; });
    } else if (id === 'juggernaut' || id === 'scorcher' || id === 'titan') {
      if (id === 'titan') {
        const legs: THREE.Mesh[] = [];
        for (const z of [-0.6, 0.6]) legs.push(mesh(new THREE.BoxGeometry(0.4, 1.4, 0.4), dark, 0, -0.5, z, g));
        mesh(new THREE.BoxGeometry(1.4, 0.9, 1.6), steel, 0, 0.5, 0, g);
        for (const z of [-0.95, 0.95]) { const gun = mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8), dark, 0.6, 0.8, z, g); gun.rotation.z = Math.PI / 2; }
        mesh(new THREE.BoxGeometry(0.4, 0.3, 0.5), teamMat, 0, 1.05, 0, g);
        anims.push(t => { legs[0].rotation.z = Math.sin(t * 2) * 0.3; legs[1].rotation.z = -Math.sin(t * 2) * 0.3; });
      } else {
        for (const z of [-0.7, 0.7]) mesh(new THREE.BoxGeometry(2, 0.4, 0.4), dark, 0, -0.4, z, g);
        mesh(new THREE.BoxGeometry(1.7, 0.5, 1.1), steel, 0, 0, 0, g);
        const tur = new THREE.Group(); g.add(tur);
        mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.35, 12), steel, 0, 0.4, 0, tur);
        const barrel = mesh(new THREE.CylinderGeometry(0.08, 0.1, id === 'juggernaut' ? 1.6 : 0.8, 8), dark, 0.8, 0.45, 0, tur); barrel.rotation.z = Math.PI / 2;
        mesh(new THREE.BoxGeometry(0.4, 0.2, 0.5), teamMat, -0.6, 0.3, 0, g);
        anims.push(t => { tur.rotation.y = Math.sin(t * 0.8) * 0.6; });
      }
    } else {
      // infantry / rigger
      const bulky = id === 'breacher' || id === 'rigger';
      const legs = [mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), dark, 0, -0.8, -0.25, g), mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), dark, 0, -0.8, 0.25, g)];
      mesh(new THREE.BoxGeometry(bulky ? 0.9 : 0.7, 0.9, bulky ? 1.1 : 0.8), id === 'mender' ? mats.ivory() : steel, 0, 0.1, 0, g);
      for (const z of [-0.55, 0.55]) mesh(new THREE.SphereGeometry(bulky ? 0.32 : 0.24, 12, 8), steel, 0, 0.5, z * (bulky ? 1.1 : 1), g);
      const head = mesh(new THREE.SphereGeometry(0.3, 16, 12), teamMat, 0, 0.85, 0, g);
      mesh(new THREE.BoxGeometry(0.1, 0.12, 0.35), orange, 0.27, 0.87, 0, head.parent!);
      const gun = mesh(new THREE.BoxGeometry(1.1, 0.15, 0.15), dark, 0.5, 0.1, 0.35, g);
      if (id === 'rigger') gun.scale.set(0.6, 1.5, 1.5);
      anims.push(t => { legs[0].rotation.z = Math.sin(t * 3) * 0.2; legs[1].rotation.z = -Math.sin(t * 3) * 0.2; head.rotation.y = Math.sin(t) * 0.4; });
    }
  } else if (race === 'kyrrh') {
    const flesh = mats.flesh(), cara = mats.carapace(), bone = mats.bone(), gland = mats.gland();
    const seed = id.length;
    if (isBuilding) {
      const body = mesh(organic(1.2, seed), flesh, 0, -0.2, 0, g);
      for (let i = 0; i < 8 + (def.tier ?? 0) * 3; i++) { const a = (i / (8 + (def.tier ?? 0) * 3)) * Math.PI * 2; const sp = mesh(new THREE.ConeGeometry(0.12, 0.9, 6), bone, Math.cos(a) * 1.0, 0.2, Math.sin(a) * 1.0, g); sp.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8); }
      const eye = mesh(new THREE.SphereGeometry(0.35, 16, 12), gland, 0, 0.8, 0, g);
      anims.push(t => { body.scale.setScalar(1 + Math.sin(t * 2) * 0.04); eye.scale.setScalar(0.9 + Math.sin(t * 3) * 0.15); });
    } else {
      const long = id === 'quillback' || id === 'gravemaw' || id === 'behemoth';
      const body = mesh(organic(0.8, seed), cara, 0, 0, 0, g);
      body.scale.set(long ? 1.6 : 1.2, 0.8, 1);
      const head = mesh(organic(0.45, seed + 1), flesh, long ? 1.2 : 0.9, 0.15, 0, g);
      for (const z of [-0.2, 0.2]) mesh(new THREE.SphereGeometry(0.08), gland, (long ? 1.2 : 0.9) + 0.35, 0.3, z, g);
      const legs: THREE.Mesh[] = [];
      if (!air && id !== 'drover') for (let i = 0; i < (id === 'behemoth' ? 4 : 6); i++) {
        const side = i % 2 ? 1 : -1, x = -0.6 + Math.floor(i / 2) * 0.6;
        const l = mesh(new THREE.CylinderGeometry(0.06, 0.03, 1.1, 6), flesh, x, -0.5, side * 0.7, g); l.rotation.x = side * 0.7; legs.push(l);
      }
      if (id === 'behemoth') for (const z of [-0.4, 0.4]) { const tusk = mesh(new THREE.ConeGeometry(0.12, 1.4, 8), bone, 1.8, 0.2, z, g); tusk.rotation.z = -1.2; }
      if (id === 'quillback' || id === 'behemoth') for (let i = 0; i < 6; i++) { const q = mesh(new THREE.ConeGeometry(0.07, 0.7, 6), bone, -0.8 + i * 0.3, 0.7, 0, g); q.rotation.z = 0.5; }
      const wings: THREE.Mesh[] = [];
      if (air && id !== 'drover') for (const z of [-1, 1]) { const w = mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x96468c, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), 0, 0.2, z * 0.9, g); w.rotation.x = Math.PI / 2; wings.push(w); }
      if (id === 'drover') { body.scale.set(1.3, 1.1, 1.3); for (let i = 0; i < 5; i++) { const tn = mesh(new THREE.CylinderGeometry(0.05, 0.02, 1.3, 6), flesh, Math.cos(i) * 0.5, -1, Math.sin(i) * 0.5, g); legs.push(tn); } }
      mesh(new THREE.SphereGeometry(0.15), teamMat, -0.5, 0.55, 0, g);
      anims.push(t => {
        body.scale.y = 0.8 + Math.sin(t * 2.5) * 0.04;
        head.rotation.z = Math.sin(t * 1.7) * 0.2;
        legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 6 + i) * 0.3; });
        wings.forEach((w, i) => { w.rotation.x = Math.PI / 2 + Math.sin(t * 8) * 0.6 * (i ? 1 : -1); });
        if (air) g.position.y = Math.sin(t * 2) * 0.12;
      });
    }
  } else {
    const gold = mats.gold(), ivory = mats.ivory(), crystal = mats.crystal();
    if (isBuilding) {
      mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.4, 8), gold, 0, -0.6, 0, g);
      mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.3, 8), ivory, 0, -0.3, 0, g);
      const cr = mesh(new THREE.OctahedronGeometry(0.6), crystal, 0, 0.7, 0, g);
      cr.scale.y = 1.6;
      const ring = mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 32), gold, 0, 0.6, 0, g);
      if (def.tier && def.tier >= 2) mesh(new THREE.TorusGeometry(1.15, 0.05, 8, 32), crystal, 0, 0.3, 0, g).rotation.x = Math.PI / 2;
      mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), teamMat, 1.1, -0.4, 0, g);
      anims.push(t => { cr.rotation.y = t; cr.position.y = 0.7 + Math.sin(t * 2) * 0.1; ring.rotation.x = t * 0.7; ring.rotation.y = t * 0.4; });
    } else if (air) {
      const hull = mesh(new THREE.ConeGeometry(0.8, 2.4, 3), gold, 0, 0, 0, g); hull.rotation.z = -Math.PI / 2; hull.scale.z = 0.35;
      const cr = mesh(new THREE.OctahedronGeometry(0.35), crystal, 0.1, 0.25, 0, g);
      for (const z of [-0.9, 0.9]) mesh(new THREE.BoxGeometry(1.2, 0.08, 0.5), ivory, -0.4, 0, z, g);
      mesh(new THREE.BoxGeometry(0.3, 0.15, 0.3), teamMat, -0.6, 0.15, 0, g);
      anims.push(t => { cr.rotation.y = t * 2; g.position.y = Math.sin(t * 1.8) * 0.1; });
    } else if (id === 'strider' || id === 'seeker' || id === 'bulwark') {
      const n = id === 'strider' ? 3 : 4;
      const legs: THREE.Mesh[] = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.4; const l = mesh(new THREE.CylinderGeometry(0.06, 0.04, id === 'strider' ? 2 : 1.3, 6), gold, Math.cos(a) * 0.5, -0.5, Math.sin(a) * 0.5, g); l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); legs.push(l); }
      const body = mesh(new THREE.SphereGeometry(0.6, 16, 12), ivory, 0, id === 'strider' ? 0.6 : 0.2, 0, g); body.scale.set(1.2, 0.6, 1);
      const cr = mesh(new THREE.OctahedronGeometry(0.25), crystal, 0.4, id === 'strider' ? 0.7 : 0.35, 0, g);
      mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), teamMat, -0.5, id === 'strider' ? 0.8 : 0.4, 0, g);
      anims.push(t => { legs.forEach((l, i) => { l.rotation.y = Math.sin(t * 2 + i) * 0.2; }); cr.rotation.y = t * 3; });
    } else if (id === 'acolyte') {
      const d = mesh(new THREE.OctahedronGeometry(0.6), gold, 0, 0, 0, g); d.scale.y = 0.7;
      const ring = mesh(new THREE.TorusGeometry(0.85, 0.05, 8, 32), crystal, 0, 0, 0, g);
      mesh(new THREE.SphereGeometry(0.15), teamMat, 0, 0.45, 0, g);
      anims.push(t => { ring.rotation.x = t * 1.5; d.rotation.y = t; g.position.y = Math.sin(t * 2) * 0.1; });
    } else {
      // vindicator / hierophant
      const big = id === 'hierophant';
      const robe = mesh(new THREE.ConeGeometry(big ? 0.9 : 0.6, big ? 2 : 1.4, 8), gold, 0, -0.3, 0, g);
      mesh(new THREE.SphereGeometry(big ? 0.35 : 0.26, 16, 12), ivory, 0, big ? 0.9 : 0.55, 0, g);
      for (const z of [-0.5, 0.5]) mesh(new THREE.SphereGeometry(big ? 0.3 : 0.22), gold, 0, big ? 0.55 : 0.3, z * (big ? 1.3 : 1), g);
      mesh(new THREE.BoxGeometry(0.2, 0.2, 0.25), teamMat, 0.3, 0.1, 0, g);
      const blades: THREE.Mesh[] = [];
      if (!big) for (const z of [-0.65, 0.65]) { const b = mesh(new THREE.BoxGeometry(1.1, 0.04, 0.08), crystal, 0.6, 0.2, z, g); blades.push(b); }
      const shards: THREE.Mesh[] = [];
      if (big) for (let i = 0; i < 6; i++) shards.push(mesh(new THREE.OctahedronGeometry(0.15), crystal, 0, 0, 0, g));
      anims.push(t => {
        robe.rotation.y = Math.sin(t) * 0.1;
        blades.forEach((b, i) => { b.rotation.y = Math.sin(t * 3 + i) * 0.4; });
        shards.forEach((s, i) => { const a = t * 1.2 + (i / 6) * Math.PI * 2; s.position.set(Math.cos(a) * 1.3, 0.3 + Math.sin(t * 2 + i) * 0.2, Math.sin(a) * 1.3); s.rotation.y = t * 3; });
      });
    }
  }
  return { group: g, anim: t => anims.forEach(a => a(t)) };
}

/** Rotating 3D portrait of the selected unit, rendered into a small HUD canvas. */
export class Portrait3D {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private current: { key: string; model: Model } | null = null;
  private t = 0;
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(canvas.clientWidth || 120, canvas.clientHeight || 120, false);
    this.camera.position.set(3.2, 2.2, 4.2);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x66ccff, 1.4); rim.position.set(-4, 2, -3); this.scene.add(rim);
  }
  show(id: string | null, race: Race | null, teamColor: string) {
    const key = `${id}|${teamColor}`;
    if (this.current?.key === key) return;
    if (this.current) this.scene.remove(this.current.model.group);
    this.current = null;
    if (!id || !race) return;
    const model = build(id, race, new THREE.Color(teamColor));
    this.scene.add(model.group);
    this.current = { key, model };
  }
  render(dt: number) {
    this.t += dt;
    if (!this.current) { this.renderer.clear(); return; }
    this.current.model.group.rotation.y = this.t * 0.6;
    this.current.model.anim(this.t);
    this.renderer.render(this.scene, this.camera);
  }
}

/** Animated planet + orbiting race emblems behind the main menu. */
export class MenuScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  private planet: THREE.Mesh;
  private moons: THREE.Object3D[] = [];
  private stars: THREE.Points;
  private t = 0;
  constructor() {
    this.camera.position.set(0, 0.5, 9);
    const tex = document.createElement('canvas'); tex.width = 512; tex.height = 256;
    const c = tex.getContext('2d')!;
    const grd = c.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#1b3a4a'); grd.addColorStop(0.5, '#3c6a70'); grd.addColorStop(1, '#1a2a3a');
    c.fillStyle = grd; c.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '90,200,190' : '20,40,50'},${Math.random() * 0.35})`; c.beginPath(); c.ellipse(Math.random() * 512, Math.random() * 256, 4 + Math.random() * 30, 2 + Math.random() * 6, 0, 0, Math.PI * 2); c.fill(); }
    const planetTex = new THREE.CanvasTexture(tex);
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(2.6, 64, 48), new THREE.MeshStandardMaterial({ map: planetTex, roughness: 0.9 }));
    this.planet.position.set(2.6, -1.2, 0);
    this.scene.add(this.planet);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(2.75, 48, 32), new THREE.MeshBasicMaterial({ color: 0x5ef0ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, side: THREE.BackSide }));
    this.planet.add(atmo);
    const sun = new THREE.DirectionalLight(0xffe6c0, 2.6); sun.position.set(-6, 3, 5); this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x223344, 0.8));
    const colors = [0xffb347, 0xc8ff5a, 0x5ef0ff];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(i === 0 ? new THREE.BoxGeometry(0.35, 0.35, 0.35) : i === 1 ? new THREE.IcosahedronGeometry(0.25, 1) : new THREE.OctahedronGeometry(0.3), new THREE.MeshStandardMaterial({ color: colors[i], emissive: colors[i], emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 }));
      this.scene.add(m); this.moons.push(m);
    }
    const n = 2500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const r = 40 + Math.random() * 60, a = Math.random() * Math.PI * 2, b = (Math.random() - 0.5) * Math.PI; pos.set([Math.cos(a) * Math.cos(b) * r, Math.sin(b) * r, Math.sin(a) * Math.cos(b) * r - 30], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, sizeAttenuation: true }));
    this.scene.add(this.stars);
  }
  render(r: THREE.WebGLRenderer, w: number, h: number, dt: number) {
    this.t += dt;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.planet.rotation.y += dt * 0.05;
    this.moons.forEach((m, i) => { const a = this.t * (0.4 + i * 0.12) + (i * Math.PI * 2) / 3; m.position.set(2.6 + Math.cos(a) * 3.8, -1.2 + Math.sin(a * 0.7) * 0.8, Math.sin(a) * 3.8); m.rotation.x += dt; m.rotation.y += dt * 1.3; });
    this.stars.rotation.y += dt * 0.004;
    r.setClearColor(0x03050a, 1);
    r.render(this.scene, this.camera);
    r.setClearColor(0x000000, 0);
  }
}
