import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';

const k_ledgerKey = 'melo-state-v1';

async function openSettings(page, ledger) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  if (ledger) {
    await page.addInitScript(({ key, value }) => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    }, { key: k_ledgerKey, value: ledger });
  }
  await page.goto('/');
  await openMoreSection(page, 'Settings');
}

test('the Drive row says sync is not set up yet and offers Open before Create, both disabled', async ({ page }) => {
  await openSettings(page, createFinancialState());
  const status = page.getByTestId('shared-file-status');
  await expect(status.getByText('Not connected', { exact: true })).toBeVisible();
  await expect(status.getByText(/Google Drive sync is not set up in this build yet/)).toBeVisible();
  const buttons = status.getByRole('button');
  await expect(buttons).toHaveText(['Open shared file', 'Create shared file']);
  await expect(status.getByRole('button', { name: 'Open shared file' })).toBeDisabled();
  await expect(status.getByRole('button', { name: 'Create shared file' })).toBeDisabled();
  await expect(status.getByText('Needs Google Drive setup in this build.')).toBeVisible();
});

test('with example data loaded, Create explains that the example data must be cleared first', async ({ page }) => {
  await openSettings(page, null);
  const status = page.getByTestId('shared-file-status');
  await expect(status.getByRole('button', { name: 'Create shared file' })).toBeDisabled();
  await expect(status.getByText(/Clear the example data first/)).toBeVisible();
});

test('the Drive row fits a narrow phone without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openSettings(page, createFinancialState());
  const status = page.getByTestId('shared-file-status');
  await expect(status).toBeVisible();
  const box = await status.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(320);
});
