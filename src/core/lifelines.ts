// WP2: lifeline definitions, effect resolution and validation.
import type { EffectResult, EffectType, GameState, LifelineDef, Question } from './types';
import type { Rng } from './rng';
import { audiencePoll, friendHint, hostHint } from './simulate';

export const BUILT_IN_LIFELINES: LifelineDef[] = [
  { id: 'fifty-fifty', name: '50:50', icon: '50:50', effect: 'remove-wrong', params: { n: 2 }, uses: 1, builtIn: true },
  { id: 'phone-a-friend', name: 'Phone a Friend', icon: '\u{1F4DE}', effect: 'friend-hint', params: {}, uses: 1, builtIn: true },
  { id: 'ask-the-audience', name: 'Ask the Audience', icon: '\u{1F465}', effect: 'audience-poll', params: {}, uses: 1, builtIn: true },
  { id: 'switch-the-question', name: 'Switch the Question', icon: '\u{1F501}', effect: 'skip-question', params: {}, uses: 1, availableFromQ: 10, builtIn: true },
  { id: 'double-dip', name: 'Double Dip', icon: '\u{1F3AF}', effect: 'second-chance', params: {}, uses: 1, builtIn: true },
];

/** Built-in lifelines enabled by default (Switch the Question and Double Dip are opt-in). */
export const DEFAULT_LIFELINE_IDS: string[] = ['fifty-fifty', 'phone-a-friend', 'ask-the-audience'];

const EFFECTS: EffectType[] = [
  'remove-wrong',
  'friend-hint',
  'audience-poll',
  'skip-question',
  'second-chance',
  'extra-time',
  'host-hint',
];

/** Unused spare with difficulty nearest to `difficulty`; ties broken by list order. */
function nearestSpare(spares: Question[], used: string[], difficulty: number): Question | undefined {
  let best: Question | undefined;
  let bestDist = Infinity;
  for (const s of spares) {
    if (used.includes(s.id)) continue;
    const dist = Math.abs(s.difficulty - difficulty);
    if (dist < bestDist) {
      best = s;
      bestDist = dist;
    }
  }
  return best;
}

export function applyEffect(def: LifelineDef, state: GameState, rng: Rng): EffectResult {
  const q = state.current;
  const elim = state.eliminated;
  switch (def.effect) {
    case 'remove-wrong': {
      const pool = [0, 1, 2, 3].filter((i) => i !== q.correct && !elim.includes(i));
      const n = Math.max(0, Math.min(Math.floor(def.params.n ?? 2), 2, pool.length));
      const out: number[] = [];
      for (let k = 0; k < n; k++) {
        const j = Math.min(pool.length - 1, Math.floor(rng.next() * pool.length));
        out.push(pool.splice(j, 1)[0]);
      }
      return { eliminate: out.sort((a, b) => a - b) };
    }
    case 'audience-poll':
      return { poll: audiencePoll(q, elim, q.difficulty, rng, def.params.accuracy) };
    case 'friend-hint':
      return { hint: friendHint(q, elim, q.difficulty, rng, def.params.accuracy) };
    case 'host-hint':
      return { hint: hostHint(q, elim, q.difficulty, rng, def.params.accuracy) };
    case 'skip-question': {
      const replacement = nearestSpare(state.config.spares, state.usedSpareIds, q.difficulty);
      return replacement ? { replaceQuestion: replacement } : {};
    }
    case 'second-chance':
      return { armSecondChance: true };
    case 'extra-time':
      return { addTimeMs: (def.params.seconds ?? 30) * 1000 };
    default:
      return {};
  }
}

export function validateLifeline(def: LifelineDef): string[] {
  const errors: string[] = [];
  if (typeof def.id !== 'string' || def.id.trim() === '') errors.push('id is required');
  if (typeof def.name !== 'string' || def.name.trim() === '') errors.push('name is required');
  else if (def.name.length > 40) errors.push('name must be 40 characters or fewer');
  if (typeof def.icon !== 'string' || def.icon.trim() === '') errors.push('icon is required');
  if (!EFFECTS.includes(def.effect)) {
    errors.push(`effect must be one of: ${EFFECTS.join(', ')}`);
  }
  if (!Number.isInteger(def.uses) || def.uses < 1 || def.uses > 20) {
    errors.push('uses must be an integer between 1 and 20');
  }
  if (
    def.availableFromQ !== undefined &&
    (!Number.isInteger(def.availableFromQ) || def.availableFromQ < 0)
  ) {
    errors.push('availableFromQ must be a non-negative integer');
  }
  if (def.params === undefined || def.params === null || typeof def.params !== 'object') {
    errors.push('params must be an object');
    return errors;
  }
  const p = def.params;
  if (def.effect === 'remove-wrong') {
    if (p.n === undefined) errors.push('remove-wrong requires params.n (1 or 2)');
    else if (!Number.isInteger(p.n) || p.n < 1 || p.n > 2) errors.push('params.n must be 1 or 2');
  }
  if (def.effect === 'friend-hint' || def.effect === 'audience-poll' || def.effect === 'host-hint') {
    if (p.accuracy !== undefined && (typeof p.accuracy !== 'number' || !(p.accuracy >= 0 && p.accuracy <= 1))) {
      errors.push('params.accuracy must be a number between 0 and 1');
    }
  }
  if (def.effect === 'extra-time') {
    if (p.seconds === undefined) errors.push('extra-time requires params.seconds (5-120)');
    else if (typeof p.seconds !== 'number' || !(p.seconds >= 5 && p.seconds <= 120)) {
      errors.push('params.seconds must be between 5 and 120');
    }
  }
  return errors;
}
