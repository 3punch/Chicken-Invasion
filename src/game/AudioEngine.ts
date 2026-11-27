/**
 * AudioEngine — all sound is synthesized live with the Web Audio API:
 * SFX (weapons, impacts, pickups, UI) and generative stage music.
 * No external audio files, no paid services.
 */

type Osc = OscillatorType;

export interface AudioSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

interface ToneOpts {
  freq: number;
  endFreq?: number;
  dur: number;
  type?: Osc;
  gain?: number;
  attack?: number;
  filterFreq?: number;
  filterEnd?: number;
  filterType?: BiquadFilterType;
  detune?: number;
  delay?: number;
  bus?: GainNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private theme: 'menu' | 'stage1' | 'stage2' | 'stage3' | 'none' = 'none';
  private settings: AudioSettings = {
    masterVolume: 0.8,
    musicVolume: 0.55,
    sfxVolume: 0.8,
    muted: false,
  };

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx && this.ctx.state === 'closed') this.ctx = null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  setVolumes(s: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...s };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const m = this.settings.muted ? 0 : this.settings.masterVolume;
    this.master.gain.value = m * m; // perceptual-ish curve
    this.sfxBus.gain.value = this.settings.sfxVolume;
    this.musicBus.gain.value = this.settings.musicVolume * 0.9;
  }

  /* ---------------------------------------------------------------- */
  /* Low-level synth primitives                                        */
  /* ---------------------------------------------------------------- */

  private tone(opts: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(20, opts.freq), t0);
    if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), t0 + opts.dur);
    if (opts.detune) osc.detune.value = opts.detune;
    const gain = ctx.createGain();
    const peak = opts.gain ?? 0.12;
    const attack = opts.attack ?? 0.004;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    let node: AudioNode = osc;
    if (opts.filterFreq) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filterType ?? 'lowpass';
      f.frequency.setValueAtTime(opts.filterFreq, t0);
      if (opts.filterEnd) f.frequency.exponentialRampToValueAtTime(Math.max(30, opts.filterEnd), t0 + opts.dur);
      f.Q.value = 1.1;
      node.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(opts.bus ?? this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  private noise(opts: { dur: number; gain?: number; filterFreq?: number; filterEnd?: number; filterType?: BiquadFilterType; delay?: number; bus?: GainNode }): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * opts.dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.gain ?? 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    let node: AudioNode = src;
    if (opts.filterFreq) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filterType ?? 'lowpass';
      f.frequency.setValueAtTime(opts.filterFreq, t0);
      if (opts.filterEnd) f.frequency.exponentialRampToValueAtTime(Math.max(30, opts.filterEnd), t0 + opts.dur);
      node.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(opts.bus ?? this.sfxBus);
    src.start(t0);
  }

  /* ---------------------------------------------------------------- */
  /* SFX                                                              */
  /* ---------------------------------------------------------------- */

  shoot(): void {
    this.tone({ freq: 920, endFreq: 380, dur: 0.085, type: 'square', gain: 0.05, filterFreq: 2600, filterEnd: 900 });
    this.tone({ freq: 1840, endFreq: 900, dur: 0.05, type: 'sine', gain: 0.028 });
  }

  enemyShoot(): void {
    this.tone({ freq: 260, endFreq: 120, dur: 0.11, type: 'sawtooth', gain: 0.038, filterFreq: 1200, filterEnd: 420 });
  }

  hit(): void {
    this.noise({ dur: 0.07, gain: 0.1, filterFreq: 3200, filterEnd: 1100, filterType: 'bandpass' });
  }

  explosion(big = false): void {
    const s = big ? 1.7 : 1;
    this.noise({ dur: 0.55 * s, gain: 0.3, filterFreq: 900, filterEnd: 120 });
    this.tone({ freq: 130, endFreq: 38, dur: 0.5 * s, type: 'sine', gain: 0.28 });
    if (big) {
      this.noise({ dur: 1.1, gain: 0.16, filterFreq: 400, filterEnd: 60, delay: 0.08 });
      this.tone({ freq: 70, endFreq: 30, dur: 1.0, type: 'triangle', gain: 0.22, delay: 0.05 });
    }
  }

  pickup(): void {
    this.tone({ freq: 740, endFreq: 1180, dur: 0.1, type: 'triangle', gain: 0.11 });
    this.tone({ freq: 1480, endFreq: 1760, dur: 0.12, type: 'sine', gain: 0.07, delay: 0.055 });
  }

  health(): void {
    this.tone({ freq: 520, endFreq: 780, dur: 0.14, type: 'sine', gain: 0.12 });
    this.tone({ freq: 780, endFreq: 1040, dur: 0.18, type: 'sine', gain: 0.1, delay: 0.1 });
  }

  evolve(): void {
    const base = 220;
    for (const [mult, d] of [[1, 0.7], [1.5, 0.75], [2, 0.8], [3, 0.9]] as const) {
      this.tone({ freq: base * mult, dur: d, type: 'triangle', gain: 0.09, attack: 0.16, filterFreq: 900 + mult * 400, filterType: 'lowpass' });
    }
    for (let i = 0; i < 6; i++) {
      this.tone({ freq: 880 * Math.pow(1.26, i), dur: 0.12, type: 'sine', gain: 0.05, delay: 0.1 + i * 0.06 });
    }
    this.noise({ dur: 0.6, gain: 0.06, filterFreq: 2200, filterEnd: 6800, filterType: 'bandpass' });
  }

  damage(): void {
    this.tone({ freq: 320, endFreq: 82, dur: 0.24, type: 'sawtooth', gain: 0.16, filterFreq: 1600, filterEnd: 300 });
    this.noise({ dur: 0.18, gain: 0.14, filterFreq: 1800, filterEnd: 350 });
  }

  mega(): void {
    this.tone({ freq: 90, endFreq: 28, dur: 0.85, type: 'sine', gain: 0.32 });
    this.noise({ dur: 0.75, gain: 0.22, filterFreq: 260, filterEnd: 5200, filterType: 'bandpass' });
    this.tone({ freq: 440, endFreq: 1760, dur: 0.5, type: 'sawtooth', gain: 0.1, filterFreq: 2400, delay: 0.03 });
    this.tone({ freq: 220, endFreq: 880, dur: 0.65, type: 'triangle', gain: 0.12, attack: 0.05 });
  }

  bossRoar(): void {
    this.tone({ freq: 150, endFreq: 68, dur: 1.15, type: 'sawtooth', gain: 0.16, filterFreq: 900, filterEnd: 240, detune: -12 });
    this.tone({ freq: 156, endFreq: 72, dur: 1.15, type: 'sawtooth', gain: 0.13, filterFreq: 800, filterEnd: 220, detune: 14 });
    this.noise({ dur: 1.0, gain: 0.12, filterFreq: 500, filterEnd: 130 });
  }

  hatch(): void {
    this.tone({ freq: 180, endFreq: 760, dur: 0.42, type: 'sawtooth', gain: 0.1, filterFreq: 700, filterEnd: 2600 });
    this.noise({ dur: 0.32, gain: 0.13, filterFreq: 900, filterEnd: 2600, filterType: 'bandpass' });
    this.tone({ freq: 900, endFreq: 220, dur: 0.3, type: 'square', gain: 0.06, delay: 0.22 });
  }

  armorBreak(): void {
    this.noise({ dur: 0.28, gain: 0.2, filterFreq: 2400, filterEnd: 700, filterType: 'bandpass' });
    this.tone({ freq: 620, endFreq: 210, dur: 0.22, type: 'triangle', gain: 0.14 });
    this.tone({ freq: 1240, endFreq: 430, dur: 0.14, type: 'square', gain: 0.06 });
  }

  warning(): void {
    this.tone({ freq: 620, dur: 0.12, type: 'square', gain: 0.07 });
    this.tone({ freq: 460, dur: 0.14, type: 'square', gain: 0.07, delay: 0.14 });
  }

  uiClick(): void {
    this.tone({ freq: 1180, endFreq: 880, dur: 0.045, type: 'sine', gain: 0.07 });
  }

  uiHover(): void {
    this.tone({ freq: 880, dur: 0.03, type: 'sine', gain: 0.028 });
  }

  victory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 2093];
    notes.forEach((f, i) => {
      this.tone({ freq: f, dur: 0.32, type: 'triangle', gain: 0.12, delay: i * 0.16, filterFreq: 4200 });
      this.tone({ freq: f * 2, dur: 0.22, type: 'sine', gain: 0.05, delay: i * 0.16 });
    });
    this.tone({ freq: 261.6, dur: 1.4, type: 'triangle', gain: 0.12, attack: 0.03, delay: 1.1 });
    this.tone({ freq: 329.6, dur: 1.4, type: 'triangle', gain: 0.1, attack: 0.03, delay: 1.1 });
    this.tone({ freq: 392, dur: 1.4, type: 'triangle', gain: 0.1, attack: 0.03, delay: 1.1 });
  }

  defeat(): void {
    const notes = [440, 349.2, 293.7, 220, 174.6, 146.8, 110];
    notes.forEach((f, i) => {
      this.tone({ freq: f, dur: 0.42, type: 'triangle', gain: 0.11, delay: i * 0.24, filterFreq: 2200 });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Generative music                                                  */
  /* ---------------------------------------------------------------- */

  startTheme(theme: 'menu' | 'stage1' | 'stage2' | 'stage3'): void {
    if (!this.ctx) return;
    if (this.theme === theme && this.musicTimer !== null) return;
    this.stopMusic();
    this.theme = theme;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.theme = 'none';
  }

  /** 16th-note scheduler with lookahead. */
  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed' || this.theme === 'none') return;
    const bpm = this.theme === 'stage3' ? 132 : this.theme === 'menu' ? 104 : this.theme === 'stage2' ? 108 : 118;
    const stepDur = 60 / bpm / 4;
    while (this.nextNoteTime < ctx.currentTime + 0.32) {
      this.playStep(this.step, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % 64; // 4 bars of 16 steps
    }
  }

  private playStep(step: number, time: number, stepDur: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const theme = this.theme;

    // Chord roots per bar (semitone offsets from base)
    const prog: Record<string, number[]> = {
      menu: [0, -4, -7, -4],
      stage1: [0, -4, -7, -2],
      stage2: [0, -7, -3, -5],
      stage3: [0, -1, -5, 0],
    };
    const baseFreq: Record<string, number> = {
      menu: 110,
      stage1: 110,
      stage2: 92.5,
      stage3: 73.4,
    };
    const root = baseFreq[theme] * Math.pow(2, prog[theme][bar] / 12);
    const bus = this.musicBus;

    // --- drums ---
    const kickOn = theme === 'stage2' ? s % 8 === 0 : s % 4 === 0;
    if (kickOn && theme !== 'menu') {
      const t = time;
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(44, t + 0.12);
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(g);
        g.connect(bus);
        osc.start(t);
        osc.stop(t + 0.2);
      } catch {
        /* context closed mid-schedule */
      }
    }
    if (theme !== 'menu' && (s === 4 || s === 12)) {
      // snare-ish
      this.noise({ dur: 0.13, gain: 0.12, filterFreq: 1900, filterEnd: 900, filterType: 'bandpass', bus, delay: time - (this.ctx?.currentTime ?? 0) });
      this.tone({ freq: 190, endFreq: 130, dur: 0.1, type: 'triangle', gain: 0.09, bus, delay: time - (this.ctx?.currentTime ?? 0) });
    }
    if (theme !== 'menu' && s % 2 === 1) {
      this.noise({ dur: 0.045, gain: theme === 'stage3' ? 0.05 : 0.032, filterFreq: 8200, filterType: 'highpass', bus, delay: time - (this.ctx?.currentTime ?? 0) });
    }

    // --- bass ---
    const bassPattern = theme === 'stage3' ? [0, 0, 7, 0, 0, 12, 0, 7] : [0, 0, 0, 7, 0, 0, 12, 0];
    if (s % 2 === 0) {
      const n = bassPattern[(s / 2) % 8];
      this.tone({
        freq: root * Math.pow(2, n / 12),
        dur: stepDur * 1.8,
        type: theme === 'stage3' ? 'sawtooth' : 'triangle',
        gain: theme === 'menu' ? 0.05 : 0.12,
        filterFreq: theme === 'stage3' ? 520 : 320,
        filterType: 'lowpass',
        bus,
        delay: time - (this.ctx?.currentTime ?? 0),
      });
    }

    // --- arp / lead ---
    const arpScale = theme === 'stage2' ? [0, 4, 7, 11, 14, 11, 7, 4] : theme === 'stage3' ? [0, 1, 5, 7, 8, 7, 5, 1] : [0, 3, 5, 7, 10, 7, 5, 3];
    const arpGate = theme === 'menu' ? s % 4 === 0 : theme === 'stage2' ? s % 2 === 0 : s % 2 === 0;
    if (arpGate) {
      const n = arpScale[(Math.floor(s / 2) + bar * 2) % arpScale.length];
      this.tone({
        freq: root * 4 * Math.pow(2, n / 12),
        dur: stepDur * 1.35,
        type: theme === 'menu' ? 'sine' : 'square',
        gain: theme === 'menu' ? 0.035 : 0.038,
        filterFreq: 2600,
        filterType: 'lowpass',
        bus,
        delay: time - (this.ctx?.currentTime ?? 0),
      });
      if (theme !== 'menu') {
        this.tone({
          freq: root * 8 * Math.pow(2, n / 12),
          dur: stepDur * 0.9,
          type: 'sine',
          gain: 0.018,
          bus,
          delay: time - (this.ctx?.currentTime ?? 0),
        });
      }
    }

    // --- pad (once per bar) ---
    if (s === 0) {
      for (const iv of [0, 7, 12, 16]) {
        this.tone({
          freq: root * 2 * Math.pow(2, iv / 12),
          dur: stepDur * 15,
          type: 'sawtooth',
          gain: theme === 'menu' ? 0.012 : 0.017,
          attack: 0.6,
          filterFreq: 760,
          filterType: 'lowpass',
          detune: iv % 2 ? 6 : -6,
          bus,
          delay: time - (this.ctx?.currentTime ?? 0),
        });
      }
    }
  }

  dispose(): void {
    this.stopMusic();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
