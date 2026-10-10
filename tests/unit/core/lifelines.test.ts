import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_LIFELINES,
  DEFAULT_LIFELINE_IDS,
  applyEffect,
  validateLifeline,
} from '../../../src/core/lifelines';
import type { Rng } from '../../../src/core/rng';
import type { AnswerIndex, GameState, LifelineDef, Question } from '../../../src/core/types';

function localRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    shuffle: (arr) => arr,
    getState: () => a,
  };
}

const mk = (id: string, correct: AnswerIndex, difficulty: Question['difficulty']): Question => ({
  id,
  text: id,
  answers: ['a', 'b', 'c', 'd'],
  correct,
  difficulty,
});

function state(over: Partial<GameState> = {}, spares: Question[] = []): GameState {
  const current = mk('cur', 2, 3);
  return {
    phase: 'LIFELINE',
    config: { spares, questions: [current] } as unknown as GameState['config'],
    qIndex: 0,
    current,
    eliminated: [],
    lifelineUses: {},
    activeEffects: { secondChanceArmed: false, secondChanceUsedOnQuestion: false },
    bankedMs: 0,
    usedSpareIds: [],
    startedAt: 0,
    lifelinesUsed: [],
    log: [],
    ...over,
  };
}

const byId = (id: string) => BUILT_IN_LIFELINES.find((l) => l.id === id)!;
const custom = (over: Partial<LifelineDef>): LifelineDef => ({
  id: 'c1',
  name: 'Custom',
  icon: 'X',
  effect: 'remove-wrong',
  params: { n: 1 },
  uses: 1,
  builtIn: false,
  ...over,
});

describe('BUILT_IN_LIFELINES', () => {
  it('defines the five built-ins, all valid and built-in', () => {
    expect(BUILT_IN_LIFELINES.map((l) => l.effect)).toEqual([
      'remove-wrong',
      'friend-hint',
      'audience-poll',
      'skip-question',
      'second-chance',
    ]);
    for (const l of BUILT_IN_LIFELINES) {
      expect(l.builtIn).toBe(true);
      expect(validateLifeline(l)).toEqual([]);
    }
    expect(new Set(BUILT_IN_LIFELINES.map((l) => l.id)).size).toBe(5);
  });

  it('enables 50:50, phone and audience by default; switch and double dip are opt-in', () => {
    expect(DEFAULT_LIFELINE_IDS).toHaveLength(3);
    expect(DEFAULT_LIFELINE_IDS).toEqual(
      BUILT_IN_LIFELINES.filter((l) => ['remove-wrong', 'friend-hint', 'audience-poll'].includes(l.effect)).map((l) => l.id),
    );
    expect(byId('switch-the-question').availableFromQ).toBe(10);
  });
});

describe('applyEffect', () => {
  it('remove-wrong removes 2 wrong answers and never the correct one', () => {
    for (let s = 0; s < 200; s++) {
      const r = applyEffect(byId('fifty-fifty'), state(), localRng(s));
      expect(r.eliminate).toHaveLength(2);
      expect(r.eliminate).not.toContain(2);
      expect(new Set(r.eliminate).size).toBe(2);
    }
  });

  it('remove-wrong honours n=1 and skips already eliminated answers', () => {
    const r = applyEffect(custom({ params: { n: 1 } }), state({ eliminated: [0] }), localRng(1));
    expect(r.eliminate).toHaveLength(1);
    expect([1, 3]).toContain(r.eliminate![0]);
  });

  it('remove-wrong caps at the wrong answers remaining', () => {
    const r = applyEffect(byId('fifty-fifty'), state({ eliminated: [0, 1] }), localRng(1));
    expect(r.eliminate).toEqual([3]);
  });

  it('audience-poll returns a poll summing to 100 with zeros for eliminated', () => {
    const r = applyEffect(byId('ask-the-audience'), state({ eliminated: [0, 1] }), localRng(4));
    expect(r.poll![0]).toBe(0);
    expect(r.poll![1]).toBe(0);
    expect(r.poll!.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('friend-hint and host-hint return hints', () => {
    const f = applyEffect(byId('phone-a-friend'), state(), localRng(4));
    expect(f.hint?.text).toBeTruthy();
    const h = applyEffect(custom({ effect: 'host-hint', params: { accuracy: 1 } }), state(), localRng(4));
    expect(h.hint?.answer).toBe(2);
  });

  it('is deterministic for the same seed', () => {
    const a = applyEffect(byId('ask-the-audience'), state(), localRng(8));
    const b = applyEffect(byId('ask-the-audience'), state(), localRng(8));
    expect(a).toEqual(b);
  });

  it('skip-question picks the unused spare of nearest difficulty', () => {
    const spares = [mk('s1', 0, 1), mk('s2', 0, 4), mk('s3', 0, 4)];
    const r = applyEffect(byId('switch-the-question'), state({}, spares), localRng(1));
    expect(r.replaceQuestion?.id).toBe('s2');
    const r2 = applyEffect(byId('switch-the-question'), state({ usedSpareIds: ['s2'] }, spares), localRng(1));
    expect(r2.replaceQuestion?.id).toBe('s3');
  });

  it('skip-question returns nothing when spares are exhausted', () => {
    const spares = [mk('s1', 0, 1)];
    const r = applyEffect(byId('switch-the-question'), state({ usedSpareIds: ['s1'] }, spares), localRng(1));
    expect(r.replaceQuestion).toBeUndefined();
    expect(applyEffect(byId('switch-the-question'), state(), localRng(1))).toEqual({});
  });

  it('second-chance arms', () => {
    expect(applyEffect(byId('double-dip'), state(), localRng(1))).toEqual({ armSecondChance: true });
  });

  it('extra-time converts seconds to ms, defaulting to 30s', () => {
    expect(applyEffect(custom({ effect: 'extra-time', params: { seconds: 20 } }), state(), localRng(1)).addTimeMs).toBe(20000);
    expect(applyEffect(custom({ effect: 'extra-time', params: {} }), state(), localRng(1)).addTimeMs).toBe(30000);
  });
});

describe('validateLifeline', () => {
  it('accepts valid custom lifelines of each effect', () => {
    expect(validateLifeline(custom({}))).toEqual([]);
    expect(validateLifeline(custom({ effect: 'friend-hint', params: { accuracy: 0.5 } }))).toEqual([]);
    expect(validateLifeline(custom({ effect: 'audience-poll', params: {} }))).toEqual([]);
    expect(validateLifeline(custom({ effect: 'extra-time', params: { seconds: 5 } }))).toEqual([]);
    expect(validateLifeline(custom({ effect: 'extra-time', params: { seconds: 120 } }))).toEqual([]);
    expect(validateLifeline(custom({ effect: 'skip-question', params: {} }))).toEqual([]);
  });

  it('rejects missing basics and bad effect/uses/availableFromQ', () => {
    expect(validateLifeline(custom({ id: '' })).join()).toMatch(/id/);
    expect(validateLifeline(custom({ name: '  ' })).join()).toMatch(/name/);
    expect(validateLifeline(custom({ icon: '' })).join()).toMatch(/icon/);
    expect(validateLifeline(custom({ effect: 'nope' as never })).join()).toMatch(/effect/);
    expect(validateLifeline(custom({ uses: 0 })).join()).toMatch(/uses/);
    expect(validateLifeline(custom({ uses: 1.5 })).join()).toMatch(/uses/);
    expect(validateLifeline(custom({ availableFromQ: -1 })).join()).toMatch(/availableFromQ/);
  });

  it('validates per-effect params', () => {
    expect(validateLifeline(custom({ params: {} })).join()).toMatch(/params\.n/);
    expect(validateLifeline(custom({ params: { n: 3 } })).join()).toMatch(/params\.n/);
    expect(validateLifeline(custom({ params: { n: 0 } })).join()).toMatch(/params\.n/);
    expect(validateLifeline(custom({ effect: 'audience-poll', params: { accuracy: 1.2 } })).join()).toMatch(/accuracy/);
    expect(validateLifeline(custom({ effect: 'host-hint', params: { accuracy: -0.1 } })).join()).toMatch(/accuracy/);
    expect(validateLifeline(custom({ effect: 'extra-time', params: {} })).join()).toMatch(/seconds/);
    expect(validateLifeline(custom({ effect: 'extra-time', params: { seconds: 4 } })).join()).toMatch(/seconds/);
    expect(validateLifeline(custom({ effect: 'extra-time', params: { seconds: 121 } })).join()).toMatch(/seconds/);
  });

  it('reports non-object params', () => {
    expect(validateLifeline(custom({ params: null as never })).join()).toMatch(/params/);
  });
});
