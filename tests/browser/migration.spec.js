import { test, expect } from '@playwright/test';
import { createFinancialState, createTransaction, expectedMigratedLedger } from '../helpers/financialFixtures.js';
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

test('the latest invalid merge baseline is downloadable after a new baseline is saved', async ({ page }) => {
  const damagedBaseline = '{newly damaged synthetic baseline\n';
  const olderBytes = '{older synthetic baseline';
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(({ ledger, damaged, older }) => {
    localStorage.setItem('melo-state-v1', JSON.stringify(ledger));
    localStorage.setItem('melo-sync-base', damaged);
    localStorage.setItem('melo-sync-base:recovery:invalid', older);
  }, { ledger: createFinancialState({ version: 2 }), damaged: damagedBaseline, older: olderBytes });
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export shared baseline', exact: true }).click();
  await exported;
  await expect.poll(() => page.evaluate(() => localStorage.getItem('melo-sync-base:recovery:invalid:1')))
    .toBe(damagedBaseline);
  const recoveryButton = page.getByRole('button', { name: 'Download invalid baseline copy', exact: true });
  await expect(recoveryButton).toBeVisible({ timeout: 2500 });
  const recovery = page.waitForEvent('download');
  await recoveryButton.click();
  expect(await readFile(await (await recovery).path(), 'utf8')).toBe(damagedBaseline);
  expect(await page.evaluate(() => localStorage.getItem('melo-sync-base:recovery:invalid'))).toBe(olderBytes);
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
  expect(stored.state).toEqual(expectedMigratedLedger(state));
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
  expect(backup.version).toBe(4);
  expect(backup.plans['2026']).toHaveLength(1);
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

test('backup review lets the owner rename and categorize rows with deleted categories or keep them uncategorized', async ({ page }) => {
  const state = createFinancialState({ version: 2 });
  const first = createTransaction({ id: 'first', title: 'Old supermarket', category: 'retired-groceries', amount: 4200 });
  const second = createTransaction({ id: 'second', title: 'Old snack', category: 'retired-food', amount: 300 });
  await page.addInitScript(initialState => {
    localStorage.setItem('melo-state-v1', JSON.stringify(initialState));
    localStorage.setItem('melo-sync-base', JSON.stringify(initialState));
  }, state);
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Review backup merge', exact: true }).click();
  await (await choosingFile).setFiles({
    name: 'synthetic-retired-categories.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...state, version: 1, transactions: [first, second] }))
  });

  const review = page.getByRole('dialog');
  await expect(review.getByText('Missing categories', { exact: true })).toBeVisible();
  await expect(review.getByText('Missing category · retired-groceries', { exact: true })).toBeVisible();
  await review.getByLabel('Name for Old supermarket', { exact: true }).fill('Supermarket');
  await review.getByLabel('Category for Old supermarket', { exact: true }).selectOption({ label: 'Groceries' });
  await expect(review.getByText('Missing category · retired-food', { exact: true })).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')));
  expect(before.transactions).toEqual([]);
  await review.getByRole('button', { name: 'Apply reviewed merge', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions)).toEqual([
    { ...first, title: 'Supermarket', category: 'groceries' },
    { ...second, category: null }
  ]);
});

test('a saved legacy ledger with a missing category opens for review and preserves its exact original', async ({ page }) => {
  const transaction = createTransaction({ title: 'Old supermarket', category: 'retired-groceries', amount: 4200 });
  const originalBytes = JSON.stringify(createFinancialState({ version: 1, transactions: [transaction] }), null, 2);
  await page.addInitScript(encodedState => {
    if (localStorage.getItem('melo-state-v1') === null) {
      localStorage.setItem('melo-state-v1', encodedState);
    }
  }, originalBytes);
  await page.goto('/');
  const review = page.getByRole('dialog');
  await expect(review.getByText('Missing category · retired-groceries', { exact: true })).toBeVisible();
  await page.reload();
  await expect(review.getByText('Missing category · retired-groceries', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Accept reviewed categories', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).migrationCategoryWarnings ?? null))
    .toBeNull();
  const stored = await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('melo-state-v1')),
    recovery: localStorage.getItem('melo-state-v1:recovery:v1')
  }));
  expect(stored.state.transactions).toEqual([{ ...transaction, category: null }]);
  expect(stored.recovery).toBe(originalBytes);
});

test('keeping a locally edited category during backup review preserves its existing assignment', async ({ page }) => {
  const transaction = createTransaction({ amount: 4200 });
  const baseline = createFinancialState({ transactions: [transaction] });
  const localState = { ...baseline, categories: baseline.categories.map(category =>
    category.id === 'groceries' ? { ...category, name: 'Food shopping' } : category) };
  const remoteState = { ...baseline, categories: baseline.categories.filter(category => category.id !== 'groceries') };
  await page.addInitScript(({ local, base }) => {
    localStorage.setItem('melo-state-v1', JSON.stringify(local));
    localStorage.setItem('melo-sync-base', JSON.stringify(base));
  }, { local: localState, base: baseline });
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Review backup merge', exact: true }).click();
  await (await choosingFile).setFiles({
    name: 'synthetic-deleted-category.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(remoteState))
  });

  const review = page.getByRole('dialog');
  await review.getByText('THIS DEVICE', { exact: true }).click();
  await expect(review.getByText('Missing categories', { exact: true })).toHaveCount(0);
  await review.getByRole('button', { name: 'Apply reviewed merge', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('melo-sync-base')).transactions))
    .toEqual([transaction]);
});
