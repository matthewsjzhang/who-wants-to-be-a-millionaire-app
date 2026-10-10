/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../../../src/core/types';

const { CLASSIC, SHORT, builtIns, stored } = vi.hoisted(() => ({
  CLASSIC: {
    id: 'classic',
    name: 'Classic',
    currency: '$' as const,
    prizes: [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000],
    safeHavens: [4, 9],
  },
  SHORT: { id: 'short', name: 'Short', currency: '$' as const, prizes: [100, 200, 300], safeHavens: [1] },
  builtIns: [
    { id: 'fifty-fifty', name: '50:50', icon: 'x', effect: 'remove-wrong', params: { n: 2 }, uses: 1, builtIn: true },
    { id: 'phone-a-friend', name: 'Phone', icon: 'p', effect: 'friend-hint', params: {}, uses: 1, builtIn: true },
  ] as unknown[],
  stored: { games: [] as unknown[], lifelines: [] as unknown[] },
}));

vi.mock('../../../src/core/ladder', () => ({
  LADDER_PRESETS: [CLASSIC, SHORT],
  validateLadder: () => [],
  formatMoney: (n: number, c: string) => `${c}${n}`,
  guaranteedAt: () => 0,
}));
vi.mock('../../../src/core/lifelines', () => ({
  BUILT_IN_LIFELINES: builtIns,
  DEFAULT_LIFELINE_IDS: ['fifty-fifty', 'phone-a-friend'],
  validateLifeline: () => [],
  applyEffect: () => ({}),
}));
vi.mock('../../../src/data/schema', () => ({
  validateCustomGame: () => ({ ok: true, errors: [], warnings: [] }),
  validateBank: () => ({ ok: true, errors: [], warnings: [] }),
  normalizeText: (s: string) => s,
}));
const upsertCustomGame = vi.hoisted(() => vi.fn((g: { id: string }) => {
  stored.games = [...(stored.games as { id: string }[]).filter((x) => x.id !== g.id), g];
}));
const upsertLifeline = vi.hoisted(() => vi.fn((l: { id: string }) => {
  stored.lifelines = [...(stored.lifelines as { id: string }[]).filter((x) => x.id !== l.id), l];
}));
const deleteLifeline = vi.hoisted(() => vi.fn((id: string) => {
  stored.lifelines = (stored.lifelines as { id: string }[]).filter((x) => x.id !== id);
}));
vi.mock('../../../src/storage/customGames', () => ({
  listCustomGames: () => stored.games,
  upsertCustomGame: (g: unknown) => upsertCustomGame(g as { id: string }),
  deleteCustomGame: () => undefined,
  listCustomLifelines: () => stored.lifelines,
  upsertLifeline: (l: unknown) => upsertLifeline(l as { id: string }),
  deleteLifeline: (id: string) => deleteLifeline(id),
}));
vi.mock('../../../src/storage/io', () => ({
  exportJSON: () => '{}',
  importJSON: () => ({ imported: 0, errors: [] }),
}));

import { editorScreen, questionIssues } from '../../../src/ui/screens/editor';

function makeCtx(): AppContext & { navigate: ReturnType<typeof vi.fn>; announce: ReturnType<typeof vi.fn> } {
  return {
    navigate: vi.fn(),
    announce: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    sound: { unlock() {}, play() {}, setMuted() {}, setVolume() {} },
    reducedMotion: () => false,
    devParams: {},
  } as never;
}

function type(el: Element, value: string): void {
  (el as HTMLInputElement).value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function btnByLabel(root: HTMLElement, label: string): HTMLButtonElement {
  const b = root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!b) throw new Error(`no button ${label}`);
  return b;
}

function textBtn(root: HTMLElement, text: string): HTMLButtonElement {
  const b = Array.from(root.querySelectorAll('button')).find((x) => x.textContent === text);
  if (!b) throw new Error(`no button "${text}"`);
  return b;
}

function mountEditor(editId?: string) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const ctx = makeCtx();
  const unmount = editorScreen.mount(root, ctx, editId ? { editId } : undefined);
  return { root, ctx, unmount };
}

function fillAll(root: HTMLElement): void {
  root.querySelectorAll('.ed-toggle').forEach((t) => {
    if (t.getAttribute('aria-expanded') !== 'true') (t as HTMLElement).click();
  });
  root.querySelectorAll<HTMLTextAreaElement>('textarea[id$="-text"]').forEach((ta, i) => type(ta, `Question ${i}?`));
  Array.from(root.querySelectorAll<HTMLInputElement>('input[type="text"]'))
    .filter((inp) => /-a[0-3]$/.test(inp.id))
    .forEach((inp, i) => type(inp, `ans ${i}`));
}

beforeEach(() => {
  document.body.innerHTML = '';
  stored.games = [];
  stored.lifelines = [];
  vi.clearAllMocks();
});

describe('questionIssues', () => {
  it('flags blanks and duplicate answers', () => {
    const q = { id: 'a', text: '', answers: ['a', 'A', '', 'd'], correct: 0, difficulty: 1 } as never;
    const issues = questionIssues(q);
    expect(issues.length).toBe(3);
  });
});

describe('editor screen', () => {
  it('starts with a classic 15 question ladder', () => {
    const { root } = mountEditor();
    expect(root.querySelectorAll('.ed-card').length).toBe(15);
    expect(root.querySelectorAll('.ed-rung').length).toBe(15);
    expect(root.querySelector('#ladder-preset')).toBeTruthy();
  });

  it('adding and removing questions keeps ladder length in sync', () => {
    const { root } = mountEditor();
    textBtn(root, 'Add question').click();
    expect(root.querySelectorAll('.ed-rung').length).toBe(16);
    expect(root.querySelectorAll('ol.ed-list .ed-card').length).toBe(16);
    btnByLabel(root, 'Remove Question 16').click();
    expect(root.querySelectorAll('.ed-rung').length).toBe(15);
  });

  it('applying a shorter preset shrinks the question list', () => {
    const { root } = mountEditor();
    const sel = root.querySelector<HTMLSelectElement>('#ladder-preset')!;
    sel.value = 'short';
    sel.dispatchEvent(new Event('change'));
    expect(root.querySelectorAll('.ed-rung').length).toBe(3);
    expect(root.querySelectorAll('ol.ed-list .ed-card').length).toBe(3);
  });

  it('reorders questions with accessible buttons', () => {
    const { root } = mountEditor();
    fillAll(root);
    expect(btnByLabel(root, 'Move Question 1 up').disabled).toBe(true);
    btnByLabel(root, 'Move Question 1 down').click();
    const first = root.querySelector<HTMLTextAreaElement>('textarea[id$="-text"]')!;
    expect(first.value).toBe('Question 1?');
  });

  it('blocks saving an invalid game and saves a valid one', () => {
    const { root, ctx } = mountEditor();
    textBtn(root, 'Save').click();
    expect(upsertCustomGame).not.toHaveBeenCalled();
    expect(root.querySelector('#ed-validation')!.textContent).toContain('Give the game a name');

    type(root.querySelector('#game-name')!, 'My Game');
    fillAll(root);
    textBtn(root, 'Save & Play').click();
    expect(upsertCustomGame).toHaveBeenCalledTimes(1);
    const saved = (upsertCustomGame.mock.calls[0][0] as any);
    expect(saved.name).toBe('My Game');
    expect(saved.questions.length).toBe(15);
    expect(saved.ladder.prizes.length).toBe(15);
    expect(ctx.navigate).toHaveBeenCalledWith('setup', { customGameId: saved.id });
  });

  it('toggles safe havens and lifelines', () => {
    const { root } = mountEditor();
    type(root.querySelector('#game-name')!, 'G');
    fillAll(root);
    const haven = root.querySelector<HTMLInputElement>('#haven-2')!;
    haven.checked = true;
    haven.dispatchEvent(new Event('change'));
    const ll = root.querySelector<HTMLInputElement>('#ll-phone-a-friend')!;
    ll.checked = false;
    ll.dispatchEvent(new Event('change'));
    textBtn(root, 'Save').click();
    const saved = (upsertCustomGame.mock.calls[0][0] as any);
    expect(saved.ladder.safeHavens).toEqual([2, 4, 9]);
    expect(saved.lifelineIds).not.toContain('phone-a-friend');
    expect(saved.ladder.id).toBe('custom');
  });

  it('loads an existing game by editId', () => {
    const { root: r1 } = mountEditor();
    type(r1.querySelector('#game-name')!, 'Stored');
    fillAll(r1);
    textBtn(r1, 'Save').click();
    document.body.innerHTML = '';
    const { root } = mountEditor((stored.games[0] as { id: string }).id);
    expect((root.querySelector('#game-name') as HTMLInputElement).value).toBe('Stored');
  });

  it('creates a custom lifeline through the builder', () => {
    const { root } = mountEditor();
    textBtn(root, 'New custom lifeline').click();
    const form = root.querySelector('form.ed-lifeline-form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(upsertLifeline).not.toHaveBeenCalled();
    expect(form.textContent).toContain('Name is required');
    type(form.querySelector('input[type="text"]')!, 'Extra Time');
    const eff = form.querySelector<HTMLSelectElement>('select')!;
    eff.value = 'extra-time';
    eff.dispatchEvent(new Event('change'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(upsertLifeline).toHaveBeenCalledTimes(1);
    const def = (upsertLifeline.mock.calls[0][0] as any);
    expect(def.effect).toBe('extra-time');
    expect(def.params.seconds).toBe(30);
    expect(def.builtIn).toBe(false);
    expect(root.querySelector(`#ll-${def.id}`)).toBeTruthy();
  });
});
