import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState } from '../helpers/financialFixtures.js';
import { editTransaction, openMoreSection } from '../helpers/userFlows.js';

const k_header = 'account,amount,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective';

const k_betaHeader = k_header.replace('amount,currency', 'amount,amount unpaid,currency') + ',extra';

async function openCashewImport(page, rows, header = k_header, state = createFinancialState()) {
  await page.addInitScript(seed => localStorage.setItem('melo-state-v1', JSON.stringify(seed)), state);
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await (await chooser).setFiles({
    name: 'synthetic-cashew.csv', mimeType: 'text/csv', buffer: Buffer.from([header, ...rows].join('\n'))
  });
  return page.getByRole('dialog');
}

test('Cashew account creation takes effect with the reviewed import and recovery retains the previous ledger', async ({ page }) => {
  const dialog = await openCashewImport(page, [
    'Poupança,-20.500000000000004,,EUR,Café,,2026-11-10 12:00:00.000,false,default,Groceries,,,,,,,'
  ], k_betaHeader);
  await expect(dialog.getByText('Cashew transaction export', { exact: true })).toBeVisible({ timeout: 2500 });
  await dialog.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(dialog.getByText(/Map this Cashew account or approve creating it/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Back to mapping', exact: true }).click();
  await dialog.getByLabel('Account: Poupança', { exact: true }).selectOption({ label: 'Create Poupança' });
  await dialog.getByRole('button', { name: 'Preview import', exact: true }).click();
  await dialog.getByRole('button', { name: 'Edit row 2', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('expense');
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await expect(dialog.getByText('Café', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Projected -€20.50', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).accounts.length)).toBe(2);
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText('After -€20.50', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('melo-state-v1'));
    const backup = JSON.parse(localStorage.getItem('havensum-import-recovery-v1'));
    const wallet = state.accounts.find(account => account.name === 'Poupança');
    return [wallet.openingBalance, state.transactions[0].account === wallet.id, backup.accounts.length];
  })).toEqual([0, true, 2]);
});

test('the two legs in one Cashew export are suggested as a pair and can be confirmed during review', async ({ page }) => {
  const dialog = await openCashewImport(page, [
    'Everyday,-15,EUR,Move funds,"Transferred Balance\nEveryday → Shared",2026-11-10 12:00:00.000,false,null,Balance Correction,,,,,,',
    'Shared,15,EUR,Funds received,"Transferred Balance\nEveryday → Shared",2026-11-10 12:00:00.000,true,null,Balance Correction,,,,,,'
  ]);
  await dialog.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(dialog.getByText('Suggested transfer with row 3 · check or change it before importing', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit row 2', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('transfer');
  await dialog.getByLabel('Matching credit', { exact: true }).selectOption('1');
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await expect(dialog.getByText('Projected €985.00', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Projected €515.00', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText(/Combined with its matching transfer debit/)).toBeVisible();
});

test('a Cashew borrowing row imports as loan proceeds once a Havensum loan is chosen, showing its budget read-only', async ({ page }) => {
  const loan = { id: 'car', name: 'Car loan', remaining: 500000, original: 800000, payment: 18500, paymentChanges: [], start: '2026-01', end: '2029-12', account: 'everyday' };
  const dialog = await openCashewImport(page, [
    'Everyday,2000.0,EUR,Borrowed,,2026-11-10 12:00:00.000,true,TransactionSpecialType.debt,Dívidas,,,,,Orçamento,'
  ], k_header, createFinancialState({ loans: [loan] }));
  await dialog.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(dialog.getByText('Cashew budget · Orçamento · not imported', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit row 2', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('reimbursement');
  await dialog.getByLabel('Original expense', { exact: true }).selectOption({ label: 'Unlinked balance adjustment' });
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await expect(dialog.getByText('Choose the Havensum loan for this Cashew borrowing entry.').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit row 2', exact: true }).click();
  await dialog.getByLabel('Havensum loan', { exact: true }).selectOption({ label: 'Car loan' });
  await expect(dialog.getByText('Loan money received · adds to this account, never income', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await expect(dialog.getByText('Loan · Car loan', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Projected €3,000.00', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText('After €3,000.00', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions
    .map(({ type, amount, loanId, linkedId }) => [type, amount, loanId, linkedId]))).toEqual([['reimbursement', 200000, 'car', null]]);
});

test('editing imported loan proceeds keeps their loan tag', async ({ page }) => {
  const loan = { id: 'car', name: 'Car loan', remaining: 500000, original: 800000, payment: 18500, paymentChanges: [], start: '2026-01', end: '2029-12', account: 'everyday' };
  const proceeds = { id: 'imported-proceeds', type: 'reimbursement', title: 'Borrowed', amount: 200000, account: 'everyday', date: '2026-11-10', linkedId: null, loanId: 'car', externalSource: 'cashew' };
  await page.addInitScript(seed => localStorage.setItem('melo-state-v1', JSON.stringify(seed)),
    createFinancialState({ loans: [loan], transactions: [proceeds] }));
  await page.goto('/');
  const editor = await editTransaction(page, 'Borrowed');
  await editor.getByLabel('Title', { exact: true }).fill('Borrowed from the bank');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions
    .map(({ title, loanId, type }) => [title, loanId, type]))).toEqual([['Borrowed from the bank', 'car', 'reimbursement']]);
});

test('a Cashew row with an objective shows its extra and may be recorded against a chosen loan', async ({ page }) => {
  const loan = { id: 'car', name: 'Car loan', remaining: 500000, original: 800000, payment: 18500, paymentChanges: [], start: '2026-01', end: '2029-12', account: 'everyday' };
  const dialog = await openCashewImport(page, [
    'Everyday,-50.0,,EUR,Prestação,,2026-11-10 20:28:00.000,false,default,Comer Fora,,0XFF607D8B,cutlery,,,Empréstimo da família,repeat every 1 month'
  ], k_betaHeader, createFinancialState({ loans: [loan] }));
  await dialog.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(dialog.getByText('Cashew extra · repeat every 1 month · not imported', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/This Cashew objective may be a loan/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit row 2', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('expense');
  await dialog.getByLabel('Category', { exact: true }).selectOption('loan');
  const repaymentMeaning = dialog.getByText('Payment on the loan · a repayment expense in the loan category', { exact: true });
  await expect(repaymentMeaning).toHaveCount(0);
  await dialog.getByLabel('Havensum loan', { exact: true }).selectOption({ label: 'Car loan' });
  await expect(repaymentMeaning).toBeVisible();
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await expect(dialog.getByText('Loan · Car loan', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText('After €950.00', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions
    .map(({ type, amount, loanId, category }) => [type, amount, loanId, category]))).toEqual([['expense', 5000, 'car', 'loan']]);
});
