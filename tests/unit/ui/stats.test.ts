import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppContext, HistoryEntry } from '../../../src/core/types';

let hist: HistoryEntry[] = [];
vi.mock('../../../src/storage/history', () => ({
  getHistory: () => hist,
  getStats: () => ({
    games: hist.length,
    wins: hist.filter((e) => e.outcome === 'won').length,
    walks: 0,
    losses: 0,
    timeouts: 0,
    bestWinnings: Math.max(0, ...hist.map((e) => e.winnings)),
    totalWinnings: hist.reduce((a, e) => a + e.winnings, 0),
    avgReachedQ: 0,
    reachedHistogram: [],
    lifelineUsage: { fifty: 2 },
  }),
  clearHistory: () => {
    hist = [];
  },
}));
import { statsScreen, perBank } from '../../../src/ui/screens/stats';

const e = (
  id: string,
  bankId: string,
  outcome: HistoryEntry['outcome'],
  winnings: number,
): HistoryEntry => ({
  id,
  date: '2026-01-01T00:00:00Z',
  bankId,
  reachedQ: 3,
  outcome,
  winnings,
  lifelinesUsed: [],
  durationMs: 1,
});
const ctx = { navigate: vi.fn(), announce: vi.fn() } as unknown as AppContext;

describe('stats screen', () => {
  beforeEach(() => {
    hist = [];
  });
  it('shows empty state', () => {
    const root = document.createElement('div');
    statsScreen.mount(root, ctx);
    expect(root.querySelector('[data-testid=empty]')).not.toBeNull();
  });
  it('renders rows and bars, and clears', () => {
    hist = [e('1', 'a', 'won', 1000), e('2', 'a', 'wrong', 0), e('3', 'b', 'walked', 500)];
    window.confirm = () => true;
    const root = document.createElement('div');
    statsScreen.mount(root, ctx);
    expect(root.querySelectorAll('[data-row=history]').length).toBe(3);
    expect(root.textContent).toContain('33%');
    expect(root.querySelectorAll('.st-bar__fill').length).toBeGreaterThan(0);
    (root.querySelector('[data-action=clear]') as HTMLElement).click();
    expect(root.querySelector('[data-testid=empty]')).not.toBeNull();
  });
  it('groups per bank', () => {
    expect(
      perBank([e('1', 'a', 'won', 1), e('2', 'a', 'wrong', 0), e('3', 'b', 'won', 1)]),
    ).toEqual([
      { id: 'a', games: 2, wins: 1 },
      { id: 'b', games: 1, wins: 1 },
    ]);
  });
});
