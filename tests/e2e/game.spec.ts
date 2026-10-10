import { test, expect, type Page } from '@playwright/test';
import { answer, answerCorrectly, bankQuestions, fastSettings, startDevGame, waitAnswers, wrongIndex } from './helpers';

const qs = bankQuestions('ep-001');

test.beforeEach(async ({ page }) => {
  await fastSettings(page);
});

async function seeResults(page: Page): Promise<string> {
  await page.click('.banner [data-act]');
  await expect(page).toHaveURL(/#\/results/);
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
  return page.innerText('#app');
}

test('full win: 15 correct answers pay $1,000,000', async ({ page }) => {
  await startDevGame(page);
  await answerCorrectly(page, qs, 0, 14);
  await expect(page.locator('.rung[aria-current]')).toContainText('Millionaire');
  await answer(page, qs[14]!.correct);
  await page.waitForSelector('.banner [data-act]');
  await expect(page.locator('.banner-slot')).toContainText('1,000,000');
  await page.click('.banner [data-act]');
  await expect(page.locator('.banner-slot')).toContainText(/millionaire|won|congratulations/i);
  await seeResults(page);
  expect(await page.getByTestId('winnings').innerText()).toBe('$1,000,000');
});

test('ladder updates and safe haven milestone shows', async ({ page }) => {
  await startDevGame(page);
  await expect(page.locator('.rung[aria-current]')).toContainText('$100');
  await answerCorrectly(page, qs, 0, 4);
  await answer(page, qs[4]!.correct);
  await expect(page.locator('.banner-slot')).toContainText(/Correct/);
  await page.click('.banner [data-act]');
  await expect(page.locator('.banner-slot')).toContainText(/safe haven/i);
  await expect(page.locator('.info-safe')).toContainText('$1,000');
  await page.click('.banner [data-act]');
  await waitAnswers(page);
  await expect(page.locator('.rung[aria-current]')).toContainText('$2,000');
  await expect(page.locator('.info-safe')).toContainText('$1,000');
});

test('cancelling the final answer modal lets you pick again', async ({ page }) => {
  await startDevGame(page);
  await page.click('.hex-answer[data-index="0"]');
  await page.click('[role=dialog] [data-value=cancel]');
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  await answer(page, qs[0]!.correct);
  await expect(page.locator('.banner-slot')).toContainText('Correct');
});

for (const [q, expected] of [
  [2, '$0'],
  [6, '$1,000'],
  [11, '$32,000'],
] as const) {
  test(`wrong answer at Q${q + 1} pays ${expected}`, async ({ page }) => {
    await startDevGame(page);
    await answerCorrectly(page, qs, 0, q);
    await answer(page, wrongIndex(qs[q]!));
    await page.waitForSelector('.banner [data-act]');
    await expect(page.locator('.hex-answer[data-state=correct]')).toHaveCount(1);
    const text = await seeResults(page);
    expect(await page.getByTestId('winnings').innerText()).toBe(expected);
    expect(text).toContain(`${q + 1} of 15`);
  });
}

test('walk away at Q12 keeps $64,000', async ({ page }) => {
  await startDevGame(page);
  await answerCorrectly(page, qs, 0, 11);
  await waitAnswers(page);
  await page.click('.walk-btn');
  await expect(page.locator('[role=dialog]')).toContainText('$64,000');
  await page.click('[role=dialog] [data-value=cancel]');
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  await page.click('.walk-btn');
  await page.locator('[role=dialog] .btn--primary').click();
  await page.waitForSelector('.banner [data-act]');
  await seeResults(page);
  expect(await page.getByTestId('winnings').innerText()).toBe('$64,000');
});

test('lifelines: 50:50, phone a friend, ask the audience', async ({ page }) => {
  await startDevGame(page);
  const q = qs[0]!;
  await page.click('[data-id=fifty-fifty]');
  await page.click('[data-act=lifeline-done]');
  await expect(page.locator('.hex-answer[data-state=eliminated]')).toHaveCount(2);
  await expect(page.locator(`.hex-answer[data-index="${q.correct}"]`)).not.toHaveAttribute('data-state', 'eliminated');
  await expect(page.locator('[data-id=fifty-fifty]')).toBeDisabled();

  await page.click('[data-id=phone-a-friend]');
  await expect(page.locator('.effect-panel-slot')).not.toBeEmpty();
  await page.click('[data-act=lifeline-done]');
  await expect(page.locator('[data-id=phone-a-friend]')).toBeDisabled();

  await page.click('[data-id=ask-the-audience]');
  await expect(page.locator('.effect-panel-slot')).toContainText('%');
  await page.click('[data-act=lifeline-done]');
  await expect(page.locator('[data-id=ask-the-audience]')).toBeDisabled();
  await answer(page, q.correct);
  await expect(page.locator('.banner-slot')).toContainText('Correct');
});

async function startFromSetup(page: Page, ids: string[]): Promise<void> {
  await page.goto('/?seed=1');
  await page.locator('.bank-card[data-bank-id="ep-001"] .btn-primary').click();
  for (const id of ids) await page.locator(`#ll-${id}`).check();
  await page.click('#setup-start');
  await page.click('[data-act=start]');
  await waitAnswers(page);
}

test('double dip gives a second chance after a wrong answer', async ({ page }) => {
  await startFromSetup(page, ['double-dip']);
  await page.click('[data-id=double-dip]');
  await page.click('[data-act=lifeline-done]');
  const q = qs[0]!;
  await answer(page, wrongIndex(q));
  await expect(page.locator('.banner-slot')).toContainText('second chance');
  await expect(page.locator('.hex-answer[data-state=correct]')).toHaveCount(0); // answer not revealed yet
  await page.click('.banner [data-act]');
  await expect(page.locator('.hex-answer[data-state=eliminated]')).toHaveCount(1);
  await expect(page).not.toHaveURL(/results/);
  await waitAnswers(page);
  await answer(page, q.correct);
  await expect(page.locator('.banner-slot')).toContainText('Correct');
});

test('switch the question replaces the question once it unlocks (Q11)', async ({ page }) => {
  await startFromSetup(page, ['switch-the-question']);
  await expect(page.locator('[data-id=switch-the-question]')).toBeDisabled();
  await answerCorrectly(page, qs, 0, 10);
  await waitAnswers(page);
  const before = await page.locator('.hex-question .question-text').innerText();
  await page.click('[data-id=switch-the-question]');
  await expect(page.locator('.hex-question .question-text')).not.toHaveText(before);
  if (await page.locator('[data-act=lifeline-done]').count()) await page.click('[data-act=lifeline-done]');
  await waitAnswers(page);
  await expect(page.locator('.hex-question .question-text')).not.toHaveText(before);
  await expect(page.locator('[data-id=switch-the-question]')).toBeDisabled();
});
