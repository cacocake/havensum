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
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
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

test('an import row can be renamed and recategorized before any ledger changes are written', async ({ page }) => {
  const dialog = await previewFile(page, 'Date,Title,Amount,Account,Category\n2026-11-12,Imported lunch,15.42,Everyday,Groceries\n');
  await dialog.getByRole('button', { name: 'Edit row 1', exact: true }).click({ timeout: 2500 });
  await dialog.getByLabel('Title', { exact: true }).fill('Lunch with friends');
  await dialog.getByLabel('Category', { exact: true }).selectOption('shopping');
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();

  await expect(dialog.getByText('Lunch with friends', { exact: true })).toBeVisible();
  const readLedger = () => page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions);
  expect(await readLedger()).toHaveLength(1);

  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await readLedger()).toEqual([
    expect.objectContaining({ title: 'Existing purchase' }),
    expect.objectContaining({ title: 'Lunch with friends', category: 'shopping', amount: 1542 })
  ]);
});

test('the review editor can correct an imported movement into a transfer with exact cents', async ({ page }) => {
  const dialog = await previewFile(page, 'Date,Title,Amount,Account,Category\n2026-11-12,Transfer draft,10.00,Everyday,Groceries\n');
  await dialog.getByRole('button', { name: 'Edit row 1', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('transfer', { timeout: 2500 });
  await dialog.getByLabel('Amount · EUR', { exact: true }).fill('17,29');
  await dialog.getByLabel('Date', { exact: true }).fill('2026-11-13');
  await dialog.getByLabel('Destination account', { exact: true }).selectOption('shared');
  await dialog.getByLabel('Note', { exact: true }).fill('Move cash');
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions);
  expect(saved[1]).toMatchObject({ type: 'transfer', title: 'Transfer draft', account: 'everyday',
    date: '2026-11-13', amount: 1729, toAccount: 'shared', note: 'Move cash' });
  expect(saved[1]).not.toHaveProperty('category');
});

test('a duplicate candidate is still visible and must be reviewed after the draft is renamed', async ({ page }) => {
  const dialog = await previewFile(page, 'Date,Title,Amount,Account,Category\n2026-11-10,Existing purchase,12.34,Everyday,Groceries\n');
  await dialog.getByRole('button', { name: 'Edit row 1', exact: true }).click();
  await dialog.getByLabel('Title', { exact: true }).fill('Renamed possible duplicate');
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();

  await expect(dialog.getByText('1 possible duplicate', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Existing purchase · 2026-11-10 · Everyday · €12.34', { exact: true })).toBeVisible({ timeout: 2500 });
  await expect(dialog.getByRole('button', { name: 'Import transactions', exact: true })).toBeDisabled();
  await dialog.getByLabel('Row 1 decision', { exact: true }).selectOption('skip');
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions);
  expect(saved).toHaveLength(1);
  expect(saved[0].title).toBe('Existing purchase');
});

test('editing a refund leaves its unresolved expense link in place until explicitly corrected', async ({ page }) => {
  const dialog = await previewFile(page,
    'date,title,amount,type,account,linked_id\n2026-11-14,Refund draft,2.00,reimbursement,everyday,missing-expense\n');
  await expect(dialog.getByText(/linked expense no longer exists/i)).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit row 1', exact: true }).click();
  await dialog.getByLabel('Title', { exact: true }).fill('Renamed refund');
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await expect(dialog.getByText(/linked expense no longer exists/i)).toBeVisible({ timeout: 2500 });
  await expect(dialog.getByRole('button', { name: 'Import transactions', exact: true })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Edit row 1', exact: true }).click();
  await dialog.getByLabel('Original expense', { exact: true }).selectOption('weekly-shopping');
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions);
  expect(saved[1]).toMatchObject({ type: 'reimbursement', title: 'Renamed refund', linkedId: 'weekly-shopping' });
});

test('review shows the before and projected balances for both sides of a transfer', async ({ page }) => {
  const dialog = await previewFile(page,
    'date,title,amount,type,account,toAccount\n2026-11-14,Move to shared,17.29,transfer,everyday,shared\n');
  await expect(dialog.getByText('Account balances', { exact: true })).toBeVisible({ timeout: 2500 });
  for (const text of ['Everyday', 'Before €987.66', 'Projected €970.37', 'Shared', 'Before €500.00', 'Projected €517.29']) {
    await expect(dialog.getByText(text, { exact: true })).toBeVisible();
  }
  const ledger = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions);
  expect(ledger).toHaveLength(1);
});

test('after confirming, import results report what was added, updated, skipped and the final balances', async ({ page }) => {
  const dialog = await previewFile(page, [
    'id,date,title,amount,type,account,category,toAccount',
    'weekly-shopping,2026-11-10,Corrected purchase,20.00,expense,everyday,groceries,',
    ',2026-11-10,Existing purchase,12.34,expense,everyday,groceries,',
    ',2026-11-14,Move to shared,17.29,transfer,everyday,,shared'
  ].join('\n'));
  await dialog.getByLabel('Row 1 decision', { exact: true }).selectOption('replace');
  await dialog.getByLabel('Row 2 decision', { exact: true }).selectOption('skip');
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();

  for (const text of ['Import results', '1 added', '1 updated', '1 skipped',
    'Before €987.66', 'After €962.71', 'Before €500.00', 'After €517.29']) {
    await expect(dialog.getByText(text, { exact: true })).toBeVisible({ timeout: 2500 });
  }
  await expect(dialog.getByText('Row 2 · Skipped possible duplicate', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('a specific target account can be chosen for a file before reviewing and confirming it', async ({ page }) => {
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await (await choosingFile).setFiles({
    name: 'one-account.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Date,Title,Amount,Category\n2026-11-12,Lunch,4.25,Groceries\n')
  });
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Import into account', { exact: true }).selectOption('shared', { timeout: 2500 });
  await dialog.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(dialog.getByText('Shared', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Projected €495.75', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Everyday', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText('After €495.75', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions);
  expect(saved[1]).toMatchObject({ account: 'shared', amount: 425 });
});

test('a malformed source row is excluded only after an explicit decision and its error is shown in results', async ({ page }) => {
  const dialog = await previewFile(page,
    'date,title,amount,account,category\n2026-11-12,Malformed amount,oops,everyday,groceries\n2026-11-13,Valid purchase,4.25,everyday,groceries\n');
  await expect(dialog.getByRole('button', { name: 'Import transactions', exact: true })).toBeDisabled();
  await dialog.getByLabel('Row 1 decision', { exact: true }).selectOption('skip', { timeout: 2500 });
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText('Row 1 · Skipped malformed source row', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/at most two decimals/)).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions);
  expect(saved).toHaveLength(2);
  expect(saved[1]).toMatchObject({ title: 'Valid purchase', amount: 425 });
});

test('three quick entries append once and a repeated no-ID file requires duplicate choices', async ({ page }) => {
  const csv = 'Date,Title,Amount,Account,Category,Note\r\n2026-11-10,First entry,12.34,Everyday,Groceries,\r\n2026-11-11,Second entry,0.01,Shared,Shopping,\r\n2026-11-12,Third entry,99.99,Everyday,Groceries,\r\n';
  let dialog = await previewFile(page, csv);
  await expect(dialog.getByText('3 new', { exact: true })).toBeVisible();
  await dialog.getByLabel('Close dialog', { exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions.length)).toBe(1);
  dialog = await previewFile(page, csv);
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  dialog = await previewFile(page, csv);
  await expect(dialog.getByText('3 possible duplicate', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Import transactions', exact: true })).toBeDisabled();
  for (const row of [1, 2, 3]) {
    await dialog.getByLabel(`Row ${row} decision`, { exact: true }).selectOption('skip');
  }
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
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
