import { test, expect } from '../helpers/browserTest.js';
import { readFile } from 'node:fs/promises';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { openMoreSection, returnHome } from '../helpers/userFlows.js';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-17T12:00:00') });
  await page.addInitScript(state => {
    if (!localStorage.getItem('melo-state-v1')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(state));
    }
  }, createFinancialState({ transactions: [createTransaction({ title: 'Existing purchase' })] }));
  await page.goto('/');
  await expect(page.getByLabel('View Existing purchase', { exact: true })).toBeVisible();
  await openMoreSection(page, 'Settings');
});

test('edited CSV IDs need an explicit choice and applying keeps the pre-import recovery copy', async ({ page }) => {
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await (await choosingFile).setFiles({
    name: 'edited.csv', mimeType: 'text/csv',
    buffer: Buffer.from('id,title,amount,date,type,account,category\nweekly-shopping,Updated purchase,20.00,2026-11-10,expense,everyday,groceries\n')
  });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(dialog.getByText('1 edited', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Import transactions', exact: true })).toBeDisabled();
  await dialog.getByLabel('Row 1 decision', { exact: true }).selectOption('replace');
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('melo-state-v1')),
    recovery: JSON.parse(localStorage.getItem('havensum-import-recovery-v1'))
  }));
  expect(saved.state.transactions).toHaveLength(1);
  expect(saved.state.transactions[0]).toMatchObject({ id: 'weekly-shopping', title: 'Updated purchase', amount: 2000 });
  expect(saved.recovery.transactions[0]).toMatchObject({ title: 'Existing purchase', amount: 1234 });
  const recoveryButton = page.getByRole('button', { name: 'Download pre-import backup', exact: true });
  await expect(recoveryButton).toBeVisible();
  const downloadingRecovery = page.waitForEvent('download');
  await recoveryButton.click();
  const downloadedRecovery = await downloadingRecovery;
  expect(JSON.parse(await readFile(await downloadedRecovery.path(), 'utf8')).transactions[0].amount).toBe(1234);
});

test('CSV and a blank quick-entry template download without changing the ledger', async ({ page }) => {
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export transactions CSV', exact: true }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toBe('Havensum-transactions-2026-11-17.csv');
  expect(await readFile(await csv.path(), 'utf8')).toContain('"12.34"');
  const templateDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV template', exact: true }).click();
  const template = await templateDownload;
  expect(await readFile(await template.path(), 'utf8')).toBe('Date,Title,Amount,Account,Category,Note\r\n');
  await returnHome(page);
  await expect(page.getByLabel('View net spending transactions')).toContainText('€12.34');
});

async function previewFile(page, content) {
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await (await choosingFile).setFiles({ name: 'quick-entry.csv', mimeType: 'text/csv', buffer: Buffer.from(content) });
  await page.getByRole('dialog').getByRole('button', { name: 'Preview import', exact: true }).click();
  return page.getByRole('dialog');
}

test('three quick entries append once and a repeated no-ID file requires duplicate choices', async ({ page }) => {
  const csv = 'Date,Title,Amount,Account,Category,Note\r\n2026-11-10,First entry,12.34,Everyday,Groceries,\r\n2026-11-11,Second entry,0.01,Shared,Shopping,\r\n2026-11-12,Third entry,99.99,Everyday,Groceries,\r\n';
  let dialog = await previewFile(page, csv);
  await expect(dialog.getByText('3 new', { exact: true })).toBeVisible();
  await dialog.getByLabel('Close dialog', { exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions.length)).toBe(1);
  dialog = await previewFile(page, csv);
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  dialog = await previewFile(page, csv);
  await expect(dialog.getByText('3 possible duplicate', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Import transactions', exact: true })).toBeDisabled();
  for (const row of [1, 2, 3]) {
    await dialog.getByLabel(`Row ${row} decision`, { exact: true }).selectOption('skip');
  }
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await returnHome(page);
  await expect(page.getByLabel('View net spending transactions')).toContainText('€124.68');
  const saved = await page.evaluate(() => ({
    count: JSON.parse(localStorage.getItem('melo-state-v1')).transactions.length,
    recoveryCount: JSON.parse(localStorage.getItem('havensum-import-recovery-v1')).transactions.length
  }));
  expect(saved).toEqual({ count: 4, recoveryCount: 1 });
});

test('a failed recovery save blocks import and leaves the saved ledger unchanged', async ({ page }) => {
  const dialog = await previewFile(page, 'title,amount,date,account,category\nBlocked purchase,10.00,2026-11-10,everyday,groceries\n');
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'havensum-import-recovery-v1') {
        throw Error('Synthetic recovery storage failure');
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText('Synthetic recovery storage failure', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions.length)).toBe(1);
  await page.reload();
  await expect(page.getByLabel('View Existing purchase', { exact: true })).toBeVisible();
  await expect(page.getByLabel('View Blocked purchase', { exact: true })).toHaveCount(0);
});
