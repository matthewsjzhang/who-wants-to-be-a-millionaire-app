import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export interface BankQ {
  text: string;
  answers: string[];
  correct: number;
}

export function bankQuestions(id = 'ep-001'): BankQ[] {
  const raw = readFileSync(join(process.cwd(), 'src', 'data', 'banks', `${id}.json`), 'utf8');
  return JSON.parse(raw).questions as BankQ[];
}

/** Make reveals fast: reduced motion + no suspense delay. Call before navigation. */
export async function fastSettings(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript((e) => {
    try {
      if (!sessionStorage.getItem('e2e-init')) {
        sessionStorage.setItem('e2e-init', '1');
        localStorage.setItem(
          'mq:v1:settings',
          JSON.stringify({ reducedMotion: 'on', revealDelayMs: 0, shuffleAnswers: false, ...e }),
        );
      }
    } catch {
      /* ignore */
    }
  }, extra);
}

/** Start the dev game (classic ladder, 50:50 / phone / audience, no shuffle). */
export async function startDevGame(page: Page, bank = 'ep-001'): Promise<void> {
  await page.goto(`/?seed=1&bank=${bank}#/game`);
  await page.click('[data-act=start]');
  await waitAnswers(page);
}

export async function waitAnswers(page: Page): Promise<void> {
  await page.waitForSelector('.hex-answer:not(.hex--pending):not([aria-disabled=true])');
}

/** Pick an answer, confirm it, and wait for the result banner (correct / wrong). */
export async function answer(page: Page, index: number): Promise<void> {
  await waitAnswers(page);
  await page.click(`.hex-answer[data-index="${index}"]`);
  await page.click('[data-value=final]');
}

export async function answerCorrectly(page: Page, qs: BankQ[], from: number, to: number): Promise<void> {
  for (let i = from; i < to; i++) {
    await answer(page, qs[i]!.correct);
    await page.waitForSelector('.banner [data-act]', { timeout: 10000 });
    await page.click('.banner [data-act]');
    await page.waitForSelector('.banner--milestone, .hex-answer:not(.hex--pending):not([aria-disabled=true])');
    if (await page.locator('.banner--milestone').count()) await page.click('.banner [data-act]');
  }
}

export const wrongIndex = (q: BankQ): number => (q.correct + 1) % 4;
