import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';

test('Cashew account creation takes effect with the reviewed import and recovery retains the previous ledger', async ({ page }) => {
  await page.addInitScript(state => {
    if (localStorage.getItem('melo-state-v1') === null) {
      localStorage.setItem('melo-state-v1', JSON.stringify(state));
    }
  }, createFinancialState());
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await (await chooser).setFiles({ name: 'synthetic-cashew.csv', mimeType: 'text/csv', buffer: Buffer.from([
    'account,amount,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective',
    'Wallet,-20.50,EUR,Grocery purchase,,2026-11-10 12:00:00.000,false,null,Groceries,,,,,,'
  ].join('\n')) });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Cashew transaction export', { exact: true })).toBeVisible({ timeout: 2500 });
  await dialog.getByLabel('Account: Wallet', { exact: true }).selectOption({ label: 'Create Wallet' });
  await dialog.getByRole('button', { name: 'Preview import', exact: true }).click();
  await dialog.getByRole('button', { name: 'Edit row 2', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('expense');
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await expect(dialog.getByText('Projected -€20.50', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).accounts.length)).toBe(2);
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText('After -€20.50', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('melo-state-v1'));
    const backup = JSON.parse(localStorage.getItem('havensum-import-recovery-v1'));
    const wallet = state.accounts.find(account => account.name === 'Wallet');
    return [wallet.openingBalance, state.transactions[0].account === wallet.id, backup.accounts.length];
  })).toEqual([0, true, 2]);
});
