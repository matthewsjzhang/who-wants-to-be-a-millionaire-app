import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateDir } from '../../../scripts/validate-banks';
import { validateBank } from '../../../src/data/schema';

const dir = resolve(__dirname, '../../../src/data/banks');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

describe('real banks', () => {
  it('has no per-bank validation errors (warnings tolerated)', () => {
    for (const f of files) {
      const r = validateBank(JSON.parse(readFileSync(resolve(dir, f), 'utf8')));
      expect({ file: f, errors: r.errors }).toEqual({ file: f, errors: [] });
    }
  });
  // Cross-bank duplicate question text is enforced by `npm run validate` (content is still being authored).
  it('has no bank id/episode/filename errors across banks', () => {
    for (const r of validateDir(dir)) {
      const errors = r.errors.filter((e) => /bank id|episode|filename|question id/.test(e));
      expect({ file: r.file, errors }).toEqual({ file: r.file, errors: [] });
    }
  });
});
