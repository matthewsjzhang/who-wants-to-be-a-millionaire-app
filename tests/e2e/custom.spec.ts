import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fastSettings, waitAnswers } from './helpers';

test.beforeEach(async ({ page }) => {
  await fastSettings(page);
});

async function fillEditorQuestions(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('.ed-toggle').forEach((t) => {
      if (t.getAttribute('aria-expanded') !== 'true') t.click();
    });
  });
  await page.evaluate(() => {
    const type = (el: Element, v: string): void => {
      (el as HTMLInputElement).value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    document.querySelectorAll('textarea[id$="-text"]').forEach((ta, i) => type(ta, `Custom question number ${i + 1}?`));
    Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"]'))
      .filter((inp) => /-a[0-3]$/.test(inp.id))
      .forEach((inp, i) => type(inp, `Custom answer ${Math.floor(i / 4) + 1}-${(i % 4) + 1}`));
  });
}

test('create a custom game with a custom lifeline, play it, export, delete and re-import', async ({ page }) => {
  await page.goto('/?seed=3');
  await page.click('#new-custom');
  await page.fill('#game-name', 'E2E Quiz');
  await fillEditorQuestions(page);

  // custom lifeline
  await page.getByRole('button', { name: 'New custom lifeline' }).click();
  const form = page.locator('#lifeline-form');
  await form.locator('input[id$="-name"]').fill('Mega Fifty');
  await form.locator('select[id$="-effect"]').selectOption('remove-wrong');
  await form.getByRole('button', { name: 'Save lifeline' }).click();
  await expect(page.locator('#lifelines-h').locator('xpath=..')).toContainText('Mega Fifty');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#ed-validation')).toContainText('Saved "E2E Quiz"');

  await page.getByRole('button', { name: 'Back to menu' }).click();
  const card = page.locator('.custom-card', { hasText: 'E2E Quiz' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('15 questions');

  // export
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
  const path = await download.path();
  const exported = JSON.parse(readFileSync(path!, 'utf8'));
  expect(exported.format).toBe('millionaire-custom');
  expect(exported.games).toHaveLength(1);
  expect(exported.games[0].name).toBe('E2E Quiz');
  expect(exported.lifelines.map((l: { name: string }) => l.name)).toContain('Mega Fifty');

  // delete (confirm dialog)
  page.once('dialog', (d) => void d.accept());
  await card.getByRole('button', { name: /^Delete/ }).click();
  await expect(page.locator('.custom-card')).toHaveCount(0);

  // import
  await page.setInputFiles('input[type=file]', {
    name: 'export.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.locator('.custom-card', { hasText: 'E2E Quiz' })).toBeVisible();

  // play it: custom lifeline shows up in setup and in the game
  await page.locator('.custom-card', { hasText: 'E2E Quiz' }).getByRole('button', { name: /^Play/ }).click();
  await expect(page.locator('#setup-start')).toBeVisible();
  await expect(page.getByLabel(/Mega Fifty/)).toBeChecked();
  await page.click('#setup-start');
  await page.click('[data-act=start]');
  await waitAnswers(page);
  await expect(page.locator('.hex-question')).toContainText(/Custom question number \d+\?/);
  await expect(page.locator('.lifeline')).toHaveCount(4);
  await page.locator('.lifeline', { hasText: 'Mega Fifty' }).click();
  await page.click('[data-act=lifeline-done]');
  await expect(page.locator('.hex-answer[data-state=eliminated]')).toHaveCount(2);
});

test('custom game cannot be saved while invalid', async ({ page }) => {
  await page.goto('/');
  await page.click('#new-custom');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#ed-validation')).toHaveClass(/ed-errors/);
  await expect(page).toHaveURL(/#\/editor/);
});
