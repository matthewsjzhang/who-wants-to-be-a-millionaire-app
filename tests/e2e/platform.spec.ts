import { test, expect } from '@playwright/test';
import { answer, bankQuestions, fastSettings, startDevGame, waitAnswers } from './helpers';

const qs = bankQuestions('ep-001');

test.beforeEach(async ({ page }) => {
  await fastSettings(page);
});

test('resume a saved game after reload', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.locator('.bank-card[data-bank-id="ep-001"] .btn-primary').click();
  await page.click('#setup-start');
  await page.click('[data-act=start]');
  await waitAnswers(page);
  const qText = await page.locator('.hex-question .question-text').innerText();
  await answer(page, qs[0]!.correct);
  await page.waitForSelector('.banner [data-act]');
  await page.click('.banner [data-act]');
  await waitAnswers(page);
  await expect(page.locator('.rung[aria-current]')).toContainText('$200');
  const q2 = await page.locator('.hex-question .question-text').innerText();
  expect(q2).not.toBe(qText);

  await page.reload();
  await expect(page.locator('#resume-btn')).toBeVisible();
  await page.click('#resume-btn');
  await waitAnswers(page);
  await expect(page.locator('.hex-question .question-text')).toHaveText(q2);
  await expect(page.locator('.rung[aria-current]')).toContainText('$200');
});

test('discarding the saved game removes the resume banner', async ({ page }) => {
  await startDevGame(page);
  await answer(page, qs[0]!.correct);
  await page.waitForSelector('.banner [data-act]');
  await page.goto('/');
  await page.reload();
  await expect(page.locator('#resume-btn')).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.click('#discard-btn');
  await expect(page.locator('#resume-btn')).toHaveCount(0);
});

test('keyboard-only: start, answer, 50:50, ladder, walk away', async ({ page }) => {
  await page.goto('/?seed=1&bank=ep-001#/game');
  await expect(page.locator('[data-act=start]')).toBeVisible();
  await page.keyboard.press('Enter');
  await waitAnswers(page);
  const q1 = qs[0]!;
  await page.keyboard.press('f');
  await page.keyboard.press('Enter');
  await expect(page.locator('.hex-answer[data-state=eliminated]')).toHaveCount(2);
  await expect(page.locator('[data-act=lifeline-done]')).toHaveCount(0);
  await waitAnswers(page);
  await page.keyboard.press('abcd'[q1.correct]!);
  await expect(page.locator('[role=dialog]')).toContainText('Final answer');
  await page.keyboard.press('Escape');
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  await page.keyboard.press('abcd'[q1.correct]!);
  await page.keyboard.press('Enter');
  await expect(page.locator('.banner-slot')).toContainText('Correct');
  await page.keyboard.press('Enter');
  await waitAnswers(page);
  await expect(page.locator('.rung[aria-current]')).toContainText('$200');
  await page.keyboard.press('w');
  await expect(page.locator('[role=dialog]')).toContainText('$100');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-act=results]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/results/);
  await expect(page.getByTestId('winnings')).toHaveText('$100');
});

test('mobile viewport: ladder opens as a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await startDevGame(page);
  const toggle = page.locator('.ladder-toggle');
  await expect(toggle).toBeVisible();
  await expect(page.locator('#game-ladder')).not.toBeInViewport();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#game-ladder')).toBeInViewport();
  await expect(page.locator('#game-ladder .rung[aria-current]')).toContainText('$100');
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(noOverflow).toBe(true);
});

test('clock mode: running out of time ends the game', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.locator('.bank-card[data-bank-id="ep-001"] .btn-primary').click();
  await page.locator('#timer-custom').check();
  await page.fill('#setup-seconds', '5');
  await page.click('#setup-start');
  await page.click('[data-act=start]');
  await waitAnswers(page);
  await expect(page.locator('.timer-ring, [class*=timer]').first()).toBeVisible();
  await expect(page.locator('.banner-slot')).toContainText(/time/i, { timeout: 15000 });
  await page.click('.banner [data-act]');
  await expect(page).toHaveURL(/#\/results/);
  await expect(page.getByTestId('winnings')).toHaveText('$0');
});

test('play again from results starts a fresh game; menu button returns', async ({ page }) => {
  await startDevGame(page);
  await answer(page, qs[0]!.correct);
  await page.waitForSelector('.banner [data-act]');
  await page.click('.banner [data-act]');
  await waitAnswers(page);
  await page.click('.walk-btn');
  await page.locator('[role=dialog] .btn--primary').click();
  await page.waitForSelector('.banner [data-act]');
  await page.click('.banner [data-act]');
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('[data-act=start]')).toBeVisible();
  await expect(page.locator('.rung[aria-current]')).toContainText('$100');
});

test('works offline after the first load', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // let the service worker take control
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.bank-card')).toHaveCount(55);
  await page.locator('.bank-card[data-bank-id="ep-001"] .btn-primary').click();
  await page.click('#setup-start');
  await page.click('[data-act=start]');
  await waitAnswers(page);
  await expect(page.locator('.hex-answer')).toHaveCount(4);
  await context.setOffline(false);
});
