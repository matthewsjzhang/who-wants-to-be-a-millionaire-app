import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppContext, LifelineDef, Question, QuestionBank, CustomGame } from '../../../src/core/types';

const mk = (id: string, i: number): Question => ({
  id, text: `Q${i}`, answers: ['a', 'b', 'c', 'd'], correct: 0, difficulty: 1,
});
const bank: QuestionBank = {
  schemaVersion: 1, id: 'b1', name: 'Set 1', episode: 1, date: '2000-01-01', edition: 'US',
  provenance: 'episode-style', questions: Array.from({ length: 15 }, (_, i) => mk(`q${i}`, i)),
  spares: [mk('s1', 0), mk('s2', 1), mk('s3', 2)],
};
const ll = (id: string): LifelineDef => ({ id, name: id, icon: 'x', effect: 'remove-wrong', params: {}, uses: 1, builtIn: true });
const customLl: LifelineDef = { ...ll('mine'), builtIn: false };
const game: CustomGame = {
  id: 'g1', name: 'Mine', createdAt: 'x', updatedAt: 'x', questions: bank.questions.slice(0, 5), spares: [],
  ladder: { id: 'own', name: 'Own', currency: 'pts', prizes: [1, 2, 3, 4, 5], safeHavens: [2] },
  lifelineIds: ['mine'], timer: { mode: 'off' },
};

vi.mock('../../../src/core/lifelines', () => ({
  BUILT_IN_LIFELINES: ['fifty-fifty', 'phone-a-friend', 'ask-the-audience', 'switch-the-question', 'double-dip'].map((id) => ({ id, name: id, icon: 'x', effect: 'remove-wrong', params: {}, uses: 1, builtIn: true })),
  DEFAULT_LIFELINE_IDS: ['fifty-fifty', 'phone-a-friend', 'ask-the-audience'],
}));
vi.mock('../../../src/data/bankLoader', () => ({
  loadBank: vi.fn(async () => bank),
  randomBank: () => ({ id: 'b1' }),
}));
vi.mock('../../../src/storage/customGames', () => ({
  listCustomGames: () => [game],
  listCustomLifelines: () => [customLl],
}));

import { setupScreen, buildGameConfig, clockTimer, pickQuestions } from '../../../src/ui/screens/setup';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(params: Record<string, unknown>, devParams = {}) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const ctx = {
    navigate: vi.fn(),
    getSettings: () => ({ shuffleAnswers: true, defaultTimer: { mode: 'off' } }),
    devParams,
  } as unknown as AppContext;
  setupScreen.mount(root, ctx, params);
  await flush();
  return { root, ctx };
}

describe('setup helpers', () => {
  it('clockTimer sizes to ladder', () => {
    const t = clockTimer(15);
    expect(t.mode === 'clock' && t.secondsPerQuestion).toEqual([...Array(5).fill(15), ...Array(5).fill(30), ...Array(5).fill(45)]);
    expect(clockTimer(12).mode === 'clock' && (clockTimer(12) as { secondsPerQuestion: number[] }).secondsPerQuestion).toHaveLength(12);
  });
  it('pickQuestions keeps endpoints', () => {
    const p = pickQuestions(bank.questions, 12);
    expect(p).toHaveLength(12);
    expect(p[0]).toBe(bank.questions[0]);
    expect(p[11]).toBe(bank.questions[14]);
  });
  it('buildGameConfig rejects too-long ladders', () => {
    const ladder = { id: 'x', name: 'x', currency: '$' as const, prizes: [1, 2, 3], safeHavens: [] };
    expect(() => buildGameConfig({ game: { ...game, questions: [] }, choices: { lifelineIds: [], ladder, timerMode: 'off', customSeconds: 30, shuffleAnswers: false }, allLifelines: [], seed: 1 })).toThrow();
  });
});

describe('setup screen', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('defaults lifelines, then starts a bank game with the dev seed', async () => {
    const { root, ctx } = await mount({ bankId: 'b1' }, { seed: 42 });
    const checked = (id: string) => (root.querySelector(`#ll-${id}`) as HTMLInputElement).checked;
    expect(['fifty-fifty', 'phone-a-friend', 'ask-the-audience'].every(checked)).toBe(true);
    expect(checked('switch-the-question')).toBe(false);
    expect(checked('double-dip')).toBe(false);
    expect(checked('mine')).toBe(false);
    expect((root.querySelector('#timer-off') as HTMLInputElement).checked).toBe(true);
    (root.querySelector('#ll-switch-the-question') as HTMLInputElement).click();
    (root.querySelector('#timer-clock') as HTMLInputElement).click();
    (root.querySelector('#setup-start') as HTMLElement).click();
    const cfg = (ctx.navigate as ReturnType<typeof vi.fn>).mock.calls[0]![1].config;
    expect((ctx.navigate as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('game');
    expect(cfg.seed).toBe(42);
    expect(cfg.sourceBankId).toBe('b1');
    expect(cfg.questions).toHaveLength(cfg.ladder.prizes.length);
    expect(cfg.lifelines.map((l: LifelineDef) => l.id)).toEqual(['fifty-fifty', 'phone-a-friend', 'ask-the-audience', 'switch-the-question']);
    expect(cfg.timer.mode).toBe('clock');
    expect(cfg.shuffleAnswers).toBe(true);
  });

  it('uses the custom game lifelines and own ladder', async () => {
    const { root, ctx } = await mount({ customGameId: 'g1' });
    expect((root.querySelector('#ll-mine') as HTMLInputElement).checked).toBe(true);
    expect((root.querySelector('#ll-phone-a-friend') as HTMLInputElement).checked).toBe(false);
    (root.querySelector('#timer-custom') as HTMLInputElement).click();
    (root.querySelector('#setup-seconds') as HTMLInputElement).value = '20';
    (root.querySelector('#setup-start') as HTMLElement).click();
    const cfg = (ctx.navigate as ReturnType<typeof vi.fn>).mock.calls[0]![1].config;
    expect(cfg.customGameId).toBe('g1');
    expect(cfg.ladder.prizes).toEqual([1, 2, 3, 4, 5]);
    expect(cfg.lifelines.map((l: LifelineDef) => l.id)).toEqual(['mine']);
    expect(cfg.timer.secondsPerQuestion).toEqual([20, 20, 20, 20, 20]);
  });

  it('shows an error when nothing is selected', async () => {
    const { root } = await mount({});
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No question set');
  });
});
