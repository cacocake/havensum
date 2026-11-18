import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';

const k_header = 'account,amount,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective';

const k_betaHeader = k_header.replace('amount,currency', 'amount,amount unpaid,currency') + ',extra';

async function openCashewImport(page, rows, header = k_header) {
  await page.addInitScript(state => localStorage.setItem('melo-state-v1', JSON.stringify(state)), createFinancialState());
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

test('the two legs in one Cashew export can be paired during review', async ({ page }) => {
  const dialog = await openCashewImport(page, [
    'Everyday,-15,EUR,Move funds,,2026-11-10 12:00:00.000,false,null,Balance Correction,,,,,,',
    'Shared,15,EUR,Funds received,,2026-11-10 12:00:00.000,true,null,Balance Correction,,,,,,'
  ]);
  await dialog.getByRole('button', { name: 'Preview import', exact: true }).click();
  await dialog.getByRole('button', { name: 'Edit row 2', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('transfer');
  await dialog.getByLabel('Matching credit', { exact: true }).selectOption('1');
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await expect(dialog.getByText('Projected €985.00', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Projected €515.00', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText(/Combined with its matching transfer debit/)).toBeVisible();
});
