// WP3: runtime validation for question banks and custom games.
import type { ValidationResult } from '../core/types';

export function normalizeText(s: string): string {
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EDITIONS = ['US', 'UK', 'AU', 'INT'];
const PROVENANCES = ['episode-style', 'transcribed'];
const CURRENCIES = ['$', '£', '€', 'pts'];

export function isIsoDate(s: unknown): boolean {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Expected difficulty band for the question at 0-based index in a 15-question bank. */
export function tierBand(i: number): [number, number] {
  if (i < 5) return [1, 2];
  if (i < 10) return [3, 3];
  if (i < 13) return [4, 4];
  return [5, 5];
}

export function tokenSet(s: string): Set<string> {
  return new Set(normalizeText(s).split(' ').filter(Boolean));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function checkQuestion(
  q: unknown,
  where: string,
  errors: string[],
  warnings: string[],
  tier?: [number, number],
): void {
  if (!isObj(q)) {
    errors.push(`${where}: not an object`);
    return;
  }
  if (typeof q.id !== 'string' || !q.id.trim()) errors.push(`${where}: missing id`);
  if (typeof q.text !== 'string' || !q.text.trim()) errors.push(`${where}: empty question text`);
  else {
    if (q.text !== q.text.trim()) errors.push(`${where}: question text has leading/trailing whitespace`);
    if (q.text.length > 200) warnings.push(`${where}: question text longer than 200 chars`);
  }
  const answers = q.answers;
  if (!Array.isArray(answers) || answers.length !== 4) {
    errors.push(`${where}: answers must be an array of exactly 4`);
  } else {
    const seen = new Set<string>();
    answers.forEach((a, i) => {
      if (typeof a !== 'string' || !a.trim()) {
        errors.push(`${where}: answer ${i} is empty`);
        return;
      }
      if (a !== a.trim()) errors.push(`${where}: answer ${i} has leading/trailing whitespace`);
      if (a.length > 60) warnings.push(`${where}: answer ${i} longer than 60 chars`);
      const n = normalizeText(a);
      if (seen.has(n)) errors.push(`${where}: duplicate answer "${a}"`);
      seen.add(n);
    });
  }
  const c = q.correct;
  if (!(typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= 3)) {
    errors.push(`${where}: correct must be an integer 0-3`);
  }
  const d = q.difficulty;
  if (!(typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 5)) {
    errors.push(`${where}: difficulty must be an integer 1-5`);
  } else if (tier && (d < tier[0] || d > tier[1])) {
    errors.push(`${where}: difficulty ${d} outside tier band ${tier[0]}-${tier[1]}`);
  }
  if (typeof q.explanation !== 'string' || !q.explanation.trim()) warnings.push(`${where}: missing explanation`);
  if (typeof q.text === 'string' && Array.isArray(answers) && answers.length === 4) {
    const nt = ' ' + normalizeText(q.text) + ' ';
    answers.forEach((a, i) => {
      if (typeof a !== 'string') return;
      const na = normalizeText(a);
      if (na.length >= 3 && nt.includes(' ' + na + ' ')) {
        warnings.push(`${where}: answer ${i} "${a}" appears inside the question text`);
      }
    });
  }
}

function checkQuestionList(
  list: unknown,
  label: string,
  errors: string[],
  warnings: string[],
  tiered: boolean,
): unknown[] {
  if (!Array.isArray(list)) return [];
  let prev = 0;
  list.forEach((q, i) => {
    checkQuestion(q, `${label}[${i}]`, errors, warnings, tiered ? tierBand(i) : undefined);
    if (tiered && isObj(q) && typeof q.difficulty === 'number') {
      if (q.difficulty < prev) errors.push(`${label}[${i}]: difficulty decreases (${prev} -> ${q.difficulty})`);
      prev = Math.max(prev, q.difficulty);
    }
  });
  return list;
}

function checkDuplicates(lists: Array<[string, unknown[]]>, errors: string[]): void {
  const ids = new Map<string, string>();
  const texts = new Map<string, string>();
  for (const [label, list] of lists) {
    list.forEach((q, i) => {
      if (!isObj(q)) return;
      const where = `${label}[${i}]`;
      if (typeof q.id === 'string' && q.id) {
        const prev = ids.get(q.id);
        if (prev) errors.push(`${where}: duplicate question id "${q.id}" (also ${prev})`);
        else ids.set(q.id, where);
      }
      if (typeof q.text === 'string' && q.text.trim()) {
        const n = normalizeText(q.text);
        const prev = texts.get(n);
        if (prev) errors.push(`${where}: duplicate question text (also ${prev})`);
        else texts.set(n, where);
      }
    });
  }
}

function result(errors: string[], warnings: string[]): ValidationResult {
  return { ok: errors.length === 0, errors, warnings };
}

export function validateBank(b: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(b)) return result(['bank is not an object'], warnings);
  if (b.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (typeof b.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(b.id)) errors.push('id must be a lowercase slug');
  if (typeof b.name !== 'string' || !b.name.trim()) errors.push('name is required');
  if (typeof b.episode !== 'number' || !Number.isInteger(b.episode) || b.episode < 0) {
    errors.push('episode must be a non-negative integer');
  }
  if (!isIsoDate(b.date)) errors.push('date must be an ISO date YYYY-MM-DD');
  if (!EDITIONS.includes(b.edition as string)) errors.push(`edition must be one of ${EDITIONS.join(', ')}`);
  if (!PROVENANCES.includes(b.provenance as string)) {
    errors.push(`provenance must be one of ${PROVENANCES.join(', ')}`);
  }
  if (b.provenance === 'transcribed' && !(Array.isArray(b.sources) && b.sources.length > 0)) {
    errors.push('transcribed banks require non-empty sources');
  }
  if (b.sources !== undefined && !(Array.isArray(b.sources) && b.sources.every((s) => typeof s === 'string'))) {
    errors.push('sources must be an array of strings');
  }
  if (b.tags !== undefined && !(Array.isArray(b.tags) && b.tags.every((s) => typeof s === 'string'))) {
    errors.push('tags must be an array of strings');
  }
  if (!Array.isArray(b.questions)) errors.push('questions must be an array');
  else if (b.questions.length !== 15) errors.push(`expected exactly 15 questions, found ${b.questions.length}`);
  if (!Array.isArray(b.spares)) errors.push('spares must be an array');
  else if (b.spares.length < 3) errors.push(`expected at least 3 spares, found ${b.spares.length}`);

  const qs = checkQuestionList(b.questions, 'questions', errors, warnings, true);
  const sp = checkQuestionList(b.spares, 'spares', errors, warnings, false);
  checkDuplicates([
    ['questions', qs],
    ['spares', sp],
  ], errors);

  if (qs.length >= 5) {
    const counts = [0, 0, 0, 0];
    let n = 0;
    for (const q of qs) {
      if (isObj(q) && typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3) {
        counts[q.correct]++;
        n++;
      }
    }
    counts.forEach((c, i) => {
      if (n > 0 && c / n > 0.4) {
        warnings.push(`correct-index skew: answer ${i} is correct in ${c}/${n} questions (>40%)`);
      }
    });
  }
  return result(errors, warnings);
}

function checkTimer(t: unknown, ladderLen: number, errors: string[]): void {
  if (!isObj(t)) {
    errors.push('timer must be an object');
    return;
  }
  if (t.mode === 'off') return;
  if (t.mode !== 'clock') {
    errors.push('timer.mode must be "off" or "clock"');
    return;
  }
  const s = t.secondsPerQuestion;
  if (!Array.isArray(s) || !s.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) {
    errors.push('timer.secondsPerQuestion must be an array of positive numbers');
  } else if (ladderLen > 0 && s.length !== ladderLen) {
    errors.push(`timer.secondsPerQuestion length ${s.length} != ladder length ${ladderLen}`);
  }
  if (typeof t.bankUnusedToLast !== 'boolean') errors.push('timer.bankUnusedToLast must be boolean');
  if (t.onTimeout !== 'walk' && t.onTimeout !== 'lose') errors.push('timer.onTimeout must be "walk" or "lose"');
}

export function validateCustomGame(g: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(g)) return result(['custom game is not an object'], warnings);
  if (typeof g.id !== 'string' || !g.id.trim()) errors.push('id is required');
  if (typeof g.name !== 'string' || !g.name.trim()) errors.push('name is required');
  for (const k of ['createdAt', 'updatedAt'] as const) {
    if (typeof g[k] !== 'string' || Number.isNaN(Date.parse(g[k] as string))) {
      errors.push(`${k} must be an ISO timestamp`);
    }
  }
  let ladderLen = 0;
  const l = g.ladder;
  if (!isObj(l)) errors.push('ladder is required');
  else {
    if (typeof l.id !== 'string' || !l.id) errors.push('ladder.id is required');
    if (typeof l.name !== 'string' || !l.name) errors.push('ladder.name is required');
    if (!CURRENCIES.includes(l.currency as string)) errors.push('ladder.currency invalid');
    const p = l.prizes;
    if (!Array.isArray(p) || p.length < 1 || p.length > 20) errors.push('ladder.prizes must have 1..20 entries');
    else {
      ladderLen = p.length;
      if (!p.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)) {
        errors.push('ladder.prizes must be non-negative numbers');
      } else {
        for (let i = 1; i < p.length; i++) {
          if (p[i] <= p[i - 1]) {
            errors.push('ladder.prizes must be strictly increasing');
            break;
          }
        }
      }
    }
    const sh = l.safeHavens;
    if (!Array.isArray(sh)) errors.push('ladder.safeHavens must be an array');
    else if (!sh.every((x) => Number.isInteger(x) && x >= 0 && (ladderLen === 0 || x < ladderLen))) {
      errors.push('ladder.safeHavens must be valid 0-based indices within the ladder');
    }
  }
  if (!Array.isArray(g.questions)) errors.push('questions must be an array');
  else if (ladderLen > 0 && g.questions.length !== ladderLen) {
    errors.push(`questions length ${g.questions.length} != ladder length ${ladderLen}`);
  }
  if (!Array.isArray(g.spares)) errors.push('spares must be an array');
  const qs = checkQuestionList(g.questions, 'questions', errors, warnings, false);
  const sp = checkQuestionList(g.spares, 'spares', errors, warnings, false);
  checkDuplicates([
    ['questions', qs],
    ['spares', sp],
  ], errors);
  if (!Array.isArray(g.lifelineIds) || !g.lifelineIds.every((x) => typeof x === 'string')) {
    errors.push('lifelineIds must be an array of strings');
  }
  checkTimer(g.timer, ladderLen, errors);
  return result(errors, warnings);
}
