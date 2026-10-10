// WP1: pure game reducer.
//
// Conventions (relied on by the UI):
//  - `qIndex` is the question currently shown / just answered. It only advances on NEXT
//    (CORRECT or MILESTONE -> PRESENTING). During CORRECT/MILESTONE, qIndex is the answered question.
//  - REVEAL on a wrong answer moves to WRONG. In WRONG, NEXT either returns to AWAITING (second chance
//    available: the wrong answer is eliminated) or ends the game (GAME_OVER, outcome 'wrong').
//    `outcome`/`winnings` are already set on entering a final WRONG so the UI can display them.
//  - After the last correct answer REVEAL -> CORRECT, NEXT -> WON (winnings = top prize).
//  - Illegal events return the very same state object.
import { applyEffect } from './lifelines';
import { guaranteedAt } from './ladder';
import type { Rng } from './rng';
import type {
  AnswerIndex,
  EffectResult,
  GameConfig,
  GameEvent,
  GameLogEntry,
  GameOutcome,
  GameState,
  LifelineDef,
  Question,
} from './types';

const FRESH_EFFECTS = (): GameState['activeEffects'] => ({
  secondChanceArmed: false,
  secondChanceUsedOnQuestion: false,
});

function initialTimeMs(cfg: GameConfig, qIndex: number, bankedMs: number): number | undefined {
  if (cfg.timer.mode !== 'clock') return undefined;
  const secs = cfg.timer.secondsPerQuestion[qIndex] ?? cfg.timer.secondsPerQuestion.at(-1) ?? 30;
  const isLast = qIndex === cfg.ladder.prizes.length - 1;
  return secs * 1000 + (cfg.timer.bankUnusedToLast && isLast ? bankedMs : 0);
}

export function createGame(cfg: GameConfig): GameState {
  return {
    phase: 'INTRO',
    config: cfg,
    qIndex: 0,
    current: cfg.questions[0],
    eliminated: [],
    lifelineUses: {},
    activeEffects: FRESH_EFFECTS(),
    timeLeftMs: initialTimeMs(cfg, 0, 0),
    bankedMs: 0,
    usedSpareIds: [],
    startedAt: Date.now(),
    lifelinesUsed: [],
    log: [],
  };
}

// ---------------------------------------------------------------- helpers
function withLog(s: GameState, type: string, detail?: string): GameLogEntry[] {
  const e: GameLogEntry = { t: s.log.length, type, qIndex: s.qIndex };
  if (detail !== undefined) e.detail = detail;
  return [...s.log, e];
}

/** Shuffle answers (seeded) and remap `correct`. */
function presentQuestion(q: Question, shuffle: boolean, rng: Rng): Question {
  if (!shuffle) return q;
  const perm = rng.shuffle([0, 1, 2, 3]);
  const answers = perm.map((p) => q.answers[p]) as Question['answers'];
  return { ...q, answers, correct: perm.indexOf(q.correct) as AnswerIndex };
}

function isLast(s: GameState): boolean {
  return s.qIndex >= s.config.ladder.prizes.length - 1;
}

function secondChanceLocked(s: GameState): boolean {
  return s.activeEffects.secondChanceArmed;
}

function lifelineUsable(s: GameState, def: LifelineDef): boolean {
  if ((s.lifelineUses[def.id] ?? 0) >= def.uses) return false;
  if (s.qIndex < (def.availableFromQ ?? 0)) return false;
  if (secondChanceLocked(s)) return false;
  if (def.effect === 'skip-question' && !s.config.spares.some((q) => !s.usedSpareIds.includes(q.id))) {
    return false;
  }
  if (def.effect === 'extra-time' && s.config.timer.mode !== 'clock') return false;
  if (def.effect === 'second-chance' && s.activeEffects.secondChanceArmed) return false;
  return true;
}

function prizeWon(s: GameState): number {
  return s.qIndex > 0 ? (s.config.ladder.prizes[s.qIndex - 1] ?? 0) : 0;
}

function endGame(s: GameState, outcome: GameOutcome, winnings: number, type: string): GameState {
  return {
    ...s,
    phase: 'GAME_OVER',
    outcome,
    winnings,
    selected: s.selected,
    log: withLog(s, type, outcome),
  };
}

function timeoutOutcome(s: GameState): GameState {
  const t = s.config.timer;
  const lose = t.mode === 'clock' && t.onTimeout === 'lose';
  const winnings = lose ? guaranteedAt(s.config.ladder, s.qIndex) : prizeWon(s);
  return { ...endGame(s, 'timeout', winnings, 'TIMEOUT'), timeLeftMs: s.timeLeftMs === undefined ? undefined : 0 };
}

function presenting(s: GameState, qIndex: number, source: Question, rng: Rng): GameState {
  return {
    ...s,
    phase: 'PRESENTING',
    qIndex,
    current: presentQuestion(source, s.config.shuffleAnswers, rng),
    eliminated: [],
    selected: undefined,
    activeLifelineId: undefined,
    lastEffect: undefined,
    activeEffects: FRESH_EFFECTS(),
    timeLeftMs: initialTimeMs(s.config, qIndex, s.bankedMs),
  };
}

function applyLifeline(s: GameState, def: LifelineDef, result: EffectResult, rng: Rng): GameState {
  let next: GameState = {
    ...s,
    phase: 'LIFELINE',
    activeLifelineId: def.id,
    lastEffect: result,
    lifelineUses: { ...s.lifelineUses, [def.id]: (s.lifelineUses[def.id] ?? 0) + 1 },
    lifelinesUsed: [...s.lifelinesUsed, def.id],
    log: withLog(s, 'USE_LIFELINE', def.id),
  };
  if (result.replaceQuestion) {
    const rq = result.replaceQuestion;
    next = {
      ...next,
      current: presentQuestion(rq, s.config.shuffleAnswers, rng),
      eliminated: [],
      usedSpareIds: next.usedSpareIds.includes(rq.id) ? next.usedSpareIds : [...next.usedSpareIds, rq.id],
      activeEffects: { ...FRESH_EFFECTS(), secondChanceArmed: s.activeEffects.secondChanceArmed },
    };
  }
  if (result.eliminate && result.eliminate.length) {
    next = { ...next, eliminated: [...new Set([...next.eliminated, ...result.eliminate])].sort() };
  }
  const effects = { ...next.activeEffects };
  if (result.poll) effects.audiencePoll = result.poll;
  if (result.hint) {
    if (def.effect === 'host-hint') effects.hostHint = result.hint;
    else effects.friendHint = result.hint;
  }
  if (result.armSecondChance) effects.secondChanceArmed = true;
  next = { ...next, activeEffects: effects };
  if (result.addTimeMs && next.timeLeftMs !== undefined) {
    next = { ...next, timeLeftMs: next.timeLeftMs + result.addTimeMs };
  }
  return next;
}

// ---------------------------------------------------------------- reducer
function step(s: GameState, ev: GameEvent, rng: Rng): GameState {
  const cfg = s.config;
  switch (ev.type) {
    case 'START':
      if (s.phase !== 'INTRO') return s;
      return {
        ...presenting(s, 0, cfg.questions[0], rng),
        startedAt: s.startedAt,
        log: withLog(s, 'START'),
      };

    case 'ANSWERS_REVEALED':
      if (s.phase !== 'PRESENTING') return s;
      return { ...s, phase: 'AWAITING' };

    case 'USE_LIFELINE': {
      if (s.phase !== 'AWAITING') return s;
      const def = cfg.lifelines.find((l) => l.id === ev.lifelineId);
      if (!def || !lifelineUsable(s, def)) return s;
      const result = applyEffect(def, s, rng);
      if (!result) return s;
      if (def.effect === 'skip-question' && !result.replaceQuestion) return s;
      return applyLifeline(s, def, result, rng);
    }

    case 'LIFELINE_DONE':
      if (s.phase !== 'LIFELINE') return s;
      return { ...s, phase: 'AWAITING', activeLifelineId: undefined };

    case 'SELECT':
      if (s.phase !== 'AWAITING' && s.phase !== 'CONFIRMING') return s;
      if (![0, 1, 2, 3].includes(ev.index) || s.eliminated.includes(ev.index)) return s;
      if (s.phase === 'CONFIRMING' && s.selected === ev.index) return s;
      return { ...s, phase: 'CONFIRMING', selected: ev.index, log: withLog(s, 'SELECT', String(ev.index)) };

    case 'CANCEL':
      if (s.phase === 'CONFIRMING') return { ...s, phase: 'AWAITING', selected: undefined };
      if (s.phase === 'WALK_CONFIRM') {
        return { ...s, phase: s.selected !== undefined ? 'CONFIRMING' : 'AWAITING' };
      }
      return s;

    case 'FINAL_ANSWER':
      if (s.phase !== 'CONFIRMING' || s.selected === undefined) return s;
      return { ...s, phase: 'LOCKED', log: withLog(s, 'FINAL_ANSWER', String(s.selected)) };

    case 'REVEAL': {
      if (s.phase !== 'LOCKED' || s.selected === undefined) return s;
      if (s.selected === s.current.correct) {
        const banked =
          cfg.timer.mode === 'clock' && cfg.timer.bankUnusedToLast && !isLast(s) && s.timeLeftMs !== undefined
            ? s.bankedMs + Math.max(0, s.timeLeftMs)
            : s.bankedMs;
        return { ...s, phase: 'CORRECT', bankedMs: banked, log: withLog(s, 'CORRECT') };
      }
      const firstDip = s.activeEffects.secondChanceArmed && !s.activeEffects.secondChanceUsedOnQuestion;
      if (firstDip) {
        return {
          ...s,
          phase: 'WRONG',
          eliminated: [...new Set([...s.eliminated, s.selected])].sort(),
          activeEffects: { ...s.activeEffects, secondChanceUsedOnQuestion: true },
          log: withLog(s, 'WRONG', 'second-chance'),
        };
      }
      return {
        ...s,
        phase: 'WRONG',
        outcome: 'wrong',
        winnings: guaranteedAt(cfg.ladder, s.qIndex),
        log: withLog(s, 'WRONG', 'final'),
      };
    }

    case 'NEXT': {
      if (s.phase === 'CORRECT') {
        if (isLast(s)) {
          return {
            ...s,
            phase: 'WON',
            outcome: 'won',
            winnings: cfg.ladder.prizes[s.qIndex],
            log: withLog(s, 'WON'),
          };
        }
        if (cfg.ladder.safeHavens.includes(s.qIndex)) {
          return { ...s, phase: 'MILESTONE', log: withLog(s, 'MILESTONE') };
        }
        return presenting(s, s.qIndex + 1, cfg.questions[s.qIndex + 1], rng);
      }
      if (s.phase === 'MILESTONE') {
        return presenting(s, s.qIndex + 1, cfg.questions[s.qIndex + 1], rng);
      }
      if (s.phase === 'WRONG') {
        if (s.outcome === 'wrong') return { ...s, phase: 'GAME_OVER', log: withLog(s, 'GAME_OVER', 'wrong') };
        return { ...s, phase: 'AWAITING', selected: undefined };
      }
      return s;
    }

    case 'WALK_AWAY':
      if (!select.canWalk(s)) return s;
      return { ...s, phase: 'WALK_CONFIRM' };

    case 'CONFIRM':
      if (s.phase !== 'WALK_CONFIRM') return s;
      return endGame(s, 'walked', prizeWon(s), 'WALK');

    case 'TIMEOUT':
      if (s.phase !== 'AWAITING' && s.phase !== 'CONFIRMING' && s.phase !== 'WALK_CONFIRM') return s;
      return timeoutOutcome(s);

    case 'TICK': {
      if (s.timeLeftMs === undefined || cfg.timer.mode !== 'clock') return s;
      if (s.phase !== 'AWAITING' && s.phase !== 'CONFIRMING' && s.phase !== 'WALK_CONFIRM') return s;
      if (!(ev.dtMs > 0)) return s;
      const left = s.timeLeftMs - ev.dtMs;
      if (left <= 0) return timeoutOutcome(s);
      return { ...s, timeLeftMs: left };
    }

    default:
      return s;
  }
}

export function reduce(s: GameState, ev: GameEvent, rng: Rng): GameState {
  const next = step(s, ev, rng);
  if (next === s) return s;
  return { ...next, rngState: rng.getState() };
}

export const select = {
  /** Prize currently won (prizes[qIndex-1] or 0). */
  prize(s: GameState): number {
    return prizeWon(s);
  },
  guaranteed(s: GameState): number {
    return guaranteedAt(s.config.ladder, s.qIndex);
  },
  canWalk(s: GameState): boolean {
    return (s.phase === 'AWAITING' || s.phase === 'CONFIRMING') && !secondChanceLocked(s);
  },
  availableLifelines(s: GameState): LifelineDef[] {
    if (s.phase !== 'AWAITING') return [];
    return s.config.lifelines.filter((l) => lifelineUsable(s, l));
  },
};
