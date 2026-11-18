import { test, expect } from '@playwright/test';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';

test('Havensum opens the legacy ledger and preserves its merge baseline across reload', async ({ page }) => {
  const state = createFinancialState({ transactions: [createTransaction({ title: 'Existing household purchase' })] });
  await page.clock.install({ time: new Date('2026-11-17T12:00:00') });
  await page.addInitScript(initialState => {
    if (!localStorage.getItem('melo-state-v1')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(initialState));
      localStorage.setItem('melo-sync-base', JSON.stringify(initialState));
    }
  }, state);
  await page.goto('/');
  await expect(page).toHaveTitle('Havensum · Overview');
  await expect(page.getByRole('img', { name: 'Havensum', exact: true })).toBeVisible();
  await expect(page.getByLabel('View Existing household purchase', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('View Existing household purchase', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => ({
    ledger: JSON.parse(localStorage.getItem('melo-state-v1')),
    baseline: JSON.parse(localStorage.getItem('melo-sync-base'))
  }));
  expect(saved.ledger).toEqual(state);
  expect(saved.baseline).toEqual(state);
});
