// WP4 owns this file.
import type { Settings, TimerConfig } from '../core/types';
import { KEYS, isObject, readJSON, writeJSON } from './store';

export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  volume: 0.6,
  reducedMotion: 'system',
  shuffleAnswers: true,
  defaultTimer: { mode: 'off' },
  hostCommentary: true,
  revealDelayMs: 2500,
};

function sanitizeTimer(t: unknown): TimerConfig {
  if (isObject(t) && t.mode === 'clock' && Array.isArray(t.secondsPerQuestion)) {
    const secs = t.secondsPerQuestion.filter((n): n is number => typeof n === 'number' && n > 0);
    if (secs.length > 0 && secs.length === t.secondsPerQuestion.length) {
      return {
        mode: 'clock',
        secondsPerQuestion: secs,
        bankUnusedToLast: t.bankUnusedToLast === true,
        onTimeout: t.onTimeout === 'lose' ? 'lose' : 'walk',
      };
    }
  }
  return { mode: 'off' };
}

/** Field-by-field sanitise; invalid fields fall back to defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObject(raw)) return { ...d, defaultTimer: { mode: 'off' } };
  const num = (v: unknown, lo: number, hi: number, def: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  return {
    muted: bool(raw.muted, d.muted),
    volume: num(raw.volume, 0, 1, d.volume),
    reducedMotion:
      raw.reducedMotion === 'on' || raw.reducedMotion === 'off' || raw.reducedMotion === 'system'
        ? raw.reducedMotion
        : d.reducedMotion,
    shuffleAnswers: bool(raw.shuffleAnswers, d.shuffleAnswers),
    defaultTimer: sanitizeTimer(raw.defaultTimer),
    hostCommentary: bool(raw.hostCommentary, d.hostCommentary),
    revealDelayMs: num(raw.revealDelayMs, 0, 10000, d.revealDelayMs),
  };
}

export function getSettings(): Settings {
  return sanitizeSettings(readJSON<unknown>(KEYS.settings, null));
}

export function saveSettings(s: Settings): void {
  writeJSON(KEYS.settings, sanitizeSettings(s));
}
