// WP4: light local validation, combined with the shared validators (written concurrently by WP2/WP3).
import type { CustomGame, LifelineDef } from '../core/types';
import { validateCustomGame } from '../data/schema';
import { validateLifeline } from '../core/lifelines';
import { isObject } from './store';

const EFFECTS = [
  'remove-wrong',
  'friend-hint',
  'audience-poll',
  'skip-question',
  'second-chance',
  'extra-time',
  'host-hint',
];

function validQuestion(q: unknown): boolean {
  return (
    isObject(q) &&
    typeof q.id === 'string' &&
    typeof q.text === 'string' &&
    Array.isArray(q.answers) &&
    q.answers.length === 4 &&
    q.answers.every((a) => typeof a === 'string') &&
    [0, 1, 2, 3].includes(q.correct as number) &&
    [1, 2, 3, 4, 5].includes(q.difficulty as number)
  );
}

export function validateLifelineLocal(l: unknown): string[] {
  if (!isObject(l)) return ['lifeline must be an object'];
  const errs: string[] = [];
  if (typeof l.id !== 'string' || !l.id) errs.push('lifeline id missing');
  if (typeof l.name !== 'string' || !l.name.trim()) errs.push('lifeline name missing');
  if (typeof l.icon !== 'string') errs.push('lifeline icon missing');
  if (!EFFECTS.includes(l.effect as string)) errs.push('lifeline effect invalid');
  if (!isObject(l.params)) errs.push('lifeline params missing');
  if (typeof l.uses !== 'number' || !(l.uses >= 1)) errs.push('lifeline uses must be >= 1');
  return errs;
}

export function validateCustomGameLocal(g: unknown): string[] {
  if (!isObject(g)) return ['game must be an object'];
  const errs: string[] = [];
  if (typeof g.id !== 'string' || !g.id) errs.push('game id missing');
  if (typeof g.name !== 'string' || !g.name.trim()) errs.push('game name missing');
  if (!Array.isArray(g.questions) || !g.questions.every(validQuestion)) errs.push('questions invalid');
  if (!Array.isArray(g.spares) || !g.spares.every(validQuestion)) errs.push('spares invalid');
  const l = g.ladder;
  if (
    !isObject(l) ||
    !Array.isArray(l.prizes) ||
    l.prizes.length < 1 ||
    l.prizes.length > 20 ||
    !l.prizes.every(
      (p, i) => typeof p === 'number' && (i === 0 || p > (l.prizes as number[])[i - 1]),
    ) ||
    !Array.isArray(l.safeHavens)
  ) {
    errs.push('ladder invalid');
  } else if (Array.isArray(g.questions) && g.questions.length !== l.prizes.length) {
    errs.push('question count must equal ladder length');
  }
  if (!Array.isArray(g.lifelineIds)) errs.push('lifelineIds invalid');
  if (!isObject(g.timer) || (g.timer.mode !== 'off' && g.timer.mode !== 'clock')) {
    errs.push('timer invalid');
  }
  return errs;
}

/** Local checks plus the shared validator (a throwing stub is tolerated). */
export function checkLifeline(l: unknown): string[] {
  const errs = validateLifelineLocal(l);
  if (errs.length) return errs;
  try {
    return validateLifeline(l as LifelineDef);
  } catch {
    return [];
  }
}

export function checkCustomGame(g: unknown): string[] {
  const errs = validateCustomGameLocal(g);
  if (errs.length) return errs;
  try {
    const r = validateCustomGame(g as CustomGame);
    return r.ok ? [] : r.errors;
  } catch {
    return [];
  }
}
