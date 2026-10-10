import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CustomGame,
  GameState,
  HistoryEntry,
  LifelineDef,
  Question,
} from '../../../src/core/types';
import { KEYS, readJSON, registerMigration, writeJSON } from '../../../src/storage/store';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../../../src/storage/settings';
import { clearSavedGame, loadSavedGame, saveGame } from '../../../src/storage/savegame';
import {
  HISTORY_CAP,
  addHistory,
  clearHistory,
  getHistory,
  getPerBankStats,
  getStats,
} from '../../../src/storage/history';
import {
  deleteCustomGame,
  deleteLifeline,
  flagQuestion,
  getFlaggedQuestionIds,
  listCustomGames,
  listCustomLifelines,
  upsertCustomGame,
  upsertLifeline,
} from '../../../src/storage/customGames';
import { exportJSON, importJSON } from '../../../src/storage/io';

const q = (id: string): Question => ({
  id,
  text: 'Q ' + id,
  answers: ['a', 'b', 'c', 'd'],
  correct: 1,
  difficulty: 1,
});
const game = (id: string, lifelineIds: string[] = ['fifty-fifty']): CustomGame => ({
  id,
  name: 'Game ' + id,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  questions: [q('1'), q('2')],
  spares: [],
  ladder: { id: 'l', name: 'L', currency: '$', prizes: [100, 200], safeHavens: [0] },
  lifelineIds,
  timer: { mode: 'off' },
});
const life = (id: string): LifelineDef => ({
  id,
  name: 'LL ' + id,
  icon: 'x',
  effect: 'remove-wrong',
  params: { n: 1 },
  uses: 1,
  builtIn: false,
});
const entry = (i: number, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'h' + i,
  date: '2024-01-01T00:00:00.000Z',
  bankId: 'ep-001',
  reachedQ: 3,
  outcome: 'wrong',
  winnings: 0,
  lifelinesUsed: [],
  durationMs: 1000,
  ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('store', () => {
  it('returns fallback for missing, corrupt and invalid data', () => {
    expect(readJSON('mq:v1:x', 5)).toBe(5);
    localStorage.setItem('mq:v1:x', '{nope');
    expect(readJSON('mq:v1:x', 5)).toBe(5);
    expect(localStorage.getItem('mq:v1:x')).toBeNull();
    localStorage.setItem('mq:v1:x', '"str"');
    expect(readJSON<number>('mq:v1:x', 7, (v): v is number => typeof v === 'number')).toBe(7);
  });
  it('handles quota errors and runs migrations', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(writeJSON('mq:v1:y', 1)).toBe(false);
    spy.mockRestore();
    expect(writeJSON('mq:v1:y', { old: 1 })).toBe(true);
    registerMigration('mq:v1:y', (r) => ({ new: (r as { old: number }).old }));
    expect(readJSON('mq:v1:y', null)).toEqual({ new: 1 });
  });
  it('survives getItem throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readJSON('mq:v1:z', 'fb')).toBe('fb');
  });
});

describe('settings', () => {
  it('defaults, round trip, sanitises', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    saveSettings({ ...DEFAULT_SETTINGS, muted: true, volume: 0.2 });
    expect(getSettings().muted).toBe(true);
    localStorage.setItem(
      KEYS.settings,
      JSON.stringify({ volume: 9, muted: 'yes', reducedMotion: 'bad' }),
    );
    const s = getSettings();
    expect(s.volume).toBe(1);
    expect(s.muted).toBe(false);
    expect(s.reducedMotion).toBe('system');
  });
  it('keeps a valid clock timer', () => {
    const t = {
      mode: 'clock' as const,
      secondsPerQuestion: [15, 30],
      bankUnusedToLast: true,
      onTimeout: 'lose' as const,
    };
    saveSettings({ ...DEFAULT_SETTINGS, defaultTimer: t });
    expect(getSettings().defaultTimer).toEqual(t);
  });
});

describe('savegame', () => {
  const state = {
    phase: 'AWAITING',
    qIndex: 1,
    current: q('1'),
    eliminated: [],
    lifelineUses: {},
    activeEffects: { secondChanceArmed: false, secondChanceUsedOnQuestion: false },
    config: { questions: [q('1')], ladder: { prizes: [1] }, lifelines: [] },
  } as unknown as GameState;
  it('saves, loads, clears', () => {
    expect(loadSavedGame()).toBeNull();
    saveGame(state);
    expect(loadSavedGame()?.qIndex).toBe(1);
    clearSavedGame();
    expect(loadSavedGame()).toBeNull();
  });
  it('rejects corrupt and finished saves', () => {
    localStorage.setItem(KEYS.save, '{"version":1,"state":{}}');
    expect(loadSavedGame()).toBeNull();
    saveGame({ ...state, phase: 'GAME_OVER' });
    expect(loadSavedGame()).toBeNull();
  });
});

describe('history', () => {
  it('caps at 500 keeping newest', () => {
    const many = Array.from({ length: HISTORY_CAP }, (_, i) => entry(i));
    localStorage.setItem(KEYS.history, JSON.stringify(many));
    for (let i = HISTORY_CAP; i < HISTORY_CAP + 5; i++) addHistory(entry(i));
    const h = getHistory();
    expect(h).toHaveLength(HISTORY_CAP);
    expect(h[h.length - 1].id).toBe('h' + (HISTORY_CAP + 4));
    expect(h[0].id).toBe('h5');
    clearHistory();
    expect(getHistory()).toEqual([]);
  });
  it('computes stats', () => {
    expect(getStats().games).toBe(0);
    addHistory(
      entry(1, {
        outcome: 'won',
        winnings: 1000000,
        reachedQ: 14,
        lifelinesUsed: ['fifty-fifty', 'phone'],
      }),
    );
    addHistory(entry(2, { outcome: 'walked', winnings: 500, reachedQ: 4, lifelinesUsed: ['phone'] }));
    addHistory(entry(3, { outcome: 'timeout', bankId: 'ep-002', winnings: 0, reachedQ: 1 }));
    addHistory(entry(4));
    const s = getStats();
    expect(s).toMatchObject({
      games: 4,
      wins: 1,
      walks: 1,
      timeouts: 1,
      losses: 1,
      bestWinnings: 1000000,
    });
    expect(s.lifelineUsage).toEqual({ 'fifty-fifty': 1, phone: 2 });
    expect(s.avgReachedQ).toBe((14 + 4 + 1 + 3) / 4);
    expect(s.reachedHistogram[14]).toBe(1);
    const pb = getPerBankStats();
    expect(pb['ep-001']).toMatchObject({ played: 3, won: 1, best: 1000000 });
    expect(pb['ep-002'].played).toBe(1);
  });
  it('drops invalid entries', () => {
    localStorage.setItem(KEYS.history, JSON.stringify([entry(1), { bad: true }]));
    expect(getHistory()).toHaveLength(1);
  });
});

describe('custom games & lifelines', () => {
  it('CRUD', () => {
    expect(upsertCustomGame(game('g1'))).toBe(true);
    upsertCustomGame(game('g2'));
    upsertCustomGame({ ...game('g1'), name: 'Renamed' });
    expect(listCustomGames().map((g) => g.name)).toEqual(['Renamed', 'Game g2']);
    deleteCustomGame('g1');
    expect(listCustomGames()).toHaveLength(1);
    upsertLifeline(life('l1'));
    upsertLifeline(life('l1'));
    expect(listCustomLifelines()).toHaveLength(1);
    deleteLifeline('l1');
    expect(listCustomLifelines()).toHaveLength(0);
  });
  it('filters corrupt records', () => {
    localStorage.setItem(KEYS.custom, JSON.stringify([game('ok'), { id: 'bad' }]));
    expect(listCustomGames().map((g) => g.id)).toEqual(['ok']);
    localStorage.setItem(KEYS.custom, 'garbage');
    expect(listCustomGames()).toEqual([]);
  });
  it('reports quota failure on upsert', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(upsertCustomGame(game('g'))).toBe(false);
  });
  it('flags questions once', () => {
    flagQuestion('a');
    flagQuestion('a');
    flagQuestion('b');
    expect(getFlaggedQuestionIds()).toEqual(['a', 'b']);
  });
});

describe('export / import', () => {
  it('round trips and regenerates clashing ids', () => {
    upsertLifeline(life('l1'));
    upsertCustomGame(game('g1', ['fifty-fifty', 'l1']));
    flagQuestion('qq');
    const text = exportJSON();
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe('millionaire-custom');
    expect(parsed.flaggedQuestionIds).toEqual(['qq']);

    const res = importJSON(text);
    expect(res).toEqual({ imported: 1, errors: [] });
    const games = listCustomGames();
    expect(games).toHaveLength(2);
    expect(new Set(games.map((g) => g.id)).size).toBe(2);
    // identical lifeline is reused, not duplicated
    expect(listCustomLifelines()).toHaveLength(1);
    const copy = games.find((g) => g.id !== 'g1')!;
    expect(copy.lifelineIds).toEqual(['fifty-fifty', 'l1']);
    expect(getFlaggedQuestionIds()).toEqual(['qq']);
  });
  it('regenerates the id of a clashing but different lifeline', () => {
    upsertLifeline(life('l1'));
    upsertCustomGame(game('g1', ['l1']));
    const parsed = JSON.parse(exportJSON());
    parsed.lifelines[0].name = 'Different';
    expect(importJSON(JSON.stringify(parsed)).imported).toBe(1);
    const lls = listCustomLifelines();
    expect(lls).toHaveLength(2);
    const newLl = lls.find((l) => l.id !== 'l1')!;
    const copy = listCustomGames().find((g) => g.id !== 'g1')!;
    expect(copy.lifelineIds).toEqual([newLl.id]);
  });
  it('exports selected games only', () => {
    upsertCustomGame(game('g1'));
    upsertCustomGame(game('g2'));
    expect(JSON.parse(exportJSON(['g2'])).games.map((g: CustomGame) => g.id)).toEqual(['g2']);
  });
  it('rejects bad input and reports per-item errors', () => {
    expect(importJSON('nope').imported).toBe(0);
    expect(importJSON('{"format":"x"}').errors).toHaveLength(1);
    expect(importJSON('{"format":"millionaire-custom","version":2}').errors[0]).toMatch(/version/);
    const file = {
      format: 'millionaire-custom',
      version: 1,
      games: [game('ok'), { id: 'broken' }],
      lifelines: [{ id: 'x' }],
    };
    const r = importJSON(JSON.stringify(file));
    expect(r.imported).toBe(1);
    expect(r.errors).toHaveLength(2);
  });
  it('forces builtIn=false and avoids built-in id clash', () => {
    const file = {
      format: 'millionaire-custom',
      version: 1,
      games: [],
      lifelines: [{ ...life('phone-a-friend'), builtIn: true }],
    };
    importJSON(JSON.stringify(file));
    const l = listCustomLifelines();
    expect(l).toHaveLength(1);
    expect(l[0].id).not.toBe('phone-a-friend');
    expect(l[0].builtIn).toBe(false);
  });
});
