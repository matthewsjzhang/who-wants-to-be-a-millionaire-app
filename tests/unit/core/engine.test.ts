import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnswerIndex,
  EffectResult,
  GameConfig,
  GameEvent,
  GameState,
  LadderConfig,
  LifelineDef,
  Question,
  TimerConfig,
} from '../../../src/core/types';

const applyEffectMock = vi.fn<(def: LifelineDef, s: GameState) => EffectResult>();
vi.mock('../../../src/core/lifelines', () => ({
  BUILT_IN_LIFELINES: [],
  applyEffect: (def: LifelineDef, s: GameState) => applyEffectMock(def, s),
  validateLifeline: () => [],
}));

import { createGame, reduce, select } from '../../../src/core/engine';
import { LADDER_PRESETS } from '../../../src/core/ladder';
import { createRng } from '../../../src/core/rng';
import type { Rng } from '../../../src/core/rng';

const classic = LADDER_PRESETS[0];

function mkQ(id: string, correct: AnswerIndex = 0, difficulty: Question['difficulty'] = 1): Question {
  return { id, text: `Q ${id}`, answers: ['a0', 'a1', 'a2', 'a3'], correct, difficulty };
}

const def = (id: string, effect: LifelineDef['effect'], extra: Partial<LifelineDef> = {}): LifelineDef => ({
  id,
  name: id,
  icon: '?',
  effect,
  params: {},
  uses: 1,
  builtIn: true,
  ...extra,
});

function mkConfig(over: Partial<GameConfig> & { n?: number; ladder?: LadderConfig } = {}): GameConfig {
  const ladder = over.ladder ?? classic;
  const n = ladder.prizes.length;
  return {
    questions: Array.from({ length: n }, (_, i) => mkQ(`q${i}`, (i % 4) as AnswerIndex)),
    spares: [mkQ('s1', 1), mkQ('s2', 2, 3)],
    ladder,
    lifelines: [],
    timer: { mode: 'off' },
    shuffleAnswers: false,
    seed: 1,
    ...over,
  };
}

let rng: Rng;
beforeEach(() => {
  rng = createRng(1);
  applyEffectMock.mockReset();
});

function run(s: GameState, ...evs: GameEvent[]): GameState {
  return evs.reduce((acc, e) => reduce(acc, e, rng), s);
}
const toAwaiting = (cfg: GameConfig) => run(createGame(cfg), { type: 'START' }, { type: 'ANSWERS_REVEALED' });
const ans = (s: GameState, idx: AnswerIndex): GameState =>
  run(s, { type: 'SELECT', index: idx }, { type: 'FINAL_ANSWER' }, { type: 'REVEAL' });
/** Answer current question correctly and advance through NEXT(s) until AWAITING of the next one. */
function winQuestion(s: GameState): GameState {
  let n = ans(s, s.current.correct);
  n = run(n, { type: 'NEXT' });
  if (n.phase === 'MILESTONE') n = run(n, { type: 'NEXT' });
  if (n.phase === 'PRESENTING') n = run(n, { type: 'ANSWERS_REVEALED' });
  return n;
}
function advanceTo(cfg: GameConfig, qIndex: number): GameState {
  let s = toAwaiting(cfg);
  while (s.qIndex < qIndex) s = winQuestion(s);
  return s;
}

describe('flow', () => {
  it('createGame starts in INTRO with first question', () => {
    const s = createGame(mkConfig());
    expect(s.phase).toBe('INTRO');
    expect(s.qIndex).toBe(0);
    expect(s.current.id).toBe('q0');
    expect(s.eliminated).toEqual([]);
  });

  it('START -> PRESENTING -> AWAITING', () => {
    const s = run(createGame(mkConfig()), { type: 'START' });
    expect(s.phase).toBe('PRESENTING');
    expect(run(s, { type: 'ANSWERS_REVEALED' }).phase).toBe('AWAITING');
  });

  it('select / cancel / reselect / final / reveal correct', () => {
    let s = toAwaiting(mkConfig());
    s = run(s, { type: 'SELECT', index: 2 });
    expect(s.phase).toBe('CONFIRMING');
    expect(s.selected).toBe(2);
    s = run(s, { type: 'CANCEL' });
    expect(s.phase).toBe('AWAITING');
    expect(s.selected).toBeUndefined();
    s = run(s, { type: 'SELECT', index: 1 }, { type: 'SELECT', index: 0 });
    expect(s.selected).toBe(0);
    s = run(s, { type: 'FINAL_ANSWER' });
    expect(s.phase).toBe('LOCKED');
    s = run(s, { type: 'REVEAL' });
    expect(s.phase).toBe('CORRECT');
  });

  it('CORRECT -> NEXT advances to PRESENTING of next question', () => {
    const s = run(ans(toAwaiting(mkConfig()), 0), { type: 'NEXT' });
    expect(s.phase).toBe('PRESENTING');
    expect(s.qIndex).toBe(1);
    expect(s.current.id).toBe('q1');
    expect(s.eliminated).toEqual([]);
    expect(s.selected).toBeUndefined();
  });

  it('safe haven answer goes through MILESTONE', () => {
    const s = advanceTo(mkConfig(), 4);
    let n = ans(s, s.current.correct);
    expect(n.phase).toBe('CORRECT');
    n = run(n, { type: 'NEXT' });
    expect(n.phase).toBe('MILESTONE');
    expect(n.qIndex).toBe(4);
    n = run(n, { type: 'NEXT' });
    expect(n.phase).toBe('PRESENTING');
    expect(n.qIndex).toBe(5);
  });

  it('answering all 15 correctly wins the top prize', () => {
    let s = toAwaiting(mkConfig());
    for (let i = 0; i < 14; i++) s = winQuestion(s);
    expect(s.qIndex).toBe(14);
    s = run(ans(s, s.current.correct), { type: 'NEXT' });
    expect(s.phase).toBe('WON');
    expect(s.outcome).toBe('won');
    expect(s.winnings).toBe(1000000);
  });

  it('serialises to JSON and keeps working', () => {
    let s = advanceTo(mkConfig({ shuffleAnswers: true }), 3);
    s = run(s, { type: 'SELECT', index: 1 });
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    expect(copy).toEqual(JSON.parse(JSON.stringify(s)));
    const rng2 = createRng(0, copy.rngState);
    expect(reduce(copy, { type: 'FINAL_ANSWER' }, rng2).phase).toBe('LOCKED');
  });

  it('does not mutate the input state', () => {
    const s = toAwaiting(mkConfig());
    const snap = JSON.stringify(s);
    reduce(s, { type: 'SELECT', index: 1 }, rng);
    expect(JSON.stringify(s)).toBe(snap);
  });
});

describe('winnings on wrong answer (classic)', () => {
  const wrongAt = (q: number) => {
    const s = advanceTo(mkConfig(), q);
    const wrong = ((s.current.correct + 1) % 4) as AnswerIndex;
    const w = ans(s, wrong);
    expect(w.phase).toBe('WRONG');
    const over = run(w, { type: 'NEXT' });
    expect(over.phase).toBe('GAME_OVER');
    expect(over.outcome).toBe('wrong');
    return over.winnings;
  };
  it('Q1 -> 0', () => expect(wrongAt(0)).toBe(0));
  it('Q5 -> 0', () => expect(wrongAt(4)).toBe(0));
  it('Q6 -> 1000', () => expect(wrongAt(5)).toBe(1000));
  it('Q10 -> 1000', () => expect(wrongAt(9)).toBe(1000));
  it('Q11 -> 32000', () => expect(wrongAt(10)).toBe(32000));
  it('Q15 -> 32000', () => expect(wrongAt(14)).toBe(32000));

  it('winnings are already set when entering final WRONG', () => {
    const s = advanceTo(mkConfig(), 5);
    const w = ans(s, ((s.current.correct + 1) % 4) as AnswerIndex);
    expect(w.winnings).toBe(1000);
    expect(w.outcome).toBe('wrong');
  });
});

describe('walk away', () => {
  const walkAt = (q: number) => {
    const s = advanceTo(mkConfig(), q);
    return run(s, { type: 'WALK_AWAY' }, { type: 'CONFIRM' });
  };
  it('Q1 walk = 0', () => expect(walkAt(0).winnings).toBe(0));
  it('Q5 walk = prize of Q4 (500)', () => expect(walkAt(4).winnings).toBe(500));
  it('Q6 walk = 2000... prize of Q5 (1000)', () => expect(walkAt(5).winnings).toBe(1000));
  it('Q11 walk = 64000? prize of Q10 (32000)', () => expect(walkAt(10).winnings).toBe(32000));
  it('Q15 walk = 500000', () => {
    const s = walkAt(14);
    expect(s.winnings).toBe(500000);
    expect(s.outcome).toBe('walked');
    expect(s.phase).toBe('GAME_OVER');
  });
  it('select.prize matches', () => {
    expect(select.prize(advanceTo(mkConfig(), 0))).toBe(0);
    expect(select.prize(advanceTo(mkConfig(), 11))).toBe(64000);
  });
  it('cancel from WALK_CONFIRM returns to AWAITING, or CONFIRMING if answer selected', () => {
    let s = toAwaiting(mkConfig());
    s = run(s, { type: 'WALK_AWAY' });
    expect(s.phase).toBe('WALK_CONFIRM');
    expect(run(s, { type: 'CANCEL' }).phase).toBe('AWAITING');
    s = run(toAwaiting(mkConfig()), { type: 'SELECT', index: 3 }, { type: 'WALK_AWAY' });
    expect(s.phase).toBe('WALK_CONFIRM');
    const back = run(s, { type: 'CANCEL' });
    expect(back.phase).toBe('CONFIRMING');
    expect(back.selected).toBe(3);
  });
  it('walk blocked while LOCKED, REVEALED, presenting', () => {
    const locked = run(toAwaiting(mkConfig()), { type: 'SELECT', index: 0 }, { type: 'FINAL_ANSWER' });
    expect(run(locked, { type: 'WALK_AWAY' })).toBe(locked);
    expect(select.canWalk(locked)).toBe(false);
    const pres = run(createGame(mkConfig()), { type: 'START' });
    expect(run(pres, { type: 'WALK_AWAY' })).toBe(pres);
  });
});

describe('ladder lengths', () => {
  const ladderOf = (n: number, havens: number[]): LadderConfig => ({
    id: `l${n}`,
    name: `L${n}`,
    currency: 'pts',
    prizes: Array.from({ length: n }, (_, i) => (i + 1) * 100),
    safeHavens: havens,
  });
  it('1 question: win and lose', () => {
    const cfg = mkConfig({ ladder: ladderOf(1, []) });
    const s = toAwaiting(cfg);
    const won = run(ans(s, s.current.correct), { type: 'NEXT' });
    expect(won.phase).toBe('WON');
    expect(won.winnings).toBe(100);
    const lost = run(ans(s, 3), { type: 'NEXT' });
    expect(lost.winnings).toBe(0);
  });
  it('12 questions (UK preset)', () => {
    const uk = LADDER_PRESETS.find((l) => l.id === 'uk-12')!;
    const cfg = mkConfig({ ladder: uk });
    let s = toAwaiting(cfg);
    for (let i = 0; i < 11; i++) s = winQuestion(s);
    expect(s.qIndex).toBe(11);
    expect(s.winnings).toBeUndefined();
    const wrong = run(ans(s, ((s.current.correct + 1) % 4) as AnswerIndex), { type: 'NEXT' });
    expect(wrong.winnings).toBe(50000);
    const won = run(ans(s, s.current.correct), { type: 'NEXT' });
    expect(won.winnings).toBe(1000000);
  });
  it('20 questions', () => {
    const cfg = mkConfig({ ladder: ladderOf(20, [4, 9, 14]) });
    let s = toAwaiting(cfg);
    for (let i = 0; i < 19; i++) s = winQuestion(s);
    expect(s.qIndex).toBe(19);
    const wrong = run(ans(s, ((s.current.correct + 1) % 4) as AnswerIndex), { type: 'NEXT' });
    expect(wrong.winnings).toBe(1500);
    const won = run(ans(s, s.current.correct), { type: 'NEXT' });
    expect(won.phase).toBe('WON');
    expect(won.winnings).toBe(2000);
  });
});

describe('illegal events are no-ops (same reference)', () => {
  const all: GameEvent[] = [
    { type: 'START' },
    { type: 'ANSWERS_REVEALED' },
    { type: 'USE_LIFELINE', lifelineId: 'nope' },
    { type: 'LIFELINE_DONE' },
    { type: 'SELECT', index: 0 },
    { type: 'CANCEL' },
    { type: 'FINAL_ANSWER' },
    { type: 'REVEAL' },
    { type: 'NEXT' },
    { type: 'WALK_AWAY' },
    { type: 'CONFIRM' },
    { type: 'TIMEOUT' },
    { type: 'TICK', dtMs: 100 },
  ];
  it('INTRO only accepts START', () => {
    const s = createGame(mkConfig());
    for (const ev of all.filter((e) => e.type !== 'START')) expect(reduce(s, ev, rng), ev.type).toBe(s);
  });
  it('AWAITING rejects out-of-order events', () => {
    const s = toAwaiting(mkConfig());
    for (const t of ['START', 'ANSWERS_REVEALED', 'LIFELINE_DONE', 'CANCEL', 'FINAL_ANSWER', 'REVEAL', 'NEXT', 'CONFIRM']) {
      expect(reduce(s, { type: t } as GameEvent, rng), t).toBe(s);
    }
  });
  it('finished games ignore everything', () => {
    const s = run(toAwaiting(mkConfig()), { type: 'WALK_AWAY' }, { type: 'CONFIRM' });
    expect(s.phase).toBe('GAME_OVER');
    for (const ev of all) expect(reduce(s, ev, rng), ev.type).toBe(s);
    const won = (() => {
      let w = toAwaiting(mkConfig({ ladder: { ...classic, prizes: [1], safeHavens: [] } }));
      w = run(ans(w, w.current.correct), { type: 'NEXT' });
      return w;
    })();
    expect(won.phase).toBe('WON');
    for (const ev of all) expect(reduce(won, ev, rng), ev.type).toBe(won);
  });
  it('invalid select index / eliminated index / reselect same', () => {
    const s = toAwaiting(mkConfig());
    expect(reduce(s, { type: 'SELECT', index: 7 as AnswerIndex }, rng)).toBe(s);
    const c = run(s, { type: 'SELECT', index: 1 });
    expect(reduce(c, { type: 'SELECT', index: 1 }, rng)).toBe(c);
  });
  it('unknown lifeline id is a no-op', () => {
    const s = toAwaiting(mkConfig());
    expect(reduce(s, { type: 'USE_LIFELINE', lifelineId: 'zzz' }, rng)).toBe(s);
  });
  it('no lifelines in CONFIRMING', () => {
    const cfg = mkConfig({ lifelines: [def('ff', 'remove-wrong')] });
    const c = run(toAwaiting(cfg), { type: 'SELECT', index: 0 });
    expect(reduce(c, { type: 'USE_LIFELINE', lifelineId: 'ff' }, rng)).toBe(c);
    expect(applyEffectMock).not.toHaveBeenCalled();
  });
  it('rngState is recorded on transitions', () => {
    const s = toAwaiting(mkConfig());
    expect(s.rngState).toBe(rng.getState());
  });
});

describe('lifelines (mocked applyEffect)', () => {
  it('remove-wrong eliminates, counts uses, goes via LIFELINE phase', () => {
    applyEffectMock.mockReturnValue({ eliminate: [3, 1] });
    const cfg = mkConfig({ lifelines: [def('ff', 'remove-wrong')] });
    let s = toAwaiting(cfg);
    expect(select.availableLifelines(s).map((l) => l.id)).toEqual(['ff']);
    s = run(s, { type: 'USE_LIFELINE', lifelineId: 'ff' });
    expect(s.phase).toBe('LIFELINE');
    expect(s.activeLifelineId).toBe('ff');
    expect(s.eliminated).toEqual([1, 3]);
    expect(s.lifelineUses).toEqual({ ff: 1 });
    expect(s.lifelinesUsed).toEqual(['ff']);
    expect(s.lastEffect).toEqual({ eliminate: [3, 1] });
    s = run(s, { type: 'LIFELINE_DONE' });
    expect(s.phase).toBe('AWAITING');
    expect(select.availableLifelines(s)).toEqual([]);
    // cannot reuse
    expect(reduce(s, { type: 'USE_LIFELINE', lifelineId: 'ff' }, rng)).toBe(s);
    // eliminated answers cannot be selected
    expect(reduce(s, { type: 'SELECT', index: 1 }, rng)).toBe(s);
  });

  it('multi-use lifeline allows uses up to limit; eliminations reset on next question', () => {
    applyEffectMock.mockReturnValue({ eliminate: [2] });
    const cfg = mkConfig({ lifelines: [def('ff', 'remove-wrong', { uses: 2 })] });
    let s = toAwaiting(cfg);
    s = run(s, { type: 'USE_LIFELINE', lifelineId: 'ff' }, { type: 'LIFELINE_DONE' });
    expect(select.availableLifelines(s)).toHaveLength(1);
    s = winQuestion(s);
    expect(s.eliminated).toEqual([]);
    expect(s.activeEffects.audiencePoll).toBeUndefined();
  });

  it('poll / friend / host hints land in activeEffects', () => {
    const cfg = mkConfig({
      lifelines: [def('aud', 'audience-poll'), def('ph', 'friend-hint'), def('hh', 'host-hint')],
    });
    let s = toAwaiting(cfg);
    applyEffectMock.mockReturnValueOnce({ poll: [70, 10, 10, 10] });
    s = run(s, { type: 'USE_LIFELINE', lifelineId: 'aud' }, { type: 'LIFELINE_DONE' });
    expect(s.activeEffects.audiencePoll).toEqual([70, 10, 10, 10]);
    applyEffectMock.mockReturnValueOnce({ hint: { answer: 0, confidence: 0.8, text: 'friend' } });
    s = run(s, { type: 'USE_LIFELINE', lifelineId: 'ph' }, { type: 'LIFELINE_DONE' });
    expect(s.activeEffects.friendHint?.text).toBe('friend');
    expect(s.activeEffects.hostHint).toBeUndefined();
    applyEffectMock.mockReturnValueOnce({ hint: { answer: 1, confidence: 0.5, text: 'host' } });
    s = run(s, { type: 'USE_LIFELINE', lifelineId: 'hh' }, { type: 'LIFELINE_DONE' });
    expect(s.activeEffects.hostHint?.text).toBe('host');
    expect(s.activeEffects.friendHint?.text).toBe('friend');
  });

  it('availableFromQ gates a lifeline', () => {
    applyEffectMock.mockReturnValue({ eliminate: [1] });
    const cfg = mkConfig({ lifelines: [def('late', 'remove-wrong', { availableFromQ: 3 })] });
    let s = toAwaiting(cfg);
    expect(select.availableLifelines(s)).toEqual([]);
    expect(reduce(s, { type: 'USE_LIFELINE', lifelineId: 'late' }, rng)).toBe(s);
    s = advanceTo(cfg, 3);
    expect(select.availableLifelines(s)).toHaveLength(1);
  });

  it('availableLifelines is empty outside AWAITING', () => {
    const cfg = mkConfig({ lifelines: [def('ff', 'remove-wrong')] });
    expect(select.availableLifelines(createGame(cfg))).toEqual([]);
    expect(select.availableLifelines(run(toAwaiting(cfg), { type: 'SELECT', index: 0 }))).toEqual([]);
  });

  describe('Switch (skip-question)', () => {
    const cfg = () => mkConfig({ lifelines: [def('sw', 'skip-question'), def('sw2', 'skip-question')] });
    it('replaces the question with the spare and marks it used', () => {
      applyEffectMock.mockReturnValueOnce({ replaceQuestion: mkQ('s1', 1) });
      let s = toAwaiting(cfg());
      s = run(s, { type: 'SELECT', index: 0 }, { type: 'CANCEL' });
      s = run(s, { type: 'USE_LIFELINE', lifelineId: 'sw' });
      expect(s.current.id).toBe('s1');
      expect(s.usedSpareIds).toEqual(['s1']);
      expect(s.eliminated).toEqual([]);
      expect(s.qIndex).toBe(0);
      s = run(s, { type: 'LIFELINE_DONE' });
      const r = ans(s, 1);
      expect(r.phase).toBe('CORRECT');
      // next question is the original q1
      expect(run(r, { type: 'NEXT' }).current.id).toBe('q1');
    });
    it('drops stale polls/eliminations of the old question', () => {
      applyEffectMock.mockReturnValueOnce({ poll: [10, 10, 10, 70], eliminate: [2] });
      applyEffectMock.mockReturnValueOnce({ replaceQuestion: mkQ('s1', 1) });
      let s = toAwaiting(mkConfig({ lifelines: [def('aud', 'audience-poll'), def('sw', 'skip-question')] }));
      s = run(s, { type: 'USE_LIFELINE', lifelineId: 'aud' }, { type: 'LIFELINE_DONE' });
      s = run(s, { type: 'USE_LIFELINE', lifelineId: 'sw' });
      expect(s.activeEffects.audiencePoll).toBeUndefined();
      expect(s.eliminated).toEqual([]);
    });
    it('exhausted spares: unavailable and rejected', () => {
      applyEffectMock.mockReturnValue({ replaceQuestion: mkQ('s1', 1) });
      let s = toAwaiting(cfg());
      s = run(s, { type: 'USE_LIFELINE', lifelineId: 'sw' }, { type: 'LIFELINE_DONE' });
      applyEffectMock.mockReturnValue({ replaceQuestion: mkQ('s2', 2, 3) });
      s = run(s, { type: 'USE_LIFELINE', lifelineId: 'sw2' }, { type: 'LIFELINE_DONE' });
      expect(s.usedSpareIds).toEqual(['s1', 's2']);
      const none = mkConfig({ spares: [], lifelines: [def('sw', 'skip-question')] });
      const t = toAwaiting(none);
      expect(select.availableLifelines(t)).toEqual([]);
      expect(reduce(t, { type: 'USE_LIFELINE', lifelineId: 'sw' }, rng)).toBe(t);
    });
    it('is a no-op when the effect yields no replacement (not consumed)', () => {
      applyEffectMock.mockReturnValue({});
      const s = toAwaiting(cfg());
      expect(reduce(s, { type: 'USE_LIFELINE', lifelineId: 'sw' }, rng)).toBe(s);
    });
  });

  describe('Double Dip (second-chance)', () => {
    const cfg = () =>
      mkConfig({ lifelines: [def('dd', 'second-chance'), def('ff', 'remove-wrong')] });
    const armed = () => {
      applyEffectMock.mockReturnValue({ armSecondChance: true });
      return run(toAwaiting(cfg()), { type: 'USE_LIFELINE', lifelineId: 'dd' }, { type: 'LIFELINE_DONE' });
    };
    it('arms, locks out other lifelines and walking on that question', () => {
      const s = armed();
      expect(s.activeEffects.secondChanceArmed).toBe(true);
      expect(select.availableLifelines(s)).toEqual([]);
      expect(select.canWalk(s)).toBe(false);
      expect(reduce(s, { type: 'USE_LIFELINE', lifelineId: 'ff' }, rng)).toBe(s);
      expect(reduce(s, { type: 'WALK_AWAY' }, rng)).toBe(s);
      const c = run(s, { type: 'SELECT', index: 1 });
      expect(reduce(c, { type: 'WALK_AWAY' }, rng)).toBe(c);
    });
    it('first wrong eliminates the pick and returns to AWAITING; still locked', () => {
      let s = armed();
      s = ans(s, 3); // q0 correct is 0
      expect(s.phase).toBe('WRONG');
      expect(s.outcome).toBeUndefined();
      s = run(s, { type: 'NEXT' });
      expect(s.phase).toBe('AWAITING');
      expect(s.eliminated).toEqual([3]);
      expect(s.selected).toBeUndefined();
      expect(select.canWalk(s)).toBe(false);
      expect(select.availableLifelines(s)).toEqual([]);
      expect(reduce(s, { type: 'SELECT', index: 3 }, rng)).toBe(s);
    });
    it('second wrong ends the game; second pick right continues', () => {
      let s = run(ans(armed(), 3), { type: 'NEXT' });
      const lost = run(ans(s, 2), { type: 'NEXT' });
      expect(lost.phase).toBe('GAME_OVER');
      expect(lost.outcome).toBe('wrong');
      expect(lost.winnings).toBe(0);
      s = ans(s, 0);
      expect(s.phase).toBe('CORRECT');
    });
    it('first answer correct: armed state cleared on next question', () => {
      const s = run(ans(armed(), 0), { type: 'NEXT' });
      expect(s.activeEffects.secondChanceArmed).toBe(false);
      const a = run(s, { type: 'ANSWERS_REVEALED' });
      expect(select.canWalk(a)).toBe(true);
      expect(a.lifelineUses.dd).toBe(1);
    });
    it('double dip on a high question keeps the safe-haven loss rule', () => {
      applyEffectMock.mockReturnValue({ armSecondChance: true });
      let s = advanceTo(cfg(), 7);
      s = run(s, { type: 'USE_LIFELINE', lifelineId: 'dd' }, { type: 'LIFELINE_DONE' });
      const wrong1 = (s.current.correct + 1) % 4;
      const wrong2 = (s.current.correct + 2) % 4;
      s = run(ans(s, wrong1 as AnswerIndex), { type: 'NEXT' });
      s = run(ans(s, wrong2 as AnswerIndex), { type: 'NEXT' });
      expect(s.winnings).toBe(1000);
    });
  });
});

describe('answer shuffling', () => {
  it('remaps correct so the same text stays correct', () => {
    const cfg = mkConfig({ shuffleAnswers: true });
    let s = toAwaiting(cfg);
    for (let i = 0; i < 14; i++) {
      const orig = cfg.questions[s.qIndex];
      expect(s.current.answers[s.current.correct]).toBe(orig.answers[orig.correct]);
      expect([...s.current.answers].sort()).toEqual([...orig.answers].sort());
      s = winQuestion(s);
    }
  });
  it('actually permutes at least sometimes and is deterministic by seed', () => {
    const cfg = mkConfig({ shuffleAnswers: true });
    const a = toAwaiting(cfg);
    rng = createRng(1);
    const b = toAwaiting(cfg);
    expect(a.current.answers).toEqual(b.current.answers);
    const moved = Array.from({ length: 20 }, (_, i) => {
      rng = createRng(i);
      return run(createGame(cfg), { type: 'START' }).current.answers[0] !== 'a0';
    });
    expect(moved.some(Boolean)).toBe(true);
  });
  it('no shuffle leaves the question untouched', () => {
    const s = toAwaiting(mkConfig());
    expect(s.current).toEqual(mkConfig().questions[0]);
  });
  it('shuffles a switched-in question with remap', () => {
    applyEffectMock.mockReturnValue({ replaceQuestion: mkQ('s1', 1) });
    let s = toAwaiting(mkConfig({ shuffleAnswers: true, lifelines: [def('sw', 'skip-question')] }));
    s = run(s, { type: 'USE_LIFELINE', lifelineId: 'sw' });
    expect(s.current.answers[s.current.correct]).toBe('a1');
  });
  it('resume with saved rngState reproduces the same next shuffle', () => {
    const cfg = mkConfig({ shuffleAnswers: true });
    const s = toAwaiting(cfg);
    const correct = run(ans(s, s.current.correct), { type: 'NEXT' }); // consumes shuffle
    const resumed = reduce(JSON.parse(JSON.stringify(ans(s, s.current.correct))), { type: 'NEXT' }, createRng(1, s.rngState));
    expect(resumed.current.answers).toEqual(correct.current.answers);
  });
});

describe('clock mode', () => {
  const clock = (over: Partial<Extract<TimerConfig, { mode: 'clock' }>> = {}): TimerConfig => ({
    mode: 'clock',
    secondsPerQuestion: Array.from({ length: 15 }, (_, i) => (i < 5 ? 15 : 30)),
    bankUnusedToLast: false,
    onTimeout: 'walk',
    ...over,
  });

  it('sets timeLeftMs per question on presenting', () => {
    const cfg = mkConfig({ timer: clock() });
    let s = toAwaiting(cfg);
    expect(s.timeLeftMs).toBe(15000);
    s = advanceTo(cfg, 5);
    expect(s.timeLeftMs).toBe(30000);
  });
  it('off mode: no timeLeftMs, TICK no-op', () => {
    const s = toAwaiting(mkConfig());
    expect(s.timeLeftMs).toBeUndefined();
    expect(reduce(s, { type: 'TICK', dtMs: 1000 }, rng)).toBe(s);
  });
  it('TICK counts down in AWAITING/CONFIRMING, not LOCKED or LIFELINE', () => {
    let s = toAwaiting(mkConfig({ timer: clock() }));
    s = run(s, { type: 'TICK', dtMs: 1000 });
    expect(s.timeLeftMs).toBe(14000);
    s = run(s, { type: 'SELECT', index: 0 }, { type: 'TICK', dtMs: 500 });
    expect(s.timeLeftMs).toBe(13500);
    s = run(s, { type: 'FINAL_ANSWER' });
    expect(reduce(s, { type: 'TICK', dtMs: 500 }, rng)).toBe(s);
  });
  it('ignores non-positive dt', () => {
    const s = toAwaiting(mkConfig({ timer: clock() }));
    expect(reduce(s, { type: 'TICK', dtMs: 0 }, rng)).toBe(s);
    expect(reduce(s, { type: 'TICK', dtMs: -5 }, rng)).toBe(s);
  });
  it('timeout with walk keeps prize of previous question', () => {
    const s = advanceTo(mkConfig({ timer: clock() }), 7);
    const t = run(s, { type: 'TICK', dtMs: 31000 });
    expect(t.phase).toBe('GAME_OVER');
    expect(t.outcome).toBe('timeout');
    expect(t.winnings).toBe(4000);
    expect(t.timeLeftMs).toBe(0);
  });
  it('timeout with lose drops to the safe haven', () => {
    const s = advanceTo(mkConfig({ timer: clock({ onTimeout: 'lose' }) }), 7);
    expect(run(s, { type: 'TIMEOUT' }).winnings).toBe(1000);
  });
  it('TIMEOUT event valid from AWAITING / CONFIRMING / WALK_CONFIRM only', () => {
    const cfg = mkConfig({ timer: clock() });
    const s = toAwaiting(cfg);
    expect(run(s, { type: 'TIMEOUT' }).outcome).toBe('timeout');
    expect(run(s, { type: 'SELECT', index: 1 }, { type: 'TIMEOUT' }).outcome).toBe('timeout');
    expect(run(s, { type: 'WALK_AWAY' }, { type: 'TIMEOUT' }).outcome).toBe('timeout');
    const locked = run(s, { type: 'SELECT', index: 1 }, { type: 'FINAL_ANSWER' });
    expect(reduce(locked, { type: 'TIMEOUT' }, rng)).toBe(locked);
  });
  it('extra-time adds to the clock; unavailable when timer is off', () => {
    applyEffectMock.mockReturnValue({ addTimeMs: 10000 });
    const lf = [def('xt', 'extra-time', { params: { seconds: 10 } })];
    let s = toAwaiting(mkConfig({ timer: clock(), lifelines: lf }));
    s = run(s, { type: 'USE_LIFELINE', lifelineId: 'xt' });
    expect(s.timeLeftMs).toBe(25000);
    const off = toAwaiting(mkConfig({ lifelines: lf }));
    expect(select.availableLifelines(off)).toEqual([]);
  });
  it('bankUnusedToLast carries unused time to the final question', () => {
    const cfg = mkConfig({ timer: clock({ bankUnusedToLast: true }) });
    let s = toAwaiting(cfg);
    for (let i = 0; i < 14; i++) {
      s = run(s, { type: 'TICK', dtMs: 5000 });
      s = winQuestion(s);
    }
    expect(s.qIndex).toBe(14);
    // Q1-5: 10s unused each (50s); Q6-14: 25s unused each (225s); Q15: 30s
    expect(s.bankedMs).toBe(5 * 10000 + 9 * 25000);
    expect(s.timeLeftMs).toBe(30000 + s.bankedMs);
  });
  it('banked time is not added when disabled', () => {
    const s = advanceTo(mkConfig({ timer: clock() }), 14);
    expect(s.bankedMs).toBe(0);
    expect(s.timeLeftMs).toBe(30000);
  });
});

describe('selectors', () => {
  it('guaranteed follows safe havens', () => {
    const cfg = mkConfig();
    expect(select.guaranteed(advanceTo(cfg, 5))).toBe(1000);
    expect(select.guaranteed(advanceTo(cfg, 3))).toBe(0);
    expect(select.guaranteed(advanceTo(cfg, 12))).toBe(32000);
  });
  it('canWalk phases', () => {
    const cfg = mkConfig();
    expect(select.canWalk(createGame(cfg))).toBe(false);
    expect(select.canWalk(toAwaiting(cfg))).toBe(true);
    expect(select.canWalk(run(toAwaiting(cfg), { type: 'SELECT', index: 0 }))).toBe(true);
  });
});
