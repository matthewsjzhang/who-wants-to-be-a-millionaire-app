/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jaccard, normalizeText, tokenSet, validateBank } from '../src/data/schema';

export interface BankReport {
  file: string;
  id: string;
  errors: string[];
  warnings: string[];
}

interface Flat {
  bank: string;
  where: string;
  id: string;
  norm: string;
  tokens: Set<string>;
}

/** Validate all banks in a directory, including across-bank checks. */
export function validateDir(dir: string): BankReport[] {
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  const reports: BankReport[] = [];
  const ids = new Map<string, string>();
  const episodes = new Map<number, string>();
  const flat: Flat[] = [];
  const globalCounts = [0, 0, 0, 0];
  let globalN = 0;

  for (const f of files) {
    const stem = f.replace(/\.json$/, '');
    const rep: BankReport = { file: f, id: stem, errors: [], warnings: [] };
    reports.push(rep);
    let b: any;
    try {
      b = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
    } catch (e) {
      rep.errors.push(`parse error: ${(e as Error).message}`);
      continue;
    }
    const r = validateBank(b);
    rep.errors.push(...r.errors);
    rep.warnings.push(...r.warnings);
    if (!b || typeof b !== 'object') continue;
    if (typeof b.id === 'string') {
      rep.id = b.id;
      if (b.id !== stem) rep.errors.push(`id "${b.id}" does not match filename "${f}"`);
      const prev = ids.get(b.id);
      if (prev) rep.errors.push(`duplicate bank id "${b.id}" (also ${prev})`);
      else ids.set(b.id, f);
    }
    if (typeof b.episode === 'number') {
      const prev = episodes.get(b.episode);
      if (prev) rep.errors.push(`duplicate episode ${b.episode} (also ${prev})`);
      else episodes.set(b.episode, f);
    }
    const collect = (list: any, label: string, countCorrect: boolean) => {
      if (!Array.isArray(list)) return;
      list.forEach((q: any, i: number) => {
        if (q && typeof q.text === 'string') {
          flat.push({
            bank: f,
            where: `${label}[${i}]`,
            id: String(q.id),
            norm: normalizeText(q.text),
            tokens: tokenSet(q.text),
          });
        }
        if (countCorrect && q && typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3) {
          globalCounts[q.correct]++;
          globalN++;
        }
      });
    };
    collect(b.questions, 'questions', true);
    collect(b.spares, 'spares', false);
  }

  const byFile = new Map(reports.map((r) => [r.file, r]));
  const seenIds = new Map<string, Flat>();
  const seenText = new Map<string, Flat>();
  for (const q of flat) {
    const rep = byFile.get(q.bank)!;
    const pid = seenIds.get(q.id);
    if (pid && pid.bank !== q.bank) rep.errors.push(`${q.where}: question id "${q.id}" also used in ${pid.bank}`);
    else if (!pid) seenIds.set(q.id, q);
    const pt = seenText.get(q.norm);
    if (pt && pt.bank !== q.bank) rep.errors.push(`${q.where}: duplicate question text of ${pt.bank} ${pt.where}`);
    else if (!pt) seenText.set(q.norm, q);
  }
  // Near-duplicates across banks (Jaccard >= 0.8); exact duplicates are already errors.
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i];
      const c = flat[j];
      if (a.bank === c.bank || a.norm === c.norm) continue;
      const lo = Math.min(a.tokens.size, c.tokens.size);
      const hi = Math.max(a.tokens.size, c.tokens.size);
      if (hi === 0 || lo / hi < 0.8) continue;
      if (jaccard(a.tokens, c.tokens) >= 0.8) {
        byFile.get(c.bank)!.warnings.push(`${c.where}: near-duplicate of ${a.bank} ${a.where}`);
      }
    }
  }
  if (globalN >= 30 && reports.length) {
    globalCounts.forEach((c, i) => {
      if (c / globalN > 0.3) {
        reports[0].warnings.push(
          `global correct-index skew: answer ${i} is correct in ${c}/${globalN} questions (>30%)`,
        );
      }
    });
  }
  return reports;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const reports = validateDir(resolve(root, 'src/data/banks'));
  let errs = 0;
  let warns = 0;
  console.log('bank'.padEnd(24) + 'errors'.padStart(8) + 'warnings'.padStart(10));
  for (const r of reports) {
    errs += r.errors.length;
    warns += r.warnings.length;
    console.log(r.file.padEnd(24) + String(r.errors.length).padStart(8) + String(r.warnings.length).padStart(10));
    for (const e of r.errors) console.log(`  ERROR   ${e}`);
    for (const w of r.warnings) console.log(`  warning ${w}`);
  }
  console.log(`\n${reports.length} bank(s), ${errs} error(s), ${warns} warning(s)`);
  if (errs > 0) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
