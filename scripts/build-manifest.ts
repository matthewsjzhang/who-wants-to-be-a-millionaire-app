import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BankMeta, Difficulty, QuestionBank } from '../src/core/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const banksDir = resolve(root, 'src/data/banks');
const out = resolve(root, 'src/data/banks.manifest.json');

export function buildManifest(dir: string): BankMeta[] {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  const metas: BankMeta[] = [];
  for (const f of files) {
    try {
      const b = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as QuestionBank;
      const diffs = [...new Set(b.questions.map((q) => q.difficulty))].sort((a, c) => a - c) as Difficulty[];
      metas.push({
        id: b.id,
        name: b.name,
        episode: b.episode,
        date: b.date,
        edition: b.edition,
        provenance: b.provenance,
        tags: b.tags ?? [],
        questionCount: b.questions.length,
        spareCount: b.spares.length,
        difficulties: diffs,
      });
    } catch (e) {
      console.warn(`manifest: skipping ${f}: ${(e as Error).message}`);
    }
  }
  return metas.sort((a, b) => a.episode - b.episode || a.id.localeCompare(b.id));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(banksDir, { recursive: true });
  const metas = buildManifest(banksDir);
  writeFileSync(out, JSON.stringify(metas, null, 2) + '\n');
  console.log(`manifest: ${metas.length} bank(s) written`);
}
