import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gameScreen } from '../../../src/ui/screens/game';
import { BUILT_IN_LIFELINES } from '../../../src/core/lifelines';
import { closeAllModals } from '../../../src/ui/components/modal';
import type { AppContext, GameConfig, Question } from '../../../src/core/types';

const q = (i: number): Question => ({
  id: `q${i}`,
  text: `Question ${i}?`,
  answers: ['right', 'w1', 'w2', 'w3'],
  correct: 0,
  difficulty: 1,
});

function config(): GameConfig {
  return {
    questions: [0, 1, 2, 3, 4].map(q),
    spares: [q(9), q(10), q(11)],
    ladder: {
      id: 't',
      name: 't',
      currency: '$',
      prizes: [100, 200, 300, 400, 500],
      safeHavens: [1],
    },
    lifelines: BUILT_IN_LIFELINES.filter((l) => l.id === 'fifty-fifty'),
    timer: { mode: 'off' },
    shuffleAnswers: false,
    seed: 7,
  };
}

function makeCtx(): AppContext {
  return {
    navigate: vi.fn(),
    getSettings: () =>
      ({
        muted: true,
        volume: 0,
        reducedMotion: 'on',
        shuffleAnswers: false,
        defaultTimer: { mode: 'off' },
        hostCommentary: true,
        revealDelayMs: 1000,
      }) as never,
    updateSettings: vi.fn() as never,
    sound: { unlock: vi.fn(), play: vi.fn(), setMuted: vi.fn(), setVolume: vi.fn() },
    announce: vi.fn(),
    reducedMotion: () => true,
    devParams: {},
  };
}

const click = (sel: string): void => {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error('missing ' + sel);
  el.click();
};

describe('game screen controller', () => {
  let root: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => {
    closeAllModals();
    root.remove();
    vi.useRealTimers();
  });

  it('plays a correct answer then a wrong answer to the results screen', async () => {
    const ctx = makeCtx();
    const unmount = gameScreen.mount(root, ctx, { config: config() });
    click('[data-act="start"]');
    vi.advanceTimersByTime(1000);
    expect(root.querySelector('[aria-current="step"]')?.getAttribute('data-q')).toBe('0');
    click('.hex-answer[data-index="0"]');
    click('.modal [data-value="final"]');
    await vi.advanceTimersByTimeAsync(5000);
    expect(root.querySelector('.banner--correct')).not.toBeNull();
    click('[data-act="next"]');
    vi.advanceTimersByTime(1000);
    expect(root.querySelector('[aria-current="step"]')?.getAttribute('data-q')).toBe('1');
    click('.hex-answer[data-index="1"]');
    click('.modal [data-value="final"]');
    await vi.advanceTimersByTimeAsync(5000);
    expect(root.querySelector('.hex-answer[data-state="correct"]')).not.toBeNull();
    expect(root.querySelector('.hex-answer[data-state="wrong"]')).not.toBeNull();
    click('[data-act="results"]');
    expect(ctx.navigate).toHaveBeenCalledWith(
      'results',
      expect.objectContaining({ finalState: expect.anything() }),
    );
    unmount();
  });

  it('uses 50:50 then walks away after confirming', async () => {
    const ctx = makeCtx();
    gameScreen.mount(root, ctx, { config: config() });
    click('[data-act="start"]');
    vi.advanceTimersByTime(1000);
    click('.lifeline');
    click('[data-act="lifeline-done"]');
    expect(root.querySelectorAll('.hex-answer[data-state="eliminated"]').length).toBe(2);
    click('.walk-btn');
    expect(document.querySelector('.modal')?.textContent).toContain('Walk away');
    click('.modal [data-value="walk"]');
    await vi.advanceTimersByTimeAsync(10);
    click('[data-act="results"]');
    expect(ctx.navigate).toHaveBeenCalledWith(
      'results',
      expect.objectContaining({ finalState: expect.objectContaining({ outcome: 'walked' }) }),
    );
  });

  it('Not yet cancels the final-answer modal', async () => {
    const ctx = makeCtx();
    gameScreen.mount(root, ctx, { config: config() });
    click('[data-act="start"]');
    vi.advanceTimersByTime(1000);
    click('.hex-answer[data-index="2"]');
    click('.modal [data-value="cancel"]');
    await vi.advanceTimersByTimeAsync(10);
    expect(document.querySelector('.modal')).toBeNull();
    expect(root.querySelector('.hex-answer[data-state="selected"]')).toBeNull();
  });
});
