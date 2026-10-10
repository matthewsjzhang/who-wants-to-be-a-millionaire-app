import { describe, expect, it } from 'vitest';
import { audiencePoll, friendHint, hostHint } from '../../../src/core/simulate';
import type { Rng } from '../../../src/core/rng';
import type { AnswerIndex, Question } from '../../../src/core/types';

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

function q(correct: AnswerIndex = 1, difficulty: 1 | 2 | 3 | 4 | 5 = 1): Question {
  return {
    id: 'q',
    text: 'Q?',
    answers: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    correct,
    difficulty,
  };
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

function correctRate(difficulty: 1 | 2 | 3 | 4 | 5, trials = 4000): number {
  const rng = localRng(100 + difficulty);
  const question = q(2, difficulty);
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const poll = audiencePoll(question, [], difficulty, rng);
    if (poll[2] === Math.max(...poll)) wins++;
  }
  return wins / trials;
}

describe('audiencePoll', () => {
  it('always sums to 100 with integer entries', () => {
    const rng = localRng(1);
    for (let i = 0; i < 500; i++) {
      const d = ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5;
      const poll = audiencePoll(q((i % 4) as AnswerIndex, d), [], d, rng);
      expect(sum(poll)).toBe(100);
      expect(poll).toHaveLength(4);
      poll.forEach((p) => {
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('gives 0 to eliminated answers and still sums to 100', () => {
    const rng = localRng(2);
    for (let i = 0; i < 200; i++) {
      const poll = audiencePoll(q(1), [0, 3], 3, rng);
      expect(poll[0]).toBe(0);
      expect(poll[3]).toBe(0);
      expect(sum(poll)).toBe(100);
    }
  });

  it('puts 100 on the only remaining answer', () => {
    expect(audiencePoll(q(1), [0, 2, 3], 5, localRng(3))).toEqual([0, 100, 0, 0]);
  });

  it('is more accurate at difficulty 1 than difficulty 5, near the target levels', () => {
    const easy = correctRate(1);
    const hard = correctRate(5);
    expect(easy).toBeGreaterThan(0.85);
    expect(easy).toBeGreaterThan(hard + 0.05);
    expect(hard).toBeGreaterThan(0.3);
    expect(hard).toBeLessThan(0.95);
  });

  it('mean share on the correct answer tracks ~85% at diff 1 and ~40% at diff 5', () => {
    const mean = (d: 1 | 5) => {
      const rng = localRng(7);
      let total = 0;
      const n = 3000;
      for (let i = 0; i < n; i++) total += audiencePoll(q(0, d), [], d, rng)[0];
      return total / n;
    };
    expect(mean(1)).toBeGreaterThan(78);
    expect(mean(1)).toBeLessThan(92);
    expect(mean(5)).toBeGreaterThan(33);
    expect(mean(5)).toBeLessThan(47);
  });

  it('is deterministic for a given seed and noisy across seeds', () => {
    const a = audiencePoll(q(), [], 3, localRng(42));
    const b = audiencePoll(q(), [], 3, localRng(42));
    const c = audiencePoll(q(), [], 3, localRng(43));
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
  });

  it('honours an accuracy override', () => {
    const rng = localRng(9);
    let total = 0;
    for (let i = 0; i < 500; i++) total += audiencePoll(q(0), [], 5, rng, 0.95)[0];
    expect(total / 500).toBeGreaterThan(85);
  });

  it('copes with every answer eliminated', () => {
    expect(sum(audiencePoll(q(), [0, 1, 2, 3], 1, localRng(1)))).toBe(100);
  });
});

describe('friendHint', () => {
  it('never suggests an eliminated answer and is deterministic', () => {
    for (let s = 0; s < 200; s++) {
      const h = friendHint(q(1, 3), [0, 3], 3, localRng(s));
      if (h.answer !== null) expect([1, 2]).toContain(h.answer);
      expect(h).toEqual(friendHint(q(1, 3), [0, 3], 3, localRng(s)));
      expect(h.confidence).toBeGreaterThanOrEqual(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('is right more often on easy questions than hard ones', () => {
    const rate = (d: 1 | 5) => {
      const rng = localRng(11);
      let ok = 0;
      for (let i = 0; i < 2000; i++) if (friendHint(q(2, d), [], d, rng).answer === 2) ok++;
      return ok / 2000;
    };
    expect(rate(1)).toBeGreaterThan(0.8);
    expect(rate(1)).toBeGreaterThan(rate(5) + 0.2);
  });

  it('text names the letter and answer text when a suggestion is made', () => {
    let seen = 0;
    for (let s = 0; s < 100; s++) {
      const h = friendHint(q(1, 1), [], 1, localRng(s));
      if (h.answer !== null) {
        seen++;
        expect(h.text).toContain(['A', 'B', 'C', 'D'][h.answer]);
        expect(h.text).not.toContain('{');
      }
    }
    expect(seen).toBeGreaterThan(90);
  });

  it('can be unsure on hard questions (answer null) with a no-idea message', () => {
    let nulls = 0;
    for (let s = 0; s < 500; s++) {
      const h = friendHint(q(1, 5), [], 5, localRng(s));
      if (h.answer === null) {
        nulls++;
        expect(h.text.length).toBeGreaterThan(5);
        expect(h.confidence).toBeLessThan(0.3);
      }
    }
    expect(nulls).toBeGreaterThan(0);
  });

  it('accuracy 1 is always right, accuracy 0 always wrong', () => {
    for (let s = 0; s < 100; s++) {
      expect(friendHint(q(2, 5), [], 5, localRng(s), 1).answer).toBe(2);
      expect(friendHint(q(2, 1), [], 1, localRng(s), 0).answer).not.toBe(2);
    }
  });

  it('hostHint gives a host-voiced hint', () => {
    const h = hostHint(q(0, 1), [], 1, localRng(5), 1);
    expect(h.answer).toBe(0);
    expect(h.text).toContain('A');
  });
});
