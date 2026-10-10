// WP4 owns this file.
import type { CustomGame, ExportFile, ImportResult, LifelineDef } from '../core/types';
import { BUILT_IN_LIFELINES } from '../core/lifelines';
import { KEYS, isObject, uid, writeJSON } from './store';
import {
  flagQuestion,
  getFlaggedQuestionIds,
  listCustomGames,
  listCustomLifelines,
} from './customGames';
import { checkCustomGame, checkLifeline } from './validate';

const RESERVED_LIFELINE_IDS = BUILT_IN_LIFELINES.map((l) => l.id);

export function exportJSON(gameIds?: string[]): string {
  const all = listCustomGames();
  const games = gameIds ? all.filter((g) => gameIds.includes(g.id)) : all;
  const usedIds = new Set(games.flatMap((g) => g.lifelineIds));
  const lifelines = listCustomLifelines().filter((l) => !gameIds || usedIds.has(l.id));
  const file: ExportFile = {
    format: 'millionaire-custom',
    version: 1,
    games,
    lifelines,
    flaggedQuestionIds: getFlaggedQuestionIds(),
  };
  return JSON.stringify(file, null, 2);
}

export function importJSON(text: string): ImportResult {
  const errors: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { imported: 0, errors: ['File is not valid JSON.'] };
  }
  if (!isObject(data) || data.format !== 'millionaire-custom') {
    return { imported: 0, errors: ['Not a millionaire-custom export file.'] };
  }
  if (data.version !== 1) {
    return { imported: 0, errors: [`Unsupported export version: ${String(data.version)}.`] };
  }

  const existingGames = listCustomGames();
  const existingLifelines = listCustomLifelines();
  const gameIds = new Set(existingGames.map((g) => g.id));
  const lifelineIds = new Set([
    ...existingLifelines.map((l) => l.id),
    ...RESERVED_LIFELINE_IDS,
    ...BUILT_IN_LIFELINES.map((l) => l.id),
  ]);

  // Lifelines first, recording id remaps for games.
  const remap = new Map<string, string>();
  const newLifelines: LifelineDef[] = [];
  const inLifelines: unknown[] = Array.isArray(data.lifelines) ? data.lifelines : [];
  inLifelines.forEach((raw, i) => {
    const errs = checkLifeline(raw);
    if (errs.length) {
      errors.push(`Lifeline #${i + 1}: ${errs.join('; ')}`);
      return;
    }
    const l = { ...(raw as LifelineDef), builtIn: false };
    const oldId = l.id;
    const same = existingLifelines.find(
      (e) =>
        e.id === l.id &&
        JSON.stringify([e.name, e.icon, e.effect, e.params, e.uses, e.availableFromQ]) ===
          JSON.stringify([l.name, l.icon, l.effect, l.params, l.uses, l.availableFromQ]),
    );
    if (same) return; // identical lifeline already stored: reuse it rather than duplicating
    if (lifelineIds.has(l.id)) l.id = uid('ll');
    lifelineIds.add(l.id);
    if (l.id !== oldId) remap.set(oldId, l.id);
    newLifelines.push(l);
  });

  const newGames: CustomGame[] = [];
  const inGames: unknown[] = Array.isArray(data.games) ? data.games : [];
  inGames.forEach((raw, i) => {
    const errs = checkCustomGame(raw);
    if (errs.length) {
      const name = isObject(raw) && typeof raw.name === 'string' ? ` "${raw.name}"` : '';
      errors.push(`Game #${i + 1}${name}: ${errs.join('; ')}`);
      return;
    }
    const g = raw as CustomGame;
    const copy: CustomGame = {
      ...g,
      lifelineIds: g.lifelineIds.map((id) => remap.get(id) ?? id),
    };
    if (gameIds.has(copy.id)) copy.id = uid('game');
    gameIds.add(copy.id);
    newGames.push(copy);
  });

  if (newGames.length || newLifelines.length) {
    const okL = writeJSON(KEYS.lifelines, [...existingLifelines, ...newLifelines]);
    const okG = writeJSON(KEYS.custom, [...existingGames, ...newGames]);
    if (!okL || !okG) {
      errors.push('Could not save imported data (storage full or unavailable).');
      return { imported: 0, errors };
    }
  }
  if (Array.isArray(data.flaggedQuestionIds)) {
    for (const id of data.flaggedQuestionIds) if (typeof id === 'string') flagQuestion(id);
  }
  return { imported: newGames.length, errors };
}
