import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeText, validateBank, validateCustomGame } from '../../../src/data/schema';

const fx = resolve(__dirname, '../../fixtures');
const read = (p: string) => JSON.parse(readFileSync(resolve(fx, p), 'utf8'));

describe('normalizeText', () => {
  it('lowercases, strips accents/punctuation and collapses whitespace', () => {
    expect(normalizeText('  Café,  Au   LAIT! ')).toBe('cafe au lait');
  });
});

describe('validateBank', () => {
  it.each(readdirSync(resolve(fx, 'valid')))('accepts valid fixture %s', (f) => {
    const r = validateBank(read(`valid/${f}`));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  const expected: Record<string, RegExp> = {
    'bad-schema-version': /schemaVersion/,
    'bad-date': /ISO date/,
    'too-few-questions': /exactly 15/,
    'too-few-spares': /at least 3 spares/,
    'wrong-answer-count': /exactly 4/,
    'empty-answer': /answer 1 is empty/,
    'untrimmed-answer': /whitespace/,
    'duplicate-answers': /duplicate answer/,
    'bad-correct': /correct must be/,
    'decreasing-difficulty': /decreases/,
    'out-of-band-difficulty': /tier band/,
    'duplicate-question-id': /duplicate question id/,
    'duplicate-question-text': /duplicate question text/,
    'transcribed-no-sources': /sources/,
  };
  it.each(Object.entries(expected))('rejects %s', (name, re) => {
    const r = validateBank(read(`invalid/${name}.json`));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => re.test(e))).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(validateBank(null).ok).toBe(false);
    expect(validateBank('x').ok).toBe(false);
  });

  it('emits warnings without errors for the warnings fixture', () => {
    const r = validateBank(read('warnings/ep-920.json'));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    const all = r.warnings.join('\n');
    expect(all).toMatch(/missing explanation/);
    expect(all).toMatch(/longer than 200/);
    expect(all).toMatch(/longer than 60/);
    expect(all).toMatch(/appears inside the question/);
    expect(all).toMatch(/correct-index skew/);
  });
});

describe('validateCustomGame', () => {
  const game = () => read('custom-game-valid.json');
  it('accepts a valid game', () => {
    const r = validateCustomGame(game());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('rejects mismatched question count', () => {
    const g = game();
    g.questions.pop();
    expect(validateCustomGame(g).ok).toBe(false);
  });
  it('rejects non-increasing prizes and bad safe havens', () => {
    const g = game();
    g.ladder.prizes = [100, 100, 300];
    g.ladder.safeHavens = [5];
    const r = validateCustomGame(g);
    expect(r.errors.some((e) => /strictly increasing/.test(e))).toBe(true);
    expect(r.errors.some((e) => /safeHavens/.test(e))).toBe(true);
  });
  it('rejects bad timer', () => {
    const g = game();
    g.timer = { mode: 'clock', secondsPerQuestion: [30], bankUnusedToLast: false, onTimeout: 'lose' };
    expect(validateCustomGame(g).errors.some((e) => /secondsPerQuestion/.test(e))).toBe(true);
  });
  it('rejects bad question and non-object', () => {
    const g = game();
    g.questions[0].correct = 9;
    expect(validateCustomGame(g).ok).toBe(false);
    expect(validateCustomGame(undefined).ok).toBe(false);
  });
});
