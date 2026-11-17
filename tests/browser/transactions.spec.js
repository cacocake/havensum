import { test, expect } from '@playwright/test';
import { createFinancialState } from '../helpers/financialFixtures.js';
import { addTransaction, editTransaction, openMoreSection, returnHome } from '../helpers/userFlows.js';
import { readFile } from 'node:fs/promises';

const k_testDate = '2026-11-17T12:00:00';
const g_pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  g_pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(k_testDate) });
  const state = createFinancialState();
  await page.addInitScript(initialState => {
    if (!localStorage.getItem('melo-state-v1')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(initialState));
    }
  }, state);
  await page.goto('/');
  await expect(page.getByLabel('Add expense', { exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(g_pageErrors.get(page)).toEqual([]);
});

test('an expense can be created, inspected and retained after reload', async ({ page }) => {
  await page.getByLabel('Add expense', { exact: true }).click();
  await page.getByLabel('Amount · EUR', { exact: true }).fill('12,34');
  await page.getByLabel('Title', { exact: true }).fill('Synthetic weekly shopping');
  await page.getByRole('dialog').getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.getByLabel('View Synthetic weekly shopping', { exact: true }).click();
  await expect(page.getByRole('dialog').getByText('€12.34', { exact: true })).toBeVisible();
  await page.getByLabel('Close dialog', { exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('View Synthetic weekly shopping', { exact: true })).toBeVisible();
});

test('a corrupt saved ledger is reported and preserved across another startup', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('melo-state-v1', '{corrupt-synthetic-data'));
  await page.reload();
  await expect(page.getByText('Stored data could not be read', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Stored data could not be read', { exact: true })).toBeVisible();
});

test('editing and deleting an expense update the visible ledger and spending totals', async ({ page }) => {
  await addTransaction(page, { title: 'Editable purchase', amount: '10.00' });
  const editor = await editTransaction(page, 'Editable purchase');
  await editor.getByLabel('Amount · EUR', { exact: true }).fill('20.01');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByLabel('View net spending transactions')).toContainText('€20.01');

  const updatedEditor = await editTransaction(page, 'Editable purchase');
  await updatedEditor.getByRole('button', { name: 'Delete transaction', exact: true }).click();
  await updatedEditor.getByRole('button', { name: 'Keep it', exact: true }).click();
  await updatedEditor.getByRole('button', { name: 'Delete transaction', exact: true }).click();
  await updatedEditor.getByRole('button', { name: 'Delete transaction', exact: true }).click();

  await expect(page.getByLabel('View Editable purchase', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('View net spending transactions')).toContainText('€0.00');
});

test('discarding an unsaved transaction leaves cash and spending unchanged', async ({ page }) => {
  await page.getByLabel('Add expense', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount · EUR', { exact: true }).fill('99.99');
  await dialog.getByLabel('Title', { exact: true }).fill('Never saved');
  await dialog.getByLabel('Close dialog', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();

  await expect(page.getByLabel('View Never saved', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('View net spending transactions')).toContainText('€0.00');
  await page.getByLabel('View Everyday account', { exact: true }).click();
  await expect(page.getByText('€1,000.00', { exact: true }).first()).toBeVisible();
});

test('a linked payback reduces net spending without becoming income and protects its expense', async ({ page }) => {
  await addTransaction(page, { title: 'Refundable purchase', amount: '100.00' });
  await page.getByLabel('Add payback', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount · EUR', { exact: true }).fill('40.00');
  await dialog.getByLabel('Title', { exact: true }).fill('Received payback');
  await dialog.getByLabel('Original expense (optional)', { exact: true }).selectOption({ label: 'Refundable purchase · €100.00 · 2026-11-17' });
  await dialog.getByLabel('Account', { exact: true }).selectOption('shared');
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click();

  await expect(page.getByLabel('View net spending transactions')).toContainText('€60.00');
  await expect(page.getByLabel('View income transactions')).toContainText('€0.00');
  const editor = await editTransaction(page, 'Refundable purchase');
  await editor.getByRole('button', { name: 'Delete transaction', exact: true }).click();
  await editor.getByRole('button', { name: 'Delete transaction', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Remove or unlink its reimbursements');
});

test('transfers change the two account balances without affecting income or spending', async ({ page }) => {
  await addTransaction(page, { title: 'Move between accounts', amount: '100.00', type: 'transfer' });

  await expect(page.getByLabel('View net spending transactions')).toContainText('€0.00');
  await expect(page.getByLabel('View income transactions')).toContainText('€0.00');
  await expect(page.getByLabel('View Everyday account')).toContainText('€900.00');
  await expect(page.getByLabel('View Shared account')).toContainText('€600.00');
});

test('an existing loan does not credit cash unless proceeds are explicitly selected', async ({ page }) => {
  await openMoreSection(page, 'Loans');
  await page.getByRole('button', { name: 'Add loan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('switch', { name: 'Add loan proceeds to this account' })).not.toBeChecked();
  await dialog.getByLabel('Loan name', { exact: true }).fill('Existing car loan');
  await dialog.getByLabel('Remaining balance · EUR', { exact: true }).fill('5000');
  await dialog.getByLabel('Monthly payment · EUR', { exact: true }).fill('100');
  await dialog.getByRole('button', { name: 'Add loan', exact: true }).click();
  await returnHome(page);

  await expect(page.getByLabel('View Everyday account')).toContainText('€1,000.00');
  await expect(page.getByLabel('View income transactions')).toContainText('€0.00');
});

test('selected loan proceeds credit cash without becoming income', async ({ page }) => {
  await openMoreSection(page, 'Loans');
  await page.getByRole('button', { name: 'Add loan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Loan name', { exact: true }).fill('New loan with proceeds');
  await dialog.getByLabel('Remaining balance · EUR', { exact: true }).fill('5000');
  await dialog.getByLabel('Monthly payment · EUR', { exact: true }).fill('100');
  await dialog.getByRole('switch', { name: 'Add loan proceeds to this account' }).click();
  await dialog.getByRole('button', { name: 'Add loan', exact: true }).click();
  await returnHome(page);

  await expect(page.getByLabel('View Everyday account')).toContainText('€6,000.00');
  await expect(page.getByLabel('View income transactions')).toContainText('€0.00');
});

async function previewCsvImport(page) {
  const k_csv = 'id,title,type,amount,date,account,category\nsynthetic-import,Café imported,expense,12.34,2026-11-17,everyday,groceries\n';
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import transactions', exact: true }).click();
  const fileChooser = await choosingFile;
  await fileChooser.setFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(k_csv) });
  await page.getByRole('dialog').getByRole('button', { name: 'Preview import', exact: true }).click();
}

test('CSV preview can be cancelled, appends on approval and safely skips a repeated file', async ({ page }) => {
  await addTransaction(page, { title: 'Existing manual purchase', amount: '10.00' });
  await openMoreSection(page, 'Settings');
  await previewCsvImport(page);
  await expect(page.getByRole('dialog').getByText('Café imported', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByLabel('Close dialog', { exact: true }).click();
  await returnHome(page);
  await expect(page.getByLabel('View net spending transactions')).toContainText('€10.00');

  await openMoreSection(page, 'Settings');
  await previewCsvImport(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Import transactions', exact: true }).click();
  await previewCsvImport(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Import transactions', exact: true }).click();
  await returnHome(page);

  await expect(page.getByLabel('View net spending transactions')).toContainText('€22.34');
  await expect(page.getByLabel('View Existing manual purchase', { exact: true })).toBeVisible();
  await expect(page.getByLabel('View Café imported', { exact: true })).toHaveCount(1);
});

test('browser JSON backup downloads a complete synthetic ledger in integer cents', async ({ page }) => {
  await addTransaction(page, { title: 'Backup purchase', amount: '12.34' });
  await openMoreSection(page, 'Settings');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full JSON backup', exact: true }).click();
  const download = await downloading;
  const downloadedPath = await download.path();
  const backup = JSON.parse(await readFile(downloadedPath, 'utf8'));

  expect(backup.transactions).toHaveLength(1);
  expect(backup.transactions[0]).toMatchObject({ title: 'Backup purchase', amount: 1234, account: 'everyday' });
  expect(backup.accounts).toHaveLength(2);
  expect(backup.categories).toHaveLength(6);
});

test('loan amounts must be finite safe integer cents before a loan can be saved', async ({ page }) => {
  await openMoreSection(page, 'Loans');
  await page.getByRole('button', { name: 'Add loan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Loan name', { exact: true }).fill('Invalid amount loan');
  await dialog.getByLabel('Remaining balance · EUR', { exact: true }).fill('Infinity');
  await dialog.getByLabel('Monthly payment · EUR', { exact: true }).fill('100');
  await dialog.getByRole('button', { name: 'Add loan', exact: true }).click();

  await expect(dialog.getByText('Enter a name, positive amounts and a valid month range (YYYY-MM).', { exact: true })).toBeVisible();
  await dialog.getByLabel('Remaining balance · EUR', { exact: true }).fill('90071992547409.92');
  await dialog.getByRole('button', { name: 'Add loan', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Remaining balance · EUR', { exact: true }).fill('5000');
  await dialog.getByLabel('Monthly payment · EUR', { exact: true }).fill('Infinity');
  await dialog.getByRole('button', { name: 'Add loan', exact: true }).click();
  await expect(dialog).toBeVisible();
});

test('an account cannot save an opening balance outside safe integer cents', async ({ page }) => {
  await openMoreSection(page, 'Accounts');
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Account name', { exact: true }).fill('Unsafe opening balance');
  await dialog.getByLabel('Opening balance · EUR', { exact: true }).fill('90071992547409.92');
  await dialog.getByRole('button', { name: 'Save account', exact: true }).click();

  await expect(dialog.getByText('Enter a name, valid balance and non-negative interest rate.', { exact: true })).toBeVisible();
});

test('editing a savings account preserves an explicitly zero interest rate', async ({ page }) => {
  await openMoreSection(page, 'Accounts');
  await page.getByRole('button', { name: 'Add account', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Account name', { exact: true }).fill('Zero interest');
  await dialog.getByLabel('Account type', { exact: true }).selectOption('Savings');
  await dialog.getByLabel('Effective annual interest · %', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Save account', exact: true }).click();
  await page.getByLabel('View Zero interest account', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit account', exact: true }).click();
  dialog = page.getByRole('dialog');

  await expect(dialog.getByLabel('Effective annual interest · %', { exact: true })).toHaveValue('0');
});

test('conflicting backup edits cannot apply until the owner selects the field value', async ({ page }) => {
  await addTransaction(page, { title: 'Conflicted purchase', amount: '10.00' });
  await openMoreSection(page, 'Settings');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export shared baseline', exact: true }).click();
  const download = await downloading;
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  backup.transactions[0].amount = 2000;

  await returnHome(page);
  const editor = await editTransaction(page, 'Conflicted purchase');
  await editor.getByLabel('Amount · EUR', { exact: true }).fill('15.00');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await openMoreSection(page, 'Settings');
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Review backup merge', exact: true }).click();
  const fileChooser = await choosingFile;
  await fileChooser.setFiles({ name: 'synthetic-conflict.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  const review = page.getByRole('dialog');
  const applyButton = review.getByRole('button', { name: 'Apply reviewed merge', exact: true });
  await expect(applyButton).toBeDisabled();
  await review.getByText('BACKUP FILE', { exact: true }).click();
  await applyButton.click();
  await returnHome(page);

  await expect(page.getByLabel('View net spending transactions')).toContainText('€20.00');
});
