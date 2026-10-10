import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateDir } from '../../../scripts/validate-banks';

const fx = (d: string) => resolve(__dirname, '../../fixtures', d);

describe('validateDir (across-bank rules)', () => {
  it('passes valid fixtures', () => {
    const r = validateDir(fx('valid'));
    expect(r).toHaveLength(2);
    r.forEach((x) => expect(x.errors).toEqual([]));
  });
  it('tolerates a missing directory', () => {
    expect(validateDir(fx('does-not-exist'))).toEqual([]);
  });
  it('flags id/filename mismatch', () => {
    const r = validateDir(fx('dir-id-mismatch'));
    expect(r[0].errors.some((e) => /does not match filename/.test(e))).toBe(true);
  });
  it('flags duplicate episodes', () => {
    const r = validateDir(fx('dir-dup-episode'));
    expect(r.flatMap((x) => x.errors).some((e) => /duplicate episode/.test(e))).toBe(true);
  });
  it('flags duplicate question text across banks', () => {
    const r = validateDir(fx('dir-dup-text'));
    expect(r.flatMap((x) => x.errors).some((e) => /duplicate question text/.test(e))).toBe(true);
  });
  it('warns on near-duplicates across banks', () => {
    const r = validateDir(fx('dir-near-dup'));
    expect(r.flatMap((x) => x.errors)).toEqual([]);
    expect(r.flatMap((x) => x.warnings).some((w) => /near-duplicate/.test(w))).toBe(true);
  });
});
