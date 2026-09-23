// Fully procedural audio: every sound and every piece of music is synthesized at runtime with Web Audio.
// No samples are used, so all audio is original.
import type { Proj, Race } from '../sim/data';

type Scene = 'menu' | 'directorate' | 'kyrrh' | 'aethel' | 'victory' | 'defeat' | 'none';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  voice!: GainNode;
  private noiseBuf!: AudioBuffer;
  private last = new Map<string, number>();
  private active = new Map<string, number>();
  private scene: Scene = 'none';
  private schedTimer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  intensity = 0; // 0..1 combat intensity drives percussion layer
  listener = { x: 0, y: 0, w: 40, h: 25 };
  volumes = { master: 0.8, music: 0.55, sfx: 0.8, voice: 0.9 };

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(this.ctx.destination);
    this.master = this.ctx.createGain(); this.master.connect(comp);
    this.music = this.ctx.createGain(); this.music.connect(this.master);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.voice = this.ctx.createGain(); this.voice.connect(this.master);
    this.applyVolumes();
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.scene !== 'none') { const s = this.scene; this.scene = 'none'; this.playMusic(s); }
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.music.gain.value = this.volumes.music * 0.5;
    this.sfx.gain.value = this.volumes.sfx * 0.55;
    this.voice.gain.value = this.volumes.voice * 0.5;
  }

  // ------------------------------------------------------------ primitives
  private env(g: GainNode, t: number, a: number, peak: number, d: number, sustain = 0, rel = 0.05) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (sustain > 0) { g.gain.setTargetAtTime(peak * sustain, t + a, d / 3); g.gain.setTargetAtTime(0.0001, t + a + d, rel / 3); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private osc(dest: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, a = 0.005, detune = 0) {
    const c = this.ctx!;
    const o = c.createOscillator(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain(); this.env(g, t, a, peak, dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  private noise(dest: AudioNode, t: number, dur: number, peak: number, ftype: BiquadFilterType, f0: number, f1 = f0, q = 1, a = 0.002) {
    const c = this.ctx!;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); this.env(g, t, a, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
  }
  private fm(dest: AudioNode, carrier: number, ratio: number, index: number, t: number, dur: number, peak: number, a = 0.005) {
    const c = this.ctx!;
    const car = c.createOscillator(); car.frequency.value = carrier;
    const mod = c.createOscillator(); mod.frequency.value = carrier * ratio;
    const mg = c.createGain(); mg.gain.setValueAtTime(carrier * index, t); mg.gain.exponentialRampToValueAtTime(carrier * index * 0.05 + 0.01, t + dur);
    mod.connect(mg); mg.connect(car.frequency);
    const g = c.createGain(); this.env(g, t, a, peak, dur);
    car.connect(g); g.connect(dest);
    car.start(t); mod.start(t); car.stop(t + dur + a + 0.05); mod.stop(t + dur + a + 0.05);
  }

  /** Spatial output: pans + attenuates by distance from the camera centre (tile coords). */
  private spatial(x?: number, y?: number, base = 1): AudioNode | null {
    const c = this.ctx!;
    if (x === undefined || y === undefined) { const g = c.createGain(); g.gain.value = base; g.connect(this.sfx); return g; }
    const L = this.listener;
    const cx = L.x + L.w / 2, cy = L.y + L.h / 2;
    const dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx / (L.w / 2), dy / (L.h / 2));
    const vol = base * (d < 1 ? 1 : Math.max(0, 1.6 - d * 0.6));
    if (vol < 0.03) return null;
    const g = c.createGain(); g.gain.value = vol;
    const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, dx / (L.w * 0.6)));
    g.connect(p); p.connect(this.sfx);
    return g;
  }

  private gate(key: string, minGap: number, maxActive = 6, dur = 0.3) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(key) ?? -1) < minGap) return false;
    const act = this.active.get(key) ?? 0;
    if (act >= maxActive) return false;
    this.last.set(key, now);
    this.active.set(key, act + 1);
    setTimeout(() => this.active.set(key, Math.max(0, (this.active.get(key) ?? 1) - 1)), dur * 1000);
    return true;
  }

  // ------------------------------------------------------------ UI
  ui(kind: 'click' | 'hover' | 'error' | 'confirm' | 'open' | 'place') {
    if (!this.ctx || !this.gate('ui' + kind, 0.04, 3)) return;
    const t = this.ctx.currentTime, out = this.spatial(undefined, undefined, 0.8)!;
    switch (kind) {
      case 'click': this.osc(out, 'triangle', 1400, 900, t, 0.05, 0.25); break;
      case 'hover': this.osc(out, 'sine', 2200, 2000, t, 0.03, 0.06); break;
      case 'error': this.osc(out, 'square', 320, 300, t, 0.08, 0.12); this.osc(out, 'square', 240, 220, t + 0.1, 0.12, 0.12); break;
      case 'confirm': this.osc(out, 'triangle', 700, 700, t, 0.06, 0.2); this.osc(out, 'triangle', 1050, 1050, t + 0.07, 0.1, 0.2); break;
      case 'open': this.osc(out, 'sine', 500, 900, t, 0.12, 0.2); break;
      case 'place': this.noise(out, t, 0.15, 0.4, 'lowpass', 900, 200); this.osc(out, 'sine', 120, 60, t, 0.2, 0.5); break;
    }
  }

  // ------------------------------------------------------------ unit voices
  /** Race-flavoured acknowledgement "speech" made of formant-filtered synth syllables. */
  unitVoice(race: Race, unit: string, kind: 'select' | 'move' | 'attack' | 'ready', size = 0.5) {
    if (!this.ctx || !this.gate('voice', kind === 'ready' ? 0.2 : 0.35, 1, 0.8)) return;
    const c = this.ctx, t = c.currentTime + 0.01;
    const out = c.createGain(); out.gain.value = 1; out.connect(this.voice);
    const seed = [...unit].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const base = (race === 'kyrrh' ? 70 : race === 'aethel' ? 220 : 130) * (1.3 - Math.min(1.2, size) * 0.5) * (kind === 'attack' ? 1.15 : 1);
    const syll = kind === 'select' ? 2 : kind === 'ready' ? 4 : 3;
    if (race === 'directorate') {
      // radio click, formant syllables, squelch
      const radio = c.createBiquadFilter(); radio.type = 'bandpass'; radio.frequency.value = 1500; radio.Q.value = 0.7; radio.connect(out);
      this.noise(radio, t, 0.03, 0.4, 'highpass', 3000);
      const vowels = [[730, 1090], [530, 1840], [300, 2250], [570, 840], [440, 1020]];
      for (let i = 0; i < syll; i++) {
        const st = t + 0.04 + i * (kind === 'attack' ? 0.08 : 0.11);
        const [f1, f2] = vowels[(seed + i * 3) % vowels.length];
        const src = c.createOscillator(); src.type = 'sawtooth';
        const pitch = base * (1 + ((seed + i) % 4) * 0.06) * (i === syll - 1 && kind !== 'attack' ? 0.9 : 1);
        src.frequency.setValueAtTime(pitch, st); src.frequency.linearRampToValueAtTime(pitch * 0.94, st + 0.09);
        const g = c.createGain(); this.env(g, st, 0.01, 0.35, 0.08);
        for (const [f, q] of [[f1, 8], [f2, 10]]) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; src.connect(bp); bp.connect(g); }
        g.connect(radio);
        src.start(st); src.stop(st + 0.14);
      }
      this.noise(radio, t + 0.06 + syll * 0.1, 0.06, 0.25, 'bandpass', 2500, 1500, 2);
    } else if (race === 'kyrrh') {
      // guttural growl with chittering clicks
      const src = c.createOscillator(); src.type = 'sawtooth';
      src.frequency.setValueAtTime(base * 1.4, t); src.frequency.exponentialRampToValueAtTime(base * (kind === 'attack' ? 1.1 : 0.7), t + 0.35);
      const lfo = c.createOscillator(); lfo.frequency.value = 22 + (seed % 10); const lg = c.createGain(); lg.gain.value = base * 0.3; lfo.connect(lg); lg.connect(src.frequency);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(400, t + 0.4); lp.Q.value = 6;
      const g = c.createGain(); this.env(g, t, 0.03, 0.4, 0.38);
      src.connect(lp); lp.connect(g); g.connect(out);
      src.start(t); lfo.start(t); src.stop(t + 0.5); lfo.stop(t + 0.5);
      for (let i = 0; i < syll + 2; i++) this.noise(out, t + 0.05 + i * 0.05 + Math.random() * 0.02, 0.02, 0.3, 'bandpass', 3000 + Math.random() * 2000, 2000, 6);
    } else {
      // harmonic choir chord + shimmer whisper
      const chord = kind === 'attack' ? [0, 3, 7, 12] : kind === 'ready' ? [0, 4, 7, 11, 14] : [0, 7, 12, 16];
      chord.forEach((iv, i) => {
        const f = base * Math.pow(2, iv / 12);
        this.osc(out, 'sine', f, f * (kind === 'attack' ? 1.02 : 1), t + i * 0.035, 0.45, 0.12, 0.05, (i - 2) * 6);
      });
      this.noise(out, t, 0.4, 0.08, 'bandpass', 6000, 9000, 3, 0.1);
    }
  }

  // ------------------------------------------------------------ combat
  weapon(proj: Proj, race: Race, unit: string, x: number, y: number) {
    if (!this.ctx) return;
    const gapMap: Partial<Record<Proj, number>> = { bullet: 0.05, laser: 0.05, beam: 0.08, melee: 0.07, claw: 0.07, spine: 0.06 };
    if (!this.gate('w' + proj, gapMap[proj] ?? 0.09, 5, 0.4)) return;
    const out = this.spatial(x, y, 0.8); if (!out) return;
    const t = this.ctx.currentTime;
    switch (proj) {
      case 'bullet': this.noise(out, t, 0.06, 0.5, 'highpass', 1800); this.osc(out, 'square', 180, 60, t, 0.04, 0.2); break;
      case 'shell': this.osc(out, 'sine', 160, 45, t, 0.18, 0.7); this.noise(out, t, 0.12, 0.4, 'lowpass', 2500, 300); break;
      case 'flame': this.noise(out, t, 0.45, 0.45, 'bandpass', 600, 1400, 0.8, 0.05); this.noise(out, t, 0.4, 0.2, 'lowpass', 300); break;
      case 'artillery': this.osc(out, 'sine', 110, 30, t, 0.5, 1); this.noise(out, t, 0.35, 0.7, 'lowpass', 1800, 120); this.osc(out, 'square', 60, 40, t, 0.1, 0.2); break;
      case 'missile': this.noise(out, t, 0.35, 0.35, 'bandpass', 800, 3000, 2); this.osc(out, 'sawtooth', 300, 900, t, 0.25, 0.08); break;
      case 'laser': this.osc(out, 'sawtooth', 2200, 500, t, 0.09, 0.2); this.osc(out, 'square', 1100, 250, t, 0.09, 0.08); break;
      case 'acid': this.fm(out, 180, 2.5, 3, t, 0.25, 0.35); this.noise(out, t + 0.05, 0.15, 0.25, 'bandpass', 900, 400, 4); break;
      case 'spine': this.osc(out, 'triangle', 1500, 400, t, 0.07, 0.3); this.noise(out, t, 0.04, 0.2, 'highpass', 4000); break;
      case 'glaive': this.fm(out, 520, 1.5, 4, t, 0.25, 0.25); break;
      case 'bolt': this.osc(out, 'sine', 1300, 300, t, 0.16, 0.35); this.fm(out, 900, 3.01, 2, t, 0.12, 0.12); break;
      case 'beam': this.osc(out, 'sawtooth', unit === 'strider' ? 180 : 420, unit === 'strider' ? 160 : 400, t, 0.14, 0.18); this.osc(out, 'sine', 1600, 1500, t, 0.12, 0.08); break;
      case 'thorn': this.osc(out, 'sine', 220, 70, t, 0.15, 0.6); this.noise(out, t, 0.08, 0.4, 'bandpass', 1800, 700, 3); break;
      case 'melee': this.noise(out, t, 0.08, 0.35, 'bandpass', race === 'aethel' ? 4000 : 2200, 900, 3); if (race === 'aethel') this.osc(out, 'sine', 2400, 1200, t, 0.1, 0.12); break;
      case 'claw': this.noise(out, t, 0.08, 0.4, 'bandpass', 1400, 600, 5); this.osc(out, 'triangle', 300, 150, t, 0.05, 0.15); break;
    }
  }

  impact(shield: boolean, x: number, y: number) {
    if (!this.ctx || !this.gate(shield ? 'hitS' : 'hit', 0.06, 4, 0.2)) return;
    const out = this.spatial(x, y, 0.5); if (!out) return;
    const t = this.ctx.currentTime;
    if (shield) { this.fm(out, 1800, 1.41, 1.5, t, 0.15, 0.18); }
    else this.noise(out, t, 0.05, 0.3, 'bandpass', 1200, 500, 2);
  }

  death(race: Race, radius: number, building: boolean, x: number, y: number) {
    if (!this.ctx || !this.gate('death' + race, building ? 0.05 : 0.07, 5, 1)) return;
    const out = this.spatial(x, y, Math.min(1.4, 0.6 + radius * 0.4)); if (!out) return;
    const t = this.ctx.currentTime;
    const big = building ? 2 : Math.min(1.6, radius);
    if (race === 'directorate' || building) {
      this.osc(out, 'sine', 140 / (0.6 + big * 0.4), 28, t, 0.5 + big * 0.4, 0.9);
      this.noise(out, t, 0.5 + big * 0.5, 0.8, 'lowpass', 3000, 100);
      // debris clatter (physics)
      for (let i = 0; i < 3 + big * 3; i++) {
        const tt = t + 0.2 + Math.random() * (0.5 + big * 0.3);
        if (race === 'aethel') this.osc(out, 'sine', 2500 + Math.random() * 3000, 2000, tt, 0.12, 0.08);
        else if (race === 'kyrrh') this.noise(out, tt, 0.06, 0.15, 'bandpass', 500, 300, 4);
        else this.osc(out, 'square', 800 + Math.random() * 1500, 500, tt, 0.04, 0.06);
      }
      if (building) this.noise(out, t + 0.1, 2.2, 0.35, 'lowpass', 180, 60, 1, 0.3);
    }
    if (race === 'kyrrh') {
      this.noise(out, t, 0.35 + big * 0.2, 0.6, 'bandpass', 700, 200, 3);
      const s = this.osc(out, 'sawtooth', 160 / (0.5 + big * 0.5), 50, t, 0.4 + big * 0.2, 0.35);
      void s;
      this.fm(out, 90, 0.5, 5, t + 0.05, 0.3, 0.3);
    } else if (race === 'aethel') {
      for (let i = 0; i < 6; i++) this.osc(out, 'sine', 1800 + Math.random() * 4000, 900 + Math.random() * 1000, t + i * 0.025, 0.25, 0.1);
      this.noise(out, t, 0.3, 0.4, 'highpass', 2500, 5000);
      this.osc(out, 'sine', 300, 80, t, 0.4 + big * 0.2, 0.5);
    }
  }

  event(kind: 'buildStart' | 'buildDone' | 'spawn' | 'research' | 'alert' | 'deposit' | 'place', race: Race, x?: number, y?: number) {
    if (!this.ctx || !this.gate(kind + race, kind === 'deposit' ? 0.12 : 0.15, 2, 0.6)) return;
    const out = this.spatial(x, y, kind === 'deposit' ? 0.15 : 0.7); if (!out) return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case 'buildStart':
        if (race === 'directorate') { for (let i = 0; i < 4; i++) { this.osc(out, 'square', 900, 400, t + i * 0.09, 0.03, 0.15); this.noise(out, t + i * 0.09, 0.04, 0.2, 'bandpass', 2500, 2000, 4); } }
        else if (race === 'kyrrh') { this.fm(out, 110, 0.5, 6, t, 0.6, 0.4); this.noise(out, t, 0.5, 0.2, 'lowpass', 600, 200); }
        else { this.osc(out, 'sine', 300, 1200, t, 0.8, 0.25, 0.1); this.osc(out, 'sine', 450, 1800, t, 0.8, 0.12, 0.1); }
        break;
      case 'buildDone':
        if (race === 'directorate') { this.osc(out, 'triangle', 523, 523, t, 0.12, 0.3); this.osc(out, 'triangle', 784, 784, t + 0.12, 0.2, 0.3); this.noise(out, t, 0.3, 0.15, 'highpass', 5000); }
        else if (race === 'kyrrh') { this.fm(out, 200, 0.5, 3, t, 0.4, 0.35); this.noise(out, t + 0.1, 0.25, 0.25, 'bandpass', 800, 300, 3); }
        else { [0, 4, 7, 12].forEach((iv, i) => this.osc(out, 'sine', NOTE(72 + iv), NOTE(72 + iv), t + i * 0.06, 0.6, 0.12, 0.02)); }
        break;
      case 'spawn':
        if (race === 'aethel') { this.osc(out, 'sine', 200, 1600, t, 0.35, 0.25, 0.05); this.noise(out, t, 0.3, 0.15, 'highpass', 4000); }
        else if (race === 'kyrrh') { this.noise(out, t, 0.2, 0.4, 'bandpass', 600, 1500, 5); this.fm(out, 140, 0.5, 4, t + 0.05, 0.2, 0.25); }
        else { this.noise(out, t, 0.1, 0.3, 'lowpass', 1500, 300); this.osc(out, 'square', 400, 400, t + 0.05, 0.04, 0.1); }
        break;
      case 'research': [0, 4, 7, 11, 12].forEach((iv, i) => this.osc(out, 'triangle', NOTE(67 + iv), NOTE(67 + iv), t + i * 0.08, 0.35, 0.15)); break;
      case 'alert': for (let i = 0; i < 4; i++) this.osc(out, 'square', i % 2 ? 660 : 880, i % 2 ? 660 : 880, t + i * 0.18, 0.15, 0.12); break;
      case 'deposit': this.osc(out, 'sine', 1900, 1800, t, 0.04, 0.2); break;
      case 'place': this.noise(out, t, 0.12, 0.3, 'lowpass', 900, 200); this.osc(out, 'sine', 140, 70, t, 0.18, 0.4); break;
    }
  }

  ability(kind: string, x: number, y: number) {
    if (!this.ctx || !this.gate('ab' + kind, 0.1, 3, 1)) return;
    const out = this.spatial(x, y, 0.9); if (!out) return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case 'siege': case 'unsiege': this.noise(out, t, 0.6, 0.35, 'bandpass', 3000, 800, 1.5, 0.05); for (let i = 0; i < 3; i++) this.osc(out, 'square', 200 - i * 30, 120, t + 0.3 + i * 0.25, 0.08, 0.25); break;
      case 'overdrive': this.noise(out, t, 0.25, 0.3, 'bandpass', 400, 2000, 2, 0.1); this.osc(out, 'sine', 60, 50, t + 0.3, 0.12, 0.6); this.osc(out, 'sine', 60, 50, t + 0.55, 0.12, 0.5); break;
      case 'phase': this.osc(out, 'sine', 3000, 200, t, 0.18, 0.3); this.osc(out, 'sine', 200, 2500, t + 0.15, 0.2, 0.3); break;
      case 'lanceCharge': this.osc(out, 'sawtooth', 100, 1600, t, 1.9, 0.15, 0.3); this.osc(out, 'sine', 200, 3200, t, 1.9, 0.12, 0.3); break;
      case 'solarlance': this.osc(out, 'sawtooth', 900, 60, t, 0.9, 0.5); this.osc(out, 'sine', 120, 25, t, 1.2, 1); this.noise(out, t, 1.0, 0.8, 'lowpass', 4000, 100); break;
      case 'spawnbrood': this.fm(out, 160, 0.5, 6, t, 0.8, 0.35, 0.05); this.noise(out, t, 0.6, 0.2, 'bandpass', 500, 1500, 4); break;
      case 'broodDone': for (let i = 0; i < 3; i++) this.noise(out, t + i * 0.1, 0.15, 0.3, 'bandpass', 600 + i * 200, 1500, 5); break;
    }
  }

  // ------------------------------------------------------------ music
  playMusic(scene: Scene) {
    if (scene === this.scene) return;
    this.scene = scene;
    if (!this.ctx) return;
    if (this.schedTimer) clearInterval(this.schedTimer);
    this.schedTimer = null;
    if (scene === 'none') return;
    this.beat = 0;
    this.nextBeat = this.ctx.currentTime + 0.1;
    if (scene === 'victory' || scene === 'defeat') { this.stinger(scene); return; }
    this.schedTimer = window.setInterval(() => this.schedule(), 50);
  }

  private tempo() { return this.scene === 'directorate' ? 112 : this.scene === 'kyrrh' ? 84 : this.scene === 'aethel' ? 72 : 64; }

  private schedule() {
    const c = this.ctx!;
    const spb = 60 / this.tempo() / 2; // eighth notes
    while (this.nextBeat < c.currentTime + 0.25) {
      this.playStep(this.beat, this.nextBeat, spb);
      this.nextBeat += spb;
      this.beat++;
    }
  }

  private pad(freqs: number[], t: number, dur: number, type: OscillatorType, peak: number, cutoff: number) {
    const c = this.ctx!;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.5;
    const g = c.createGain(); this.env(g, t, dur * 0.3, peak, dur * 0.7);
    lp.connect(g); g.connect(this.music);
    for (const f of freqs) for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  private pluck(f: number, t: number, peak: number, dur = 0.4, type: OscillatorType = 'triangle') { this.osc(this.music, type, f, f, t, dur, peak); }
  private bell(f: number, t: number, peak: number) { this.fm(this.music, f, 3.5, 2.5, t, 1.6, peak, 0.002); }
  private kick(t: number, peak: number) { this.osc(this.music, 'sine', 120, 40, t, 0.25, peak); }
  private snare(t: number, peak: number) { this.noise(this.music, t, 0.14, peak, 'bandpass', 1800, 900, 0.8); this.osc(this.music, 'triangle', 220, 160, t, 0.08, peak * 0.4); }
  private hat(t: number, peak: number) { this.noise(this.music, t, 0.04, peak, 'highpass', 7000); }

  private playStep(b: number, t: number, spb: number) {
    const bar = Math.floor(b / 8), step = b % 8;
    const I = this.intensity;
    switch (this.scene) {
      case 'menu': {
        const prog = [[57, 60, 64, 71], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]][bar % 4];
        if (step === 0) this.pad(prog.map(NOTE), t, spb * 8.5, 'sawtooth', 0.07, 900);
        if (step === 0) this.pluck(NOTE(prog[0] - 24), t, 0.25, spb * 7, 'sine');
        const arp = [0, 2, 1, 3, 2, 1, 3, 2][step];
        this.pluck(NOTE(prog[arp] + 12), t, 0.06, spb * 1.8);
        if (Math.random() < 0.15) this.bell(NOTE(prog[3] + 24), t, 0.03);
        break;
      }
      case 'directorate': {
        const prog = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]][bar % 4];
        if (step === 0) this.pad(prog.map(n => NOTE(n + 12)), t, spb * 8, 'sawtooth', 0.05, 1400);
        this.pluck(NOTE(prog[0] - 12), t, 0.16, spb * 0.9, 'sawtooth');
        if (step % 4 === 0) this.kick(t, 0.5);
        if (step % 4 === 2 && I > 0.2) this.snare(t, 0.2 + I * 0.25);
        if (I > 0.5) this.hat(t, 0.08);
        if (step === 6 && bar % 2 === 1) this.pluck(NOTE(prog[2] + 12), t, 0.08, spb * 2, 'square');
        break;
      }
      case 'kyrrh': {
        if (step === 0 && bar % 2 === 0) this.pad([NOTE(40), NOTE(46), NOTE(52)], t, spb * 16, 'sawtooth', 0.06, 500);
        if (step === 0 || step === 1) this.kick(t, step ? 0.3 : 0.5); // heartbeat
        if (Math.random() < 0.3) this.noise(this.music, t, 0.05, 0.05, 'bandpass', 2000 + Math.random() * 3000, 1500, 8);
        if (step === 4 && Math.random() < 0.5) this.fm(this.music, NOTE(52 + [0, 1, 6][bar % 3]), 1.41, 3, t, 1.2, 0.06);
        if (I > 0.3 && step % 2 === 1) this.noise(this.music, t, 0.1, 0.06 + I * 0.08, 'lowpass', 400, 200);
        break;
      }
      case 'aethel': {
        const prog = [[53, 57, 60, 64, 71], [55, 59, 62, 66], [52, 55, 59, 64], [50, 57, 62, 66]][bar % 4];
        if (step === 0) this.pad(prog.map(NOTE), t, spb * 8.5, 'sine', 0.1, 2400);
        const arp = [0, 1, 2, 3, 2, 1, 3, 2][step];
        if (step % 2 === 0) this.bell(NOTE(prog[arp % prog.length] + 12), t, 0.05);
        if (I > 0.3 && step % 4 === 0) this.kick(t, 0.25 + I * 0.2);
        if (I > 0.5 && step % 2 === 1) this.hat(t, 0.05);
        break;
      }
    }
  }

  private stinger(kind: 'victory' | 'defeat') {
    const t = this.ctx!.currentTime + 0.1;
    const notes = kind === 'victory' ? [60, 64, 67, 72, 76, 79, 84] : [69, 67, 65, 64, 62, 60, 57];
    notes.forEach((n, i) => {
      this.osc(this.music, 'sawtooth', NOTE(n), NOTE(n), t + i * 0.22, 0.5, 0.08);
      this.osc(this.music, 'triangle', NOTE(n - 12), NOTE(n - 12), t + i * 0.22, 0.6, 0.15);
    });
    this.pad((kind === 'victory' ? [60, 64, 67, 72] : [57, 60, 64]).map(NOTE), t + notes.length * 0.22, 4, 'sawtooth', 0.08, 1500);
  }
}

export const audio = new AudioEngine();
