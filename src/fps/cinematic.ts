// Intro cinematic for Operation Iron Descent: the Unyielding Covenant over Vorrhaal, dropships launch,
// re-entry through the burning sky, and landfall. Fully real-time (Three.js), ~50 seconds, skippable.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { audio } from '../audio/audio';
import { q } from '../assetver';
import { INTRO, INTRO_LENGTH, CineLine } from './story';

const BASE = import.meta.env.BASE_URL;
const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

function radial(inner: string, outer: string, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function cloudTex() {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 40; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.5, y = s / 2 + (Math.random() - 0.5) * s * 0.3, r = 30 + Math.random() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return new THREE.CanvasTexture(c);
}

export interface CineHooks { subtitle(l: CineLine | null): void; done(): void }

export class Cinematic {
  renderer: THREE.WebGLRenderer;
  private space = new THREE.Scene();
  private ground = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(50, 1, 0.5, 60000);
  private loader = new GLTFLoader();
  private t = 0; private raf = 0; private last = 0; private shown = -1; private finished = false;
  private flagship = new THREE.Group();
  private ships: THREE.Group[] = [];
  private hero = new THREE.Group();
  private planet!: THREE.Mesh;
  private fire!: THREE.Mesh;
  private clouds: THREE.Sprite[] = [];
  private dust: THREE.Points | null = null;
  private engineGlow: THREE.Sprite[] = [];
  private rumble: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private fade: HTMLElement;
  private lookAim = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement, private hooks: CineHooks, fade: HTMLElement) {
    this.fade = fade;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const draco = new DRACOLoader(); draco.setDecoderPath(`${BASE}draco/`); this.loader.setDRACOLoader(draco);
  }

  private glb(url: string) { return new Promise<THREE.Object3D | null>(res => this.loader.load(url + q, g => res(g.scene), undefined, () => res(null))); }
  private tex(url: string) { return new Promise<THREE.Texture | null>(res => new THREE.TextureLoader().load(url + q, t => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null))); }

  async load(onProgress: (f: number) => void) {
    let n = 0; const tick = () => onProgress(++n / 7);
    const [flag, flagAlt, drop, dropAlt, planetT, skyT, groundT] = await Promise.all([
      this.glb(`${BASE}env/prop_flagship.glb`).finally(tick), this.glb(`${BASE}models/dreadnought.glb`).finally(tick),
      this.glb(`${BASE}env/prop_dropship.glb`).finally(tick), this.glb(`${BASE}models/wasp.glb`).finally(tick),
      this.tex(`${BASE}env/planet.webp`).finally(tick), this.tex(`${BASE}env/sky.webp`).finally(tick), this.tex(`${BASE}env/tex_creep.webp`).finally(tick),
    ]);
    this.buildSpace(flag ?? flagAlt, planetT);
    this.buildGround(skyT, groundT);
    const shipSrc = drop ?? dropAlt;
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      if (shipSrc) { const o = skClone(shipSrc); fit(o, 30, true); g.add(o); } else g.add(new THREE.Mesh(new THREE.ConeGeometry(6, 30, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7a8794, metalness: 0.7, roughness: 0.4 })));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,200,120,1)', 'rgba(255,120,40,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(22, 22, 1); glow.position.set(0, 0, 16); g.add(glow); this.engineGlow.push(glow);
      this.ships.push(g); this.space.add(g);
    }
    if (shipSrc) { const o = skClone(shipSrc); fit(o, 30, true); this.hero.add(o); }
    const heroGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,210,140,1)', 'rgba(255,120,40,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    heroGlow.scale.set(20, 20, 1); heroGlow.position.set(0, -4, 14); this.hero.add(heroGlow);
    this.ground.add(this.hero);
    [this.space, this.ground].forEach(s => s.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.frustumCulled = false; const mat = m.material as THREE.MeshStandardMaterial; if (mat && 'metalness' in mat && !mat.metalnessMap) { mat.metalness = 0.45; mat.roughness = 0.5; } } }));
  }

  private buildSpace(flag: THREE.Object3D | null, planetT: THREE.Texture | null) {
    const s = this.space;
    s.background = new THREE.Color(0x020308);
    // stars
    const N = 5000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(40000);
      pos.set([v.x, v.y, v.z], i * 3);
      const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.4, 0.5, 0.65 + Math.random() * 0.35);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    s.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false })));
    // nebula glows
    for (const [c, x, y, z, sc] of [['rgba(170,60,220,0.35)', -18000, 6000, -30000, 30000], ['rgba(60,120,255,0.25)', 20000, -4000, -26000, 26000], ['rgba(255,80,160,0.2)', 5000, 12000, -32000, 22000]] as [string, number, number, number, number][]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(c, 'rgba(0,0,0,0)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sp.position.set(x, y, z); sp.scale.set(sc, sc, 1); s.add(sp);
    }
    // sun
    const sun = new THREE.DirectionalLight(0xfff0dd, 3.2); sun.position.set(-1, 0.6, 0.8); s.add(sun);
    s.add(new THREE.AmbientLight(0x404a70, 0.6));
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,245,220,1)', 'rgba(255,200,120,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
    sunSprite.position.set(-30000, 18000, 24000); sunSprite.scale.set(9000, 9000, 1); s.add(sunSprite);
    // planet Vorrhaal + atmosphere rim
    const R = 6000;
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshStandardMaterial({ map: planetT, color: planetT ? 0xffffff : 0x4a2a5a, roughness: 0.9, emissive: 0x2a0a30, emissiveIntensity: 0.4 }));
    this.planet.position.set(0, -7600, -3000);
    s.add(this.planet);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 96, 64), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { c: { value: new THREE.Color(0xc070ff) } },
      vertexShader: 'varying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); v = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 n; varying vec3 v; void main(){ float f = pow(1.0 - abs(dot(n, v)), 3.0); gl_FragColor = vec4(c * f * 1.6, f); }',
    }));
    atmo.position.copy(this.planet.position); s.add(atmo);
    // the Unyielding Covenant
    if (flag) { fit(flag, 900, true); this.flagship.add(flag); }
    else {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(160, 90, 900), new THREE.MeshStandardMaterial({ color: 0x6d7884, metalness: 0.7, roughness: 0.45 }));
      this.flagship.add(hull);
    }
    // running lights along the hull
    for (let i = 0; i < 24; i++) {
      const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,190,90,1)', 'rgba(255,150,40,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
      l.position.set((i % 2 ? 1 : -1) * 120, -30, -420 + i * 36); l.scale.set(14, 14, 1); this.flagship.add(l);
    }
    for (let i = 0; i < 4; i++) {
      const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(140,200,255,1)', 'rgba(60,120,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
      e.position.set((i - 1.5) * 60, 0, 470); e.scale.set(110, 110, 1); this.flagship.add(e);
    }
    this.flagship.position.set(0, 0, 0);
    s.add(this.flagship);
    // re-entry fire shell around the hero ship
    this.fire = new THREE.Mesh(new THREE.ConeGeometry(26, 90, 32, 1, true), new THREE.MeshBasicMaterial({ map: radial('rgba(255,255,220,1)', 'rgba(255,90,20,0)'), color: 0xffa050, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.fire.rotation.x = -Math.PI / 2;
  }

  private buildGround(skyT: THREE.Texture | null, groundT: THREE.Texture | null) {
    const s = this.ground;
    s.fog = new THREE.FogExp2(0x3a2440, 0.0016);
    s.background = new THREE.Color(0x3a2440);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), new THREE.MeshBasicMaterial({ map: skyT, color: skyT ? 0xffffff : 0x5a3060, side: THREE.BackSide, fog: false }));
    s.add(dome);
    s.add(new THREE.HemisphereLight(0xc0a0ff, 0x302030, 1.1));
    const sun = new THREE.DirectionalLight(0xffc890, 2.6); sun.position.set(300, 500, -200); s.add(sun);
    const geo = new THREE.PlaneGeometry(8000, 8000, 160, 160); geo.rotateX(-Math.PI / 2);
    const P = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), d = Math.hypot(x, z);
      P.setY(i, (Math.sin(x * 0.004) * Math.cos(z * 0.005) * 60 + Math.sin(x * 0.013 + z * 0.01) * 18) * Math.min(1, d / 400));
    }
    geo.computeVertexNormals();
    if (groundT) { groundT.wrapS = groundT.wrapT = THREE.MirroredRepeatWrapping; groundT.repeat.set(120, 120); }
    s.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: groundT, color: groundT ? 0xffffff : 0x4a3450, roughness: 0.95 })));
    // cloud deck
    const ct = cloudTex();
    for (let i = 0; i < 90; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, color: new THREE.Color().setHSL(0.8, 0.3, 0.75), transparent: true, opacity: 0.8, depthWrite: false }));
      c.position.set((Math.random() - 0.5) * 1600, 700 + Math.random() * 500, (Math.random() - 0.5) * 1600);
      const sc = 260 + Math.random() * 380; c.scale.set(sc, sc * 0.55, 1);
      this.clouds.push(c); s.add(c);
    }
    // landing dust
    const N = 600, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 10; pos.set([Math.cos(a) * r, 1, Math.sin(a) * r], i * 3); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xb49ab8, size: 4, transparent: true, opacity: 0, depthWrite: false }));
    s.add(this.dust);
  }

  start() {
    this.resize();
    addEventListener('resize', this.onResize);
    audio.playMusic('directorate');
    this.startRumble();
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.finished) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.t += dt;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }
  private onResize = () => this.resize();
  private resize() { this.renderer.setSize(innerWidth, innerHeight, false); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); }

  skip() { this.finish(); }
  private finish() {
    if (this.finished) return;
    this.finished = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
    if (this.rumble) { const r = this.rumble; try { r.gain.gain.setTargetAtTime(0, audio.ctx!.currentTime, 0.3); r.src.stop(audio.ctx!.currentTime + 1.5); } catch { /* ignore */ } this.rumble = null; }
    this.hooks.subtitle(null);
    this.renderer.dispose();
    this.hooks.done();
  }

  /** Low engine/atmosphere rumble whose loudness follows the timeline. */
  private startRumble() {
    const c = audio.ctx; if (!c) return;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 200;
    const gain = c.createGain(); gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(audio.sfx);
    src.start();
    this.rumble = { src, gain, filter };
  }

  private frame(dt: number) {
    const t = this.t;
    // subtitles
    let idx = -1; INTRO.forEach((l, i) => { if (t >= l.at) idx = i; });
    if (idx !== this.shown) { this.shown = idx; this.hooks.subtitle(idx >= 0 ? INTRO[idx] : null); if (idx >= 0 && INTRO[idx].speaker) audio.ui('open'); }
    // fades
    const fadeIn = 1 - span(t, 0, 2.5), cut = t > 30.6 && t < 31.6 ? 1 - Math.abs(t - 31.1) * 2 : 0, out = span(t, INTRO_LENGTH - 2, INTRO_LENGTH);
    this.fade.style.opacity = String(Math.max(fadeIn, cut, out));
    const cam = this.cam;
    let shake = 0, rumble = 0.15;
    if (t < 31.1) {
      // ---------------- orbit: flagship, flyby, launch
      const F = this.flagship;
      F.position.z = -t * 6;
      F.rotation.y = 0.05 * Math.sin(t * 0.05);
      if (t < 10) {
        const k = ease(span(t, 0, 10));
        cam.position.set(1900 - k * 700, 500 - k * 150, 1600 - k * 500);
        cam.lookAt(F.position.x - 300 * (1 - k), -200 * (1 - k), F.position.z);
      } else if (t < 17) {
        const k = span(t, 10, 17);
        cam.position.set(430, 150 - k * 60, F.position.z + 650 - k * 1200);
        cam.lookAt(F.position.x, F.position.y - 20, F.position.z - 250 + k * 300);
        rumble = 0.35;
      } else {
        // under the hull, watching the dropships fall away toward Vorrhaal
        const k = span(t, 17, 31.1);
        const out = this.ships.filter(sh => sh.visible);
        const c = out.length ? out.reduce((a, sh) => a.add(sh.position), new THREE.Vector3()).divideScalar(out.length) : F.position.clone().add(new THREE.Vector3(0, -100, -100));
        cam.position.set(-220 + k * 60, F.position.y - 150 - k * 40, F.position.z + 160);
        this.lookAim.lerp(c, t < 17.1 ? 1 : Math.min(1, dt * 1.5));
        cam.lookAt(this.lookAim);
      }
      // dropships leave the ventral bays one after another and dive toward Vorrhaal
      this.ships.forEach((sh, i) => {
        const launch = 17.5 + i * 1.3;
        const k = Math.max(0, t - launch);
        const dir = new THREE.Vector3((i - 2.5) * 0.12, -0.55, -0.83).normalize();
        sh.visible = t > launch - 0.5;
        sh.position.copy(this.flagship.position).add(new THREE.Vector3((i - 2.5) * 40, -70, -100 + i * 60)).addScaledVector(dir, 4 * k * k + 22 * k);
        sh.lookAt(sh.position.clone().add(dir));
        sh.rotateY(Math.PI);
        (this.engineGlow[i].material as THREE.SpriteMaterial).opacity = k > 0 ? 1 : 0.2;
      });
      this.planet.rotation.y += dt * 0.004;
      this.renderer.render(this.space, cam);
    } else {
      // ---------------- atmosphere: re-entry, clouds, landfall
      const H = this.hero;
      const land = 46.5;
      const k = span(t, 31.1, land);
      const alt = 2400 * Math.pow(1 - ease(k), 1.4) + 6;
      const drift = (1 - k) * 900;
      H.position.set(drift * 0.4, alt, -drift);
      H.rotation.set(-(1 - k) * 0.5, 0.2 * Math.sin(t * 0.7), 0.08 * Math.sin(t * 2.3) * (1 - k));
      // fire: strongest high up
      const burn = span(t, 31.1, 33) * (1 - span(t, 38, 41));
      if (!this.fire.parent) H.add(this.fire);
      this.fire.position.set(0, -10, -30);
      (this.fire.material as THREE.MeshBasicMaterial).opacity = burn * (0.75 + 0.25 * Math.sin(t * 40));
      this.ground.background = new THREE.Color().lerpColors(new THREE.Color(0xff7a3a), new THREE.Color(0x3a2440), span(t, 34, 41));
      (this.ground.fog as THREE.FogExp2).color.copy(this.ground.background as THREE.Color);
      shake = burn * 1.4 + span(t, 45.5, 46.5) * (1 - span(t, 46.5, 48)) * 1.2;
      rumble = 0.35 + burn * 0.6;
      if (t < 41) {
        // chase cam behind the burning dropship
        cam.position.copy(H.position).add(new THREE.Vector3(26, 36, 90));
        cam.lookAt(H.position.clone().add(new THREE.Vector3(0, -60, -120)));
      } else {
        // ground cam: watch it land in the creep
        cam.position.set(90, 16, 110);
        cam.lookAt(H.position.x, Math.max(8, H.position.y * 0.8), H.position.z);
      }
      cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake;
      this.clouds.forEach(c => { c.position.z += dt * 40; });
      if (this.dust) {
        const on = span(t, 44.5, 46.5) * (1 - span(t, 48, 50));
        const m = this.dust.material as THREE.PointsMaterial; m.opacity = on * 0.8;
        const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z) || 1;
          if (on > 0) p.setXYZ(i, x + (x / r) * dt * 30 * on, 1 + Math.random() * 3 * on, z + (z / r) * dt * 30 * on);
        }
        p.needsUpdate = true;
      }
      this.renderer.render(this.ground, cam);
    }
    if (this.rumble && audio.ctx) {
      this.rumble.gain.gain.setTargetAtTime(rumble * 0.9 * (1 - span(t, 47, 50)), audio.ctx.currentTime, 0.2);
      this.rumble.filter.frequency.setTargetAtTime(120 + rumble * 500, audio.ctx.currentTime, 0.3);
    }
    if (t > 46.4 && t < 46.5) audio.death('directorate', 1.5, false, undefined as any, undefined as any);
    if (t >= INTRO_LENGTH) this.finish();
  }
}

function fit(o: THREE.Object3D, size: number, longestAlongZ = false) {
  o.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
  if (longestAlongZ && s.x > s.z * 1.2) { o.rotation.y = Math.PI / 2; o.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(o); s = b.getSize(new THREE.Vector3()); }
  o.scale.multiplyScalar(size / Math.max(s.x, s.y, s.z, 0.001));
  o.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
  o.position.sub(c);
}
