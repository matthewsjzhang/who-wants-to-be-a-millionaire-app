import { test, expect } from '@playwright/test';
import { fastSettings } from './helpers';

test.beforeEach(async ({ page }) => {
  await fastSettings(page);
});

test('menu shows custom games above a 55-set library sorted by episode', async ({ page }) => {
  await page.goto('/');
  const headings = await page.locator('#app h2').allInnerTexts();
  expect(headings.indexOf('Your Custom Games')).toBeGreaterThanOrEqual(0);
  expect(headings.indexOf('Your Custom Games')).toBeLessThan(headings.indexOf('Question Library'));
  const above = await page.evaluate(() => {
    const a = document.querySelector('[aria-labelledby="custom-h"]')!.getBoundingClientRect();
    const b = document.querySelector('[aria-labelledby="lib-h"]')!.getBoundingClientRect();
    return a.bottom <= b.top;
  });
  expect(above).toBe(true);
  await expect(page.locator('.bank-card')).toHaveCount(55);
  const eps = await page.locator('.bank-card .ep').allInnerTexts();
  const nums = eps.map((e) => Number(e.replace('#', '')));
  expect(nums).toEqual([...nums].sort((a, b) => a - b));
  await expect(page.locator('.bank-card .badge').first()).toContainText('Episode-style set');
  await expect(page.locator('.disclaimer')).toContainText(/unofficial fan project/i);
});

test('search filters the library', async ({ page }) => {
  await page.goto('/');
  await page.fill('#lib-search', 'space');
  await expect(page.locator('.bank-card')).not.toHaveCount(55);
  expect(await page.locator('.bank-card').count()).toBeGreaterThan(0);
  await expect(page.locator('.bank-card').first()).toContainText(/space/i);
  await page.fill('#lib-search', 'zzzzqqq');
  await expect(page.locator('.bank-card')).toHaveCount(0);
  await expect(page.locator('.lib-list .empty')).toBeVisible();
});

test('selecting a set opens setup with default lifelines and starts a game', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.locator('.bank-card[data-bank-id="ep-001"] .btn-primary').click();
  await expect(page.locator('#setup-start')).toBeVisible();
  for (const id of ['fifty-fifty', 'phone-a-friend', 'ask-the-audience']) {
    await expect(page.locator(`#ll-${id}`)).toBeChecked();
  }
  await expect(page.locator('#ll-switch-the-question')).not.toBeChecked();
  await expect(page.locator('#ll-double-dip')).not.toBeChecked();
  await page.locator('#ll-switch-the-question').check();
  await page.click('#setup-start');
  await page.click('[data-act=start]');
  await expect(page.locator('.lifeline')).toHaveCount(4);
  await expect(page.locator('.hex-answer')).toHaveCount(4);
});
