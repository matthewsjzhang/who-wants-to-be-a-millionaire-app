import { describe, it, expect, vi } from 'vitest';
import { resultsScreen } from '../../../src/ui/screens/results';
import type { AppContext, GameState } from '../../../src/core/types';

function ctx(): AppContext {
  return { navigate: vi.fn(), announce: vi.fn() } as unknown as AppContext;
}
const state = {
  qIndex: 4,
  outcome: 'walked',
  winnings: 1000,
  lifelinesUsed: ['fifty'],
  config: {
    seed: 1,
    questions: [],
    ladder: { currency: '$', prizes: [100, 200, 300, 500, 1000] },
    lifelines: [{ id: 'fifty', name: '50:50' }],
  },
} as unknown as GameState;

describe('results screen', () => {
  it('renders winnings, outcome and lifelines', () => {
    const root = document.createElement('div');
    resultsScreen.mount(root, ctx(), { finalState: state });
    expect(root.textContent).toContain('1,000');
    expect(root.querySelector('[data-outcome]')?.getAttribute('data-outcome')).toBe('walked');
    expect(root.querySelector('[data-testid=lifelines]')?.textContent).toBe('50:50');
    expect(root.textContent).toContain('5 of 5');
  });
  it('play again keeps config, menu navigates', () => {
    const root = document.createElement('div');
    const c = ctx();
    resultsScreen.mount(root, c, { finalState: state });
    (root.querySelector('[data-action=again]') as HTMLElement).click();
    const nav = c.navigate as ReturnType<typeof vi.fn>;
    expect(nav.mock.calls[0][0]).toBe('game');
    expect(nav.mock.calls[0][1].config.ladder).toBe(state.config.ladder);
    (root.querySelector('[data-action=menu]') as HTMLElement).click();
    expect(nav.mock.calls[1][0]).toBe('menu');
  });
  it('handles missing state', () => {
    const root = document.createElement('div');
    resultsScreen.mount(root, ctx(), {});
    expect(root.textContent).toContain('No finished game');
  });
});
