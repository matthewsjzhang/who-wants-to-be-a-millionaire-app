import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/core/rng';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(Array.from({ length: 10 }, () => b.next()));
  });
  it('differs across seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
  it('next is in [0,1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('int is inclusive and bounded', () => {
    const r = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(2, 5));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
    expect(r.int(9, 9)).toBe(9);
  });
  it('shuffle returns a permutation copy and does not mutate', () => {
    const r = createRng(5);
    const src = [1, 2, 3, 4, 5, 6];
    const out = r.shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(src);
    expect(out).not.toBe(src);
  });
  it('getState/restore continues the same sequence', () => {
    const r = createRng(99);
    r.next();
    r.next();
    const st = r.getState();
    const expected = [r.next(), r.next(), r.next()];
    const r2 = createRng(99, st);
    expect([r2.next(), r2.next(), r2.next()]).toEqual(expected);
    expect(r2.getState()).toBe(r.getState());
  });
  it('state 0 is honoured (not treated as absent)', () => {
    expect(createRng(5, 0).next()).toBe(createRng(0).next());
  });
});
