import { test, expect } from '@playwright/test';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';
import { readFile } from 'node:fs/promises';

test('startup recovery downloads exact saved bytes when the ledger cannot be opened', async ({ page }) => {
  const originalBytes = '{synthetic invalid ledger';
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(bytes => localStorage.setItem('melo-state-v1', bytes), originalBytes);
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Download saved ledger copy', exact: true });
  await expect(button).toBeVisible();
  const download = page.waitForEvent('download');
  await button.click();
  expect(await readFile(await (await download).path(), 'utf8')).toBe(originalBytes);
});
test('legacy startup preserves the original ledger and links across repeated app loads', async ({ page }) => {
  const state = createFinancialState({ version: 1, transactions: [createTransaction()] });
  const originalBytes = JSON.stringify(state, null, 2);
  await page.clock.install({ time: new Date('2026-11-17T12:00:00') });
  await page.addInitScript(encodedState => {
    if (localStorage.getItem('melo-state-v1') === null) {
      localStorage.setItem('melo-state-v1', encodedState);
    }
  }, originalBytes);
  await page.goto('/');
  await expect(page.getByLabel('View Weekly shopping', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('View Weekly shopping', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('melo-state-v1')),
    recovery: localStorage.getItem('melo-state-v1:recovery:v1')
  }));
  expect(stored.state).toEqual({ ...state, version: 2 });
  expect(stored.recovery).toBe(originalBytes);
});

test('a blocked recovery write stops startup and Retry loading migrates the retained ledger', async ({ page }) => {
  const originalBytes = JSON.stringify(createFinancialState({ version: 1, transactions: [createTransaction()] }));
  await page.clock.install({ time: new Date('2026-11-17T12:00:00') });
  await page.addInitScript(encodedState => {
    localStorage.setItem('melo-state-v1', encodedState);
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.includes(':recovery:')) {
        throw new DOMException('Synthetic storage quota failure', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    };
    window.restoreSyntheticStorage = () => {
      Storage.prototype.setItem = setItem;
    };
  }, originalBytes);
  await page.goto('/');
  await expect(page.getByText('Device storage is unavailable', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Add expense', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('melo-state-v1'))).toBe(originalBytes);
  await page.evaluate(() => window.restoreSyntheticStorage());
  await page.getByRole('button', { name: 'Retry loading', exact: true }).click();
  await expect(page.getByLabel('View Weekly shopping', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('melo-state-v1:recovery:v1'))).toBe(originalBytes);
});

test('a newly initialized ledger exports the current schema version', async ({ page }) => {
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full JSON backup', exact: true }).click();
  const download = await downloading;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup.version).toBe(2);
});

test('backup review rejects future schemas before offering a merge', async ({ page }) => {
  const state = createFinancialState({ transactions: [createTransaction()] });
  await page.clock.install({ time: new Date('2026-11-17T12:00:00') });
  await page.addInitScript(initialState => {
    localStorage.setItem('melo-state-v1', JSON.stringify(initialState));
    localStorage.setItem('melo-sync-base', JSON.stringify(initialState));
  }, state);
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Review backup merge', exact: true }).click();
  const fileChooser = await choosingFile;
  await fileChooser.setFiles({
    name: 'synthetic-future-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...state, version: 99 }))
  });

  await expect(page.getByText('Invalid stored data: unsupported schema version.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply reviewed merge', exact: true })).toHaveCount(0);
});
