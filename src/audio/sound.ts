// WP5: WebAudio-synth-only sound engine. No audio files. Silent no-op if unsupported.
import type { SoundApi, SoundCue } from '../core/types';

type Ctor = new () => AudioContext;

function detectCtor(): Ctor | undefined {
  const g = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return g.AudioContext ?? g.webkitAudioContext;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const MASTER_PEAK = 0.5;

export function createSound(getCtor: () => Ctor | undefined = detectCtor): SoundApi {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let failed = false;
  let muted = false;
  let volume = 0.7;
  let bed: { stop: () => void } | null = null;

  const level = (): number => (muted ? 0 : volume * MASTER_PEAK);

  function applyLevel(): void {
    if (master && ctx) {
      try {
        master.gain.setValueAtTime(level(), ctx.currentTime);
      } catch {
        /* ignore */
      }
    }
  }

  function ensure(): AudioContext | null {
    if (ctx) return ctx;
    if (failed) return null;
    try {
      const C = getCtor();
      if (!C) {
        failed = true;
        return null;
      }
      ctx = new C();
      master = ctx.createGain();
      master.connect(ctx.destination);
      applyLevel();
    } catch {
      failed = true;
      ctx = null;
      master = null;
    }
    return ctx;
  }

  /** One enveloped oscillator note. */
  function tone(
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType = 'sine',
    peak = 0.5,
    endFreq?: number,
  ): void {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== undefined) osc.frequency.linearRampToValueAtTime(endFreq, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function startBed(): void {
    if (bed || !ctx || !master) return;
    const c = ctx;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, c.currentTime);
    out.gain.linearRampToValueAtTime(0.35, c.currentTime + 0.8);
    out.connect(master);
    const pulse = c.createGain();
    pulse.gain.setValueAtTime(0.6, c.currentTime);
    pulse.connect(out);
    const lfo = c.createOscillator();
    const lfoDepth = c.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(1.1, c.currentTime); // slow tense pulse
    lfoDepth.gain.setValueAtTime(0.4, c.currentTime);
    lfo.connect(lfoDepth);
    lfoDepth.connect(pulse.gain);
    const oscs = [55, 58.3, 82.4].map((f, i) => {
      const o = c.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.setValueAtTime(f, c.currentTime);
      o.connect(pulse);
      o.start();
      return o;
    });
    lfo.start();
    bed = {
      stop() {
        const t = c.currentTime;
        try {
          out.gain.cancelScheduledValues(t);
          out.gain.setValueAtTime(out.gain.value, t);
          out.gain.linearRampToValueAtTime(0.0001, t + 0.25);
          for (const o of [...oscs, lfo]) o.stop(t + 0.3);
        } catch {
          /* ignore */
        }
      },
    };
  }

  function stopBed(): void {
    if (!bed) return;
    const b = bed;
    bed = null;
    b.stop();
  }

  function render(cue: SoundCue): void {
    switch (cue) {
      case 'select':
        tone(520, 0, 0.12, 'triangle', 0.4);
        break;
      case 'final':
        tone(196, 0, 0.5, 'sawtooth', 0.3);
        tone(293.7, 0.12, 0.6, 'triangle', 0.35);
        break;
      case 'correct':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.4, 'triangle', 0.4));
        break;
      case 'wrong':
        tone(311, 0, 0.35, 'sawtooth', 0.4, 220);
        tone(220, 0.3, 0.7, 'sawtooth', 0.4, 110);
        break;
      case 'lifeline':
        tone(440, 0, 0.18, 'square', 0.2);
        tone(660, 0.12, 0.18, 'square', 0.2);
        tone(880, 0.24, 0.3, 'square', 0.2);
        break;
      case 'milestone':
        [392, 523.25, 659.25].forEach((f, i) => tone(f, i * 0.14, 0.5, 'triangle', 0.4));
        tone(784, 0.45, 0.8, 'triangle', 0.4);
        break;
      case 'tick':
        tone(1200, 0, 0.05, 'square', 0.15);
        break;
      case 'win': {
        const notes: Array<[number, number, number]> = [
          [523.25, 0, 0.2],
          [523.25, 0.2, 0.2],
          [523.25, 0.4, 0.2],
          [659.25, 0.6, 0.35],
          [783.99, 0.95, 0.35],
          [1046.5, 1.3, 1.0],
        ];
        for (const [f, s, d] of notes) {
          tone(f, s, d, 'sawtooth', 0.25);
          tone(f / 2, s, d, 'triangle', 0.3);
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') {
        try {
          void Promise.resolve(c.resume()).catch(() => undefined);
        } catch {
          /* ignore */
        }
      }
    },
    play(cue) {
      try {
        if (cue === 'bed-stop') {
          stopBed();
          return;
        }
        if (!ensure()) return;
        if (cue === 'bed-start') startBed();
        else render(cue);
      } catch {
        /* never throw from audio */
      }
    },
    setMuted(m) {
      muted = !!m;
      applyLevel();
    },
    setVolume(v) {
      volume = clamp01(v);
      applyLevel();
    },
  };
}

export const sound: SoundApi = createSound();
