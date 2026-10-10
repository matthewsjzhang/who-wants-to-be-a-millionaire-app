// WP4 owns this file.
import type { GameState, SavedGame } from '../core/types';
import { KEYS, isObject, readJSON, removeKey, writeJSON } from './store';

function isGameState(s: unknown): s is GameState {
  if (!isObject(s)) return false;
  const cfg = s.config;
  return (
    typeof s.phase === 'string' &&
    typeof s.qIndex === 'number' &&
    isObject(s.current) &&
    Array.isArray(s.eliminated) &&
    isObject(s.lifelineUses) &&
    isObject(s.activeEffects) &&
    isObject(cfg) &&
    Array.isArray(cfg.questions) &&
    isObject(cfg.ladder) &&
    Array.isArray((cfg.ladder as Record<string, unknown>).prizes) &&
    Array.isArray(cfg.lifelines)
  );
}

function isSaved(v: unknown): v is SavedGame {
  return isObject(v) && v.version === 1 && isGameState(v.state);
}

export function saveGame(s: GameState): void {
  const wrapped: SavedGame = { version: 1, savedAt: new Date().toISOString(), state: s };
  writeJSON(KEYS.save, wrapped);
}

/** Returns null when nothing saved, corrupt, or the saved game is already finished. */
export function loadSavedGame(): GameState | null {
  const v = readJSON<SavedGame | null>(KEYS.save, null, (x): x is SavedGame => isSaved(x));
  if (!v) return null;
  if (v.state.phase === 'WON' || v.state.phase === 'GAME_OVER') return null;
  return v.state;
}

export function clearSavedGame(): void {
  removeKey(KEYS.save);
}
