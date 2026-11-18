import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
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
    try {
      if (!localStorage.getItem('melo-state-v1')) {
        localStorage.setItem('melo-state-v1', JSON.stringify(initialState));
      }
    } catch (error) {
      // The storage-denial scenario also denies the synthetic setup adapter.
      if (error.name !== 'SecurityError') {
        throw error;
      }
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

async function previewCsvImport(page, csvContent) {
  const k_csv = 'id,title,type,amount,date,account,category\nsynthetic-import,Café imported,expense,12.34,2026-11-17,everyday,groceries\n';
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import transactions', exact: true }).click();
  const fileChooser = await choosingFile;
  await fileChooser.setFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent ?? k_csv) });
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
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await previewCsvImport(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Import transactions', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
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

test('past-month summaries, wheel and category budgets share the same payback cutoff', async ({ page }) => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'october-purchase', amount: 10000, date: '2026-10-05' }),
    createTransaction({ id: 'future-payback', type: 'reimbursement', amount: 4000, date: '2026-11-30', linkedId: 'october-purchase' })
  ] });
  await page.evaluate(savedState => localStorage.setItem('melo-state-v1', JSON.stringify(savedState)), state);
  await page.reload();
  await page.getByRole('button', { name: 'Choose month', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Oct', exact: true }).click();

  await expect(page.getByLabel('View net spending transactions')).toContainText('€100.00');
  await expect(page.getByTestId('spending-breakdown').getByText('€100.00', { exact: true }).first()).toBeVisible();
  await page.getByLabel('View net spending transactions').click();
  await expect(page.getByText('€100.00', { exact: true })).toBeVisible();
  await returnHome(page);
  await openMoreSection(page, 'Categories');
  await expect(page.getByText('€100.00 spent', { exact: true })).toBeVisible();
});

test('temporary storage denial offers retry and recovers the saved ledger without seeding over it', async ({ page }) => {
  await addTransaction(page, { title: 'Keep through storage outage', amount: '12.34' });
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItem(key) {
      if (!window.g_allowStorageReads) {
        throw new DOMException('Storage access is blocked', 'SecurityError');
      }
      return originalGetItem.call(this, key);
    };
  });
  await page.reload();
  await expect(page.getByText('Device storage is unavailable', { exact: true })).toBeVisible();
  await page.evaluate(() => { window.g_allowStorageReads = true; });
  await page.getByRole('button', { name: 'Retry loading', exact: true }).click();

  await expect(page.getByLabel('View Keep through storage outage', { exact: true })).toBeVisible();
  await expect(page.getByLabel('View net spending transactions')).toContainText('€12.34');
});

test('an unreadable merge baseline produces recovery guidance instead of a parser error', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('melo-sync-base', '{broken-baseline'));
  await openMoreSection(page, 'Settings');
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Review backup merge', exact: true }).click();
  const fileChooser = await choosingFile;
  await fileChooser.setFiles({
    name: 'synthetic-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(createFinancialState()))
  });

  await expect(page.getByText('Your saved merge baseline is unreadable. Export a new baseline.', { exact: true })).toBeVisible();
});

test('preview exports explain that merge baselines are unavailable', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.getByLabel('Add expense', { exact: true })).toBeVisible();
  await openMoreSection(page, 'Settings');
  await expect(page.getByRole('button', { name: 'Review backup merge', exact: true })).toBeDisabled();
  await expect(page.getByText('Merge baselines are unavailable in preview mode. Open the main app to review a backup merge.', { exact: true })).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full JSON backup', exact: true }).click();
  await downloading;

  await expect(page.getByText('Example backup exported · merge baselines are unavailable in preview mode.', { exact: true })).toBeVisible();
});

test('non-ISO CSV dates identify the rejected data row and cannot partially import', async ({ page }) => {
  const k_csv = 'title,amount,date,account,category\nValid purchase,10.00,2026-11-10,everyday,groceries\nInvalid date purchase,20.00,15/11/2026,everyday,groceries\n';
  await openMoreSection(page, 'Settings');
  await previewCsvImport(page, k_csv);
  await expect(page.getByRole('dialog').getByText('Row 2: Choose a valid date.', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByLabel('Close dialog', { exact: true }).click();
  await returnHome(page);

  await expect(page.getByLabel('View net spending transactions')).toContainText('€0.00');
});
