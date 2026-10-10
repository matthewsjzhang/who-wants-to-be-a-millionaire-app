import { describe, expect, it } from 'vitest';
import { LADDER_PRESETS, formatMoney, guaranteedAt, validateLadder } from '../../../src/core/ladder';
import type { LadderConfig } from '../../../src/core/types';

const classic = LADDER_PRESETS.find((l) => l.id === 'classic')!;

describe('ladder presets', () => {
  it('all presets validate', () => {
    for (const p of LADDER_PRESETS) expect(validateLadder(p), p.id).toEqual([]);
  });
  it('classic is the first/default preset with 15 prizes', () => {
    expect(LADDER_PRESETS[0].id).toBe('classic');
    expect(classic.prizes).toHaveLength(15);
    expect(classic.prizes[14]).toBe(1000000);
    expect(classic.safeHavens).toEqual([4, 9]);
  });
  it('includes UK 12, no-safety-net, single haven, custom', () => {
    const ids = LADDER_PRESETS.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(['uk-12', 'no-safety-net', 'single-haven', 'custom']));
    expect(LADDER_PRESETS.find((l) => l.id === 'uk-12')!.prizes).toHaveLength(12);
    expect(LADDER_PRESETS.find((l) => l.id === 'no-safety-net')!.safeHavens).toEqual([]);
  });
});

describe('validateLadder', () => {
  const base: LadderConfig = { id: 'x', name: 'X', currency: '$', prizes: [1, 2, 3], safeHavens: [1] };
  it('accepts lengths 1 and 20', () => {
    expect(validateLadder({ ...base, prizes: [5], safeHavens: [] })).toEqual([]);
    expect(
      validateLadder({ ...base, prizes: Array.from({ length: 20 }, (_, i) => (i + 1) * 10), safeHavens: [4, 9] }),
    ).toEqual([]);
  });
  it('rejects 0 and 21 prizes', () => {
    expect(validateLadder({ ...base, prizes: [], safeHavens: [] }).length).toBeGreaterThan(0);
    expect(
      validateLadder({ ...base, prizes: Array.from({ length: 21 }, (_, i) => i + 1), safeHavens: [] }).length,
    ).toBeGreaterThan(0);
  });
  it('rejects non-increasing, equal, non-positive and NaN prizes', () => {
    expect(validateLadder({ ...base, prizes: [3, 2, 5] }).length).toBeGreaterThan(0);
    expect(validateLadder({ ...base, prizes: [1, 1, 5] }).length).toBeGreaterThan(0);
    expect(validateLadder({ ...base, prizes: [0, 1, 5] }).length).toBeGreaterThan(0);
    expect(validateLadder({ ...base, prizes: [1, NaN, 5] }).length).toBeGreaterThan(0);
  });
  it('rejects bad safe havens', () => {
    expect(validateLadder({ ...base, safeHavens: [3] }).length).toBeGreaterThan(0);
    expect(validateLadder({ ...base, safeHavens: [-1] }).length).toBeGreaterThan(0);
    expect(validateLadder({ ...base, safeHavens: [1, 1] }).length).toBeGreaterThan(0);
    expect(validateLadder({ ...base, safeHavens: [0.5] }).length).toBeGreaterThan(0);
  });
  it('rejects missing name / bad currency', () => {
    expect(validateLadder({ ...base, name: ' ' }).length).toBeGreaterThan(0);
    expect(validateLadder({ ...base, currency: '¥' as never }).length).toBeGreaterThan(0);
  });
});

describe('guaranteedAt', () => {
  it('classic: 0 up to Q5, then 1000 until Q10, then 32000', () => {
    expect(guaranteedAt(classic, 0)).toBe(0);
    expect(guaranteedAt(classic, 4)).toBe(0); // Q5
    expect(guaranteedAt(classic, 5)).toBe(1000); // Q6
    expect(guaranteedAt(classic, 9)).toBe(1000); // Q10
    expect(guaranteedAt(classic, 10)).toBe(32000); // Q11
    expect(guaranteedAt(classic, 14)).toBe(32000); // Q15
  });
  it('no havens always 0; unordered havens handled', () => {
    expect(guaranteedAt({ ...classic, safeHavens: [] }, 14)).toBe(0);
    expect(guaranteedAt({ ...classic, safeHavens: [9, 4] }, 12)).toBe(32000);
  });
  it('12-question ladder', () => {
    const uk = LADDER_PRESETS.find((l) => l.id === 'uk-12')!;
    expect(guaranteedAt(uk, 1)).toBe(0);
    expect(guaranteedAt(uk, 2)).toBe(1000);
    expect(guaranteedAt(uk, 7)).toBe(50000);
  });
});

describe('formatMoney', () => {
  it('formats currencies', () => {
    expect(formatMoney(1000000, '$')).toBe('$1,000,000');
    expect(formatMoney(500, '£')).toBe('£500');
    expect(formatMoney(32000, '€')).toBe('€32,000');
    expect(formatMoney(1500, 'pts')).toBe('1,500 pts');
    expect(formatMoney(0, '$')).toBe('$0');
  });
});
