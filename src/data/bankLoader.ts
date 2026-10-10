// WP3: bank listing (from generated manifest) and lazy loading.
import type { BankFilter, BankMeta, QuestionBank } from '../core/types';
import manifest from './banks.manifest.json';

const loaders = import.meta.glob('./banks/*.json', { import: 'default' }) as Record<string, () => Promise<unknown>>;

export function listBanks(): BankMeta[] {
  return manifest as unknown as BankMeta[];
}

export async function loadBank(id: string): Promise<QuestionBank> {
  const loader = loaders[`./banks/${id}.json`];
  if (!loader) throw new Error(`Unknown bank: ${id}`);
  return (await loader()) as QuestionBank;
}

export function filterBanks(banks: BankMeta[], filter?: BankFilter): BankMeta[] {
  if (!filter) return banks;
  const q = filter.query?.trim().toLowerCase();
  return banks.filter((b) => {
    if (filter.edition && b.edition !== filter.edition) return false;
    if (filter.difficulty && !b.difficulties.includes(filter.difficulty)) return false;
    if (filter.tag && !b.tags.includes(filter.tag)) return false;
    if (
      q &&
      !(
        b.name.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        b.tags.some((t) => t.toLowerCase().includes(q))
      )
    ) {
      return false;
    }
    return true;
  });
}

export function randomBank(filter?: BankFilter, rand: () => number = Math.random): BankMeta {
  const pool = filterBanks(listBanks(), filter);
  if (pool.length === 0) throw new Error('No banks match the filter');
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
