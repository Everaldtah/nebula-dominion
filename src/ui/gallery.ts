// Unit Gallery: every unit and structure of every race as an interactive 3D model.
// Uses the AI-generated models (Draco/WebP GLBs in /models) when present, else the procedural models.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ABILITIES, DEFS, EntityDef, Race, RACES, RESEARCH } from '../sim/data';
import { buildModel, Kit, teamMaterial } from '../render/models';
import { audio } from '../audio/audio';

const BASE = import.meta.env.BASE_URL;
const RACE_ORDER: Race[] = ['directorate', 'kyrrh', 'aethel'];

function tierOf(def: EntityDef): number {
  if (def.tier) return def.tier;
  const seen = new Set<string>();
  const walk = (d: EntityDef): number => {
    let t = 1;
    for (const r of d.requires ?? []) {
      if (seen.has(r)) continue;
      seen.add(r);
      const rd = DEFS[r];
      t = Math.max(t, rd.tier ?? walk(rd));
    }
    const prod = d.producedBy ? DEFS[d.producedBy] : undefined;
    if (prod && !seen.has(prod.id)) { seen.add(prod.id); t = Math.max(t, prod.tier ?? walk(prod)); }
    return t;
  };
  return walk(def);
}

export class Gallery {
  private el: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
  private controls: OrbitControls | null = null;
  private loader = new GLTFLoader();
  private model: THREE.Object3D | null = null;
  private pose: ((p: number) => void) | null = null;
  private kit: Kit | null = null;
  private race: Race = 'directorate';
  private kind: 'unit' | 'building' = 'unit';
  private current = '';
  private raf = 0;
  private t = 0;
  private hover = 0;
  private cache = new Map<string, { obj: THREE.Object3D; clips: THREE.AnimationClip[] } | null>();
  private mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  private anim = 'Idle';
  private animSpeed = 1;
  private list: string[] = [];

  constructor() {
    const draco = new DRACOLoader();
    draco.setDecoderPath(`${BASE}draco/`);
    this.loader.setDRACOLoader(draco);
    this.el = document.getElementById('gallery')!;
    this.el.querySelector('.g-close')!.addEventListener('click', () => this.close());
    this.el.querySelectorAll<HTMLElement>('[data-grace]').forEach(b => b.onclick = () => { this.race = b.dataset.grace as Race; audio.ui('click'); this.renderList(); });
    this.el.querySelectorAll<HTMLElement>('[data-gkind]').forEach(b => b.onclick = () => { this.kind = b.dataset.gkind as 'unit' | 'building'; audio.ui('click'); this.renderList(); });
    (this.el.querySelector('#g-rotate') as HTMLInputElement).onchange = e => { if (this.controls) this.controls.autoRotate = (e.target as HTMLInputElement).checked; };
    addEventListener('keydown', e => {
      if (this.el.classList.contains('hidden')) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.step(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.step(-1);
    });
  }

  open() {
    this.el.classList.remove('hidden');
    const cv = this.el.querySelector<HTMLCanvasElement>('#g-canvas')!;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.background = null;
      const key = new THREE.DirectionalLight(0xfff1dd, 2.6);
      key.position.set(4, 7, 5); key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
      this.scene.add(key);
      const rim = new THREE.DirectionalLight(0x7ec8ff, 2.0); rim.position.set(-5, 3, -6); this.scene.add(rim);
      this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x20242c, 0.5));
      // display pedestal
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.18, 64), new THREE.MeshStandardMaterial({ color: 0x1a222c, metalness: 0.8, roughness: 0.35 }));
      ped.position.y = -0.09; ped.receiveShadow = true; this.scene.add(ped);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.025, 8, 96), new THREE.MeshStandardMaterial({ color: 0x5ef0ff, emissive: 0x2ab8ff, emissiveIntensity: 2 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; this.scene.add(ring);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.3, 48), new THREE.ShadowMaterial({ opacity: 0.45 }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; shadow.receiveShadow = true; this.scene.add(shadow);
      this.controls = new OrbitControls(this.camera, cv);
      this.controls.enableDamping = true;
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 1.6;
      this.controls.minDistance = 1.6; this.controls.maxDistance = 12;
      this.controls.maxPolarAngle = Math.PI * 0.49;
      this.controls.target.set(0, 0.8, 0);
      this.camera.position.set(4.6, 3.1, 6.0);
    }
    this.renderList();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.t) / 1000 || 0.016);
      this.t = now;
      this.resize();
      this.controls!.update();
      if (this.model) {
        this.model.position.y = this.hover ? this.hover + (this.clips.length ? 0 : Math.sin(now / 700) * 0.08) : 0;
        this.pose?.((now / (this.anim === 'Walk' ? 600 : 1200)) % 1);
        this.mixer?.update(dt * this.animSpeed);
      }
      this.renderer!.render(this.scene, this.camera);
      void dt;
    };
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    this.el.classList.add('hidden');
    cancelAnimationFrame(this.raf);
    audio.ui('click');
  }

  private resize() {
    const cv = this.renderer!.domElement;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.floor(w * this.renderer!.getPixelRatio()) || cv.height !== Math.floor(h * this.renderer!.getPixelRatio())) {
      this.renderer!.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
  }

  private renderList() {
    this.el.querySelectorAll<HTMLElement>('[data-grace]').forEach(b => b.classList.toggle('on', b.dataset.grace === this.race));
    this.el.querySelectorAll<HTMLElement>('[data-gkind]').forEach(b => b.classList.toggle('on', b.dataset.gkind === this.kind));
    const defs = Object.values(DEFS).filter(d => d.race === this.race && d.kind === this.kind).sort((a, b) => tierOf(a) - tierOf(b) || a.cost.m + a.cost.g - (b.cost.m + b.cost.g));
    this.list = defs.map(d => d.id);
    if (this.kind === 'unit' && this.race === 'directorate') this.list.splice(this.list.indexOf('juggernaut') + 1, 0, 'juggernaut_sieged');
    const box = this.el.querySelector('#g-list')!;
    box.innerHTML = '';
    let lastTier = 0;
    for (const id of this.list) {
      const d = DEFS[id] ?? DEFS.juggernaut;
      const tier = tierOf(d);
      if (tier !== lastTier) { box.insertAdjacentHTML('beforeend', `<div class="g-tier">Tier ${tier}</div>`); lastTier = tier; }
      const item = document.createElement('div');
      item.className = 'g-item' + (id === this.current ? ' on' : '');
      item.innerHTML = `<img src="${BASE}portraits/${id}.webp" onerror="this.style.visibility='hidden'"><span>${id === 'juggernaut_sieged' ? 'Juggernaut (Anchored)' : d.name}</span>`;
      item.onclick = () => { audio.ui('click'); this.show(id); };
      box.appendChild(item);
    }
    if (!this.list.includes(this.current)) this.show(this.list[0]);
  }

  private step(dir: number) {
    const i = this.list.indexOf(this.current);
    this.show(this.list[(i + dir + this.list.length) % this.list.length]);
  }

  private async show(id: string) {
    this.current = id;
    this.el.querySelectorAll('.g-item').forEach((n, i) => n.classList.toggle('on', this.list[i] === id));
    const def = DEFS[id] ?? DEFS.juggernaut;
    this.info(id, def);
    if (this.model) { this.scene.remove(this.model); this.model = null; this.pose = null; }
    this.mixer?.stopAllAction(); this.mixer = null; this.clips = [];
    const status = this.el.querySelector('#g-status')!;
    status.textContent = 'Loading model…';
    let entry = this.cache.get(id);
    let generated = true;
    if (entry === undefined) {
      entry = await new Promise<{ obj: THREE.Object3D; clips: THREE.AnimationClip[] } | null>(res =>
        this.loader.load(`${BASE}models/${id}.glb`, g => res({ obj: g.scene, clips: g.animations }), undefined, () => res(null)));
      if (entry) this.normalise(entry.obj, def);
      this.cache.set(id, entry);
    }
    if (this.current !== id) return;
    let obj: THREE.Object3D | null | undefined = entry?.obj;
    if (entry) {
      this.clips = entry.clips;
      if (this.clips.length) { this.mixer = new THREE.AnimationMixer(entry.obj); this.play(this.clips.some(c => c.name === this.anim) ? this.anim : 'Idle'); }
    }
    this.renderAnimButtons();
    if (!obj) {
      generated = false;
      this.kit ??= new Kit();
      const inst = buildModel(this.kit, id === 'juggernaut_sieged' ? 'juggernaut' : id, teamMaterial(RACES[def.race].accent), id === 'juggernaut_sieged' ? 'sieged' : undefined);
      if (inst) {
        obj = inst.root;
        this.pose = inst.pose;
        obj.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
        this.normalise(obj, def);
      }
    }
    if (!obj) { status.textContent = 'No model'; return; }
    this.model = obj;
    this.hover = def.air ? 0.6 : 0;
    this.scene.add(obj);
    status.textContent = (generated ? `AI-generated model${this.clips.length ? ' · rigged' : ''}` : 'Procedural model') + ' · drag to rotate · scroll to zoom';
    this.renderAnimButtons();
  }

  private play(name: string) {
    this.anim = name;
    if (!this.mixer) return;
    const clip = this.clips.find(c => c.name === name) ?? this.clips[0];
    this.mixer.stopAllAction();
    const act = this.mixer.clipAction(clip);
    act.reset(); act.setLoop(THREE.LoopRepeat, Infinity); act.play();
    this.renderAnimButtons();
  }

  private renderAnimButtons() {
    const box = this.el.querySelector('#g-anims')!;
    const names = this.clips.length ? this.clips.map(c => c.name) : this.pose ? ['Idle'] : [];
    box.innerHTML = names.map(n => `<button data-anim="${n}" class="${n === this.anim ? 'on' : ''}">${n === 'Walk' ? '▶ Walk' : n === 'Attack' ? '⚔ Attack' : '◌ Idle'}</button>`).join('') +
      (this.clips.length ? `<label>Speed <input type="range" min="0.2" max="2" step="0.1" value="${this.animSpeed}" id="g-aspeed"></label>` : '');
    box.querySelectorAll<HTMLElement>('[data-anim]').forEach(b => b.onclick = () => { audio.ui('click'); this.play(b.dataset.anim!); });
    const sp = box.querySelector<HTMLInputElement>('#g-aspeed');
    if (sp) sp.oninput = () => { this.animSpeed = +sp.value; };
  }

  private normalise(obj: THREE.Object3D, def: EntityDef) {
    obj.position.set(0, 0, 0); obj.scale.setScalar(1); obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const target = def.kind === 'building' ? 3.6 : 2.6;
    const k = target / Math.max(size.x, size.z, size.y * 0.9);
    const wrap = obj;
    wrap.scale.setScalar(k);
    wrap.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(wrap);
    const c = b2.getCenter(new THREE.Vector3());
    wrap.position.x -= c.x; wrap.position.z -= c.z; wrap.position.y -= b2.min.y;
    wrap.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = true;
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
      // AI GLBs ship metallicFactor 1 with no metallic map, which renders as a dark mirror
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat && 'metalness' in mat && !mat.metalnessMap) { mat.metalness = 0.25; mat.roughness = Math.max(0.45, Math.min(mat.roughness, 0.6)); }
      // concept shading lives in the texture: let it glow through like the sprite renders do
      if (mat && mat.map && !mat.emissiveMap) { mat.emissiveMap = mat.map; mat.emissive = new THREE.Color(1, 1, 1); mat.emissiveIntensity = 0.55; }
      if (mat && mat.emissiveMap) mat.emissiveIntensity = Math.min(mat.emissiveIntensity || 0.55, 0.6);
    });
    this.controls?.target.set(0, Math.min(1.4, (b2.max.y - b2.min.y) * 0.45), 0);
  }

  private info(id: string, def: EntityDef) {
    const w = id === 'juggernaut_sieged' ? { damage: 40, bonus: { attr: 'armored', amount: 30 }, range: 13, cooldown: 2.14, targets: 'ground', splash: 1.25 } : def.weapon;
    const rows: [string, string][] = [
      ['Tier', `Tier ${tierOf(def)}`],
      ['Cost', `${def.cost.m} crystal · ${def.cost.g} flux`],
      ['Build time', `${def.time}s`],
    ];
    if (def.kind === 'unit') rows.push(['Supply', `${def.supply * (def.pairs ?? 1)}${def.pairs ? ' (pair)' : ''}`], ['Speed', def.speed.toFixed(2)], ['Movement', def.air ? 'Air' : 'Ground']);
    rows.push(['Hit points', `${def.hp}${def.shields ? ` + ${def.shields} shields` : ''}`], ['Armor', String(def.armor)], ['Attributes', def.attrs.filter(a => a !== 'structure').join(', ')]);
    if (w) rows.push(['Weapon', `${w.damage}${(w as any).hits ? ' ×' + (w as any).hits : ''}${w.bonus ? ` (+${w.bonus.amount} vs ${w.bonus.attr})` : ''} · range ${w.range} · ${w.targets === 'both' ? 'ground & air' : w.targets}${w.splash ? ' · splash' : ''}`]);
    if (def.provides) rows.push(['Supply provided', `+${def.provides}`]);
    if (def.abilities?.length) rows.push(['Abilities', def.abilities.map(a => ABILITIES[a].name).join(', ')]);
    if (def.trains?.length) rows.push(['Produces', def.trains.map(t => DEFS[t].name).join(', ')]);
    if (def.researches?.length) rows.push(['Research', def.researches.map(r => RESEARCH[r].name).join(', ')]);
    if (def.requires?.length) rows.push(['Requires', def.requires.map(r => DEFS[r].name).join(', ')]);
    const rd = RACES[def.race];
    this.el.querySelector('#g-info')!.innerHTML =
      `<img class="g-portrait" src="${BASE}portraits/${id}.webp" onerror="this.style.display='none'">` +
      `<h2 style="color:${rd.accent}">${id === 'juggernaut_sieged' ? 'Juggernaut — Anchor Mode' : def.name}</h2><div class="g-race">${rd.name}</div>` +
      `<p class="g-desc">${def.desc}</p><table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
  }
}

export { RACE_ORDER };
