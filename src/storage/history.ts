// WP4 owns this file.
import type { GameOutcome, HistoryEntry, Stats } from '../core/types';
import { KEYS, isObject, readJSON, removeKey, writeJSON } from './store';

export const HISTORY_CAP = 500;
const OUTCOMES: GameOutcome[] = ['won', 'walked', 'wrong', 'timeout'];

function isEntry(e: unknown): e is HistoryEntry {
  return (
    isObject(e) &&
    typeof e.id === 'string' &&
    typeof e.date === 'string' &&
    typeof e.reachedQ === 'number' &&
    typeof e.winnings === 'number' &&
    typeof e.durationMs === 'number' &&
    OUTCOMES.includes(e.outcome as GameOutcome) &&
    Array.isArray(e.lifelinesUsed)
  );
}

/** Oldest first. Invalid entries are dropped. */
export function getHistory(): HistoryEntry[] {
  const raw = readJSON<unknown>(KEYS.history, []);
  return Array.isArray(raw) ? raw.filter(isEntry) : [];
}

export function addHistory(e: HistoryEntry): void {
  const list = getHistory();
  list.push(e);
  const capped = list.length > HISTORY_CAP ? list.slice(list.length - HISTORY_CAP) : list;
  writeJSON(KEYS.history, capped);
}

export function clearHistory(): void {
  removeKey(KEYS.history);
}

export function computeStats(list: HistoryEntry[]): Stats {
  const stats: Stats = {
    games: list.length,
    wins: 0,
    walks: 0,
    losses: 0,
    timeouts: 0,
    bestWinnings: 0,
    totalWinnings: 0,
    avgReachedQ: 0,
    reachedHistogram: [],
    lifelineUsage: {},
  };
  let reachedSum = 0;
  for (const e of list) {
    if (e.outcome === 'won') stats.wins++;
    else if (e.outcome === 'walked') stats.walks++;
    else if (e.outcome === 'wrong') stats.losses++;
    else stats.timeouts++;
    stats.totalWinnings += e.winnings;
    stats.bestWinnings = Math.max(stats.bestWinnings, e.winnings);
    const q = Math.max(0, Math.floor(e.reachedQ));
    reachedSum += q;
    while (stats.reachedHistogram.length <= q) stats.reachedHistogram.push(0);
    stats.reachedHistogram[q]++;
    for (const id of e.lifelinesUsed) {
      stats.lifelineUsage[id] = (stats.lifelineUsage[id] ?? 0) + 1;
    }
  }
  stats.avgReachedQ = list.length ? reachedSum / list.length : 0;
  return stats;
}

export function getStats(): Stats {
  return computeStats(getHistory());
}

export interface BankStats {
  played: number;
  won: number;
  best: number;
  avgWinnings: number;
}

/** Per bank (or custom game) breakdown, keyed by bankId or customGameId. */
export function getPerBankStats(): Record<string, BankStats> {
  const out: Record<string, BankStats> = {};
  for (const e of getHistory()) {
    const key = e.bankId ?? e.customGameId;
    if (!key) continue;
    const b = (out[key] ??= { played: 0, won: 0, best: 0, avgWinnings: 0 });
    b.avgWinnings = (b.avgWinnings * b.played + e.winnings) / (b.played + 1);
    b.played++;
    if (e.outcome === 'won') b.won++;
    b.best = Math.max(b.best, e.winnings);
  }
  return out;
}
