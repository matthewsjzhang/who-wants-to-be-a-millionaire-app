// WP4 owns this file.
import type { CustomGame, LifelineDef } from '../core/types';
import { KEYS, isObject, readJSON, writeJSON } from './store';
import { validateCustomGameLocal, validateLifelineLocal } from './validate';

function readList<T extends { id: string }>(key: string, check: (x: unknown) => boolean): T[] {
  const raw = readJSON<unknown>(key, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is T => isObject(x) && typeof x.id === 'string' && check(x));
}

export function listCustomGames(): CustomGame[] {
  return readList<CustomGame>(KEYS.custom, (g) => validateCustomGameLocal(g).length === 0);
}

/** Returns false if storage write failed (e.g. quota). */
export function upsertCustomGame(g: CustomGame): boolean {
  const list = listCustomGames();
  const i = list.findIndex((x) => x.id === g.id);
  if (i >= 0) list[i] = g;
  else list.push(g);
  return writeJSON(KEYS.custom, list);
}

export function deleteCustomGame(id: string): void {
  writeJSON(
    KEYS.custom,
    listCustomGames().filter((g) => g.id !== id),
  );
}

export function listCustomLifelines(): LifelineDef[] {
  return readList<LifelineDef>(KEYS.lifelines, (l) => validateLifelineLocal(l).length === 0);
}

export function upsertLifeline(l: LifelineDef): boolean {
  const list = listCustomLifelines();
  const i = list.findIndex((x) => x.id === l.id);
  const def = { ...l, builtIn: false };
  if (i >= 0) list[i] = def;
  else list.push(def);
  return writeJSON(KEYS.lifelines, list);
}

export function deleteLifeline(id: string): void {
  writeJSON(
    KEYS.lifelines,
    listCustomLifelines().filter((l) => l.id !== id),
  );
}

/** Locally flagged ("Report question") ids. */
export function getFlaggedQuestionIds(): string[] {
  const raw = readJSON<unknown>(KEYS.flagged, []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

export function flagQuestion(id: string): void {
  const ids = getFlaggedQuestionIds();
  if (!ids.includes(id)) writeJSON(KEYS.flagged, [...ids, id]);
}

export function unflagQuestion(id: string): void {
  writeJSON(
    KEYS.flagged,
    getFlaggedQuestionIds().filter((x) => x !== id),
  );
}
