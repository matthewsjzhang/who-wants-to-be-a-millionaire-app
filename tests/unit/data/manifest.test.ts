import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest } from '../../../scripts/build-manifest';
import { filterBanks, listBanks, randomBank } from '../../../src/data/bankLoader';
import type { BankMeta } from '../../../src/core/types';

describe('buildManifest', () => {
  it('builds sorted BankMeta from fixtures', () => {
    const m = buildManifest(resolve(__dirname, '../../fixtures/valid'));
    expect(m.map((b) => b.id)).toEqual(['ep-901', 'ep-902']);
    expect(m[0]).toMatchObject({ questionCount: 15, spareCount: 3, difficulties: [1, 2, 3, 4, 5], edition: 'US' });
  });
  it('tolerates a missing dir', () => {
    expect(buildManifest(resolve(__dirname, '../../fixtures/nope'))).toEqual([]);
  });
});

describe('bankLoader', () => {
  const metas: BankMeta[] = [
    { id: 'a', name: 'Set 1: Rivers', episode: 1, date: '2000-01-01', edition: 'US', provenance: 'episode-style', tags: ['geo'], questionCount: 15, spareCount: 3, difficulties: [1, 2, 3, 4, 5] },
    { id: 'b', name: 'Set 2: Music', episode: 2, date: '2001-01-01', edition: 'UK', provenance: 'episode-style', tags: [], questionCount: 15, spareCount: 3, difficulties: [1, 2] },
  ];
  it('filters', () => {
    expect(filterBanks(metas, { edition: 'UK' }).map((b) => b.id)).toEqual(['b']);
    expect(filterBanks(metas, { query: 'river' }).map((b) => b.id)).toEqual(['a']);
    expect(filterBanks(metas, { tag: 'geo' }).map((b) => b.id)).toEqual(['a']);
    expect(filterBanks(metas, { difficulty: 5 }).map((b) => b.id)).toEqual(['a']);
  });
  it('listBanks returns an array and randomBank throws when nothing matches', () => {
    expect(Array.isArray(listBanks())).toBe(true);
    expect(() => randomBank({ query: 'zzz-no-such-bank-zzz' })).toThrow();
  });
});
