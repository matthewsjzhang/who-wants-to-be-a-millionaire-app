// WP1: prize ladders.
import type { Currency, LadderConfig } from './types';

const CLASSIC_PRIZES = [
  100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000,
];

export const LADDER_PRESETS: LadderConfig[] = [
  {
    id: 'classic',
    name: 'Classic (15 questions)',
    currency: '$',
    prizes: [...CLASSIC_PRIZES],
    safeHavens: [4, 9],
    topPrizeLabel: 'Millionaire',
  },
  {
    id: 'uk-12',
    name: 'UK 2007 (12 questions)',
    currency: '£',
    prizes: [500, 1000, 2000, 5000, 10000, 20000, 50000, 75000, 150000, 250000, 500000, 1000000],
    safeHavens: [1, 6],
    topPrizeLabel: 'Millionaire',
  },
  {
    id: 'no-safety-net',
    name: 'No safety net',
    currency: '$',
    prizes: [...CLASSIC_PRIZES],
    safeHavens: [],
    topPrizeLabel: 'Millionaire',
  },
  {
    id: 'single-haven',
    name: 'Single safe haven',
    currency: '$',
    prizes: [...CLASSIC_PRIZES],
    safeHavens: [4],
    topPrizeLabel: 'Millionaire',
  },
  {
    id: 'custom',
    name: 'Custom',
    currency: 'pts',
    prizes: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    safeHavens: [4],
  },
];

const CURRENCIES: Currency[] = ['$', '£', '€', 'pts'];

/** Returns a list of human-readable problems; empty means valid. */
export function validateLadder(l: LadderConfig): string[] {
  const errors: string[] = [];
  if (!l || typeof l !== 'object') return ['Ladder is missing.'];
  if (!l.id || typeof l.id !== 'string') errors.push('Ladder needs an id.');
  if (!l.name || typeof l.name !== 'string' || !l.name.trim()) errors.push('Ladder needs a name.');
  if (!CURRENCIES.includes(l.currency)) errors.push('Unknown currency.');
  const prizes = l.prizes;
  if (!Array.isArray(prizes) || prizes.length < 1 || prizes.length > 20) {
    errors.push('Ladder must have between 1 and 20 prizes.');
  } else {
    prizes.forEach((p, i) => {
      if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0) {
        errors.push(`Prize ${i + 1} must be a positive number.`);
      } else if (i > 0 && typeof prizes[i - 1] === 'number' && p <= prizes[i - 1]) {
        errors.push(`Prize ${i + 1} must be greater than prize ${i}.`);
      }
    });
  }
  const n = Array.isArray(prizes) ? prizes.length : 0;
  if (!Array.isArray(l.safeHavens)) {
    errors.push('safeHavens must be a list.');
  } else {
    const seen = new Set<number>();
    for (const h of l.safeHavens) {
      if (!Number.isInteger(h) || h < 0 || h >= n) {
        errors.push(`Safe haven ${String(h)} is outside the ladder.`);
      } else if (seen.has(h)) {
        errors.push(`Safe haven ${h + 1} is listed twice.`);
      }
      seen.add(h);
    }
  }
  return errors;
}

/** Guaranteed prize when standing on qIndex (prize of highest safe haven below qIndex, else 0). */
export function guaranteedAt(l: LadderConfig, qIndex: number): number {
  let best = -1;
  for (const h of l.safeHavens) {
    if (h < qIndex && h > best && h < l.prizes.length) best = h;
  }
  return best >= 0 ? l.prizes[best] : 0;
}

export function formatMoney(n: number, currency: Currency): string {
  const body = Math.round(n).toLocaleString('en-US');
  return currency === 'pts' ? `${body} pts` : `${currency}${body}`;
}
