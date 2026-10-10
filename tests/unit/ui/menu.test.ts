import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppContext, BankMeta, CustomGame } from '../../../src/core/types';

const banks: BankMeta[] = [
  { id: 'b2', name: 'Set 2: Space', episode: 2, date: '2001-01-01', edition: 'UK', provenance: 'episode-style', tags: ['science'], questionCount: 15, spareCount: 3, difficulties: [1, 2, 3] },
  { id: 'b1', name: 'Set 1: Food', episode: 1, date: '2005-01-01', edition: 'US', provenance: 'episode-style', tags: ['cooking'], questionCount: 15, spareCount: 3, difficulties: [1, 5] },
];
const game: CustomGame = {
  id: 'g1', name: 'Mine', createdAt: 'x', updatedAt: 'x', questions: [], spares: [],
  ladder: { id: 'l', name: 'L', currency: '$', prizes: [1], safeHavens: [] }, lifelineIds: [], timer: { mode: 'off' },
};
const store = { games: [game] as CustomGame[], saved: null as unknown };

vi.mock('../../../src/data/bankLoader', () => ({
  listBanks: () => banks,
  randomBank: () => banks[0],
  loadBank: vi.fn(),
}));
vi.mock('../../../src/storage/customGames', () => ({
  listCustomGames: () => store.games,
  upsertCustomGame: (g: CustomGame) => store.games.push(g),
  deleteCustomGame: (id: string) => { store.games = store.games.filter((g) => g.id !== id); },
}));
vi.mock('../../../src/storage/io', () => ({ exportJSON: () => '{}', importJSON: () => ({ imported: 0, errors: [] }) }));
vi.mock('../../../src/storage/savegame', () => ({
  loadSavedGame: () => store.saved,
  clearSavedGame: () => { store.saved = null; },
}));

import { menuScreen, filterBanks } from '../../../src/ui/screens/menu';

const base = { query: '', edition: '' as const, difficulty: 0 as const, sort: 'episode' as const, dir: 'asc' as const };

function mount() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const ctx = { navigate: vi.fn(), announce: vi.fn() } as unknown as AppContext;
  const un = menuScreen.mount(root, ctx);
  return { root, ctx, un };
}

describe('filterBanks', () => {
  it('sorts by episode and date, both directions', () => {
    expect(filterBanks(banks, base).map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(filterBanks(banks, { ...base, dir: 'desc' }).map((b) => b.id)).toEqual(['b2', 'b1']);
    expect(filterBanks(banks, { ...base, sort: 'date' }).map((b) => b.id)).toEqual(['b2', 'b1']);
  });
  it('filters by query (name + tag), edition and difficulty', () => {
    expect(filterBanks(banks, { ...base, query: 'cook' }).map((b) => b.id)).toEqual(['b1']);
    expect(filterBanks(banks, { ...base, query: 'SPACE' }).map((b) => b.id)).toEqual(['b2']);
    expect(filterBanks(banks, { ...base, edition: 'UK' }).map((b) => b.id)).toEqual(['b2']);
    expect(filterBanks(banks, { ...base, difficulty: 5 }).map((b) => b.id)).toEqual(['b1']);
  });
});

describe('menu screen', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    store.games = [game];
    store.saved = null;
  });

  it('puts custom games above the library and shows the badge', () => {
    const { root } = mount();
    const text = root.textContent ?? '';
    expect(text.indexOf('Your Custom Games')).toBeLessThan(text.indexOf('Question Library'));
    expect(text).toContain('Episode-style set: original questions inspired by');
    expect(text).toContain('Style era 2001-01-01');
  });

  it('navigates from cards and buttons', () => {
    const { root, ctx } = mount();
    (root.querySelector('[data-act="play"]') as HTMLElement).click();
    expect(ctx.navigate).toHaveBeenCalledWith('setup', { customGameId: 'g1' });
    (root.querySelector('[data-act="edit"]') as HTMLElement).click();
    expect(ctx.navigate).toHaveBeenCalledWith('editor', { editId: 'g1' });
    (root.querySelector('#new-custom') as HTMLElement).click();
    expect(ctx.navigate).toHaveBeenCalledWith('editor');
    (root.querySelector('[data-bank-id="b1"] button') as HTMLElement).click();
    expect(ctx.navigate).toHaveBeenCalledWith('setup', { bankId: 'b1' });
    (root.querySelector('#lib-random') as HTMLElement).click();
    expect(ctx.navigate).toHaveBeenCalledWith('setup', { bankId: 'b2' });
  });

  it('duplicates and deletes custom games', () => {
    const { root } = mount();
    (root.querySelector('[data-act="duplicate"]') as HTMLElement).click();
    expect(store.games).toHaveLength(2);
    expect(store.games[1]!.name).toBe('Mine (copy)');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (root.querySelector('[data-act="delete"]') as HTMLElement).click();
    expect(store.games).toHaveLength(1);
  });

  it('shows resume banner only with a save', () => {
    expect(mount().root.querySelector('#resume-btn')).toBeNull();
    document.body.innerHTML = '';
    store.saved = { qIndex: 4 };
    const { root, ctx } = mount();
    (root.querySelector('#resume-btn') as HTMLElement).click();
    expect(ctx.navigate).toHaveBeenCalledWith('game', { resume: true });
  });

  it('debounces search', () => {
    vi.useFakeTimers();
    const { root } = mount();
    const input = root.querySelector('#lib-search') as HTMLInputElement;
    input.value = 'cook';
    input.dispatchEvent(new Event('input'));
    expect(root.querySelectorAll('.bank-card')).toHaveLength(2);
    vi.advanceTimersByTime(250);
    expect(root.querySelectorAll('.bank-card')).toHaveLength(1);
    vi.useRealTimers();
  });
});
