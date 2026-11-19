import { test, expect } from '@playwright/test';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { editTransaction, openMoreSection, returnHome } from '../helpers/userFlows.js';
import { monthStats } from '../../src/engine.js';

// The synthetic statements are dated December 2031. Balances count entries
// from their date (L01), so balance checks run after the statements.
const k_afterStatements = '2031-12-10T12:00:00Z';

function statementFile(name, movement) {
  return {
    name, mimeType: 'text/csv',
    buffer: Buffer.from([
      'Consultar saldos e movimentos à ordem - 04-12-2031',
      'Conta,example',
      'Data de início,01-12-2031',
      'Data de fim,04-12-2031',
      'Data mov.,Data valor,Descrição,Débito,Crédito,Saldo contabilístico,Saldo disponível,Categoria',
      movement
    ].join('\r\n'))
  };
}

async function selectStatement(page, button, file) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button, exact: true }).click();
  await (await chooser).setFiles(file);
}

test('a bank credit can be linked to a new expense from the same statement before either row is saved', async ({ page }) => {
  await page.clock.install({ time: new Date(k_afterStatements) });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(state => localStorage.setItem('melo-state-v1', JSON.stringify(state)), createFinancialState());
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  await selectStatement(page, 'Import transactions', statementFile('payback.csv', [
    '29-11-2031,30-11-2031,Training purchase,26,,,101,Shopping',
    '03-12-2031,04-12-2031,Repayment credit,,8,,109,Shopping'
  ].join('\r\n')));

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Import into account', { exact: true }).selectOption('shared');
  await dialog.getByRole('button', { name: 'Preview import' }).click();
  await dialog.getByRole('button', { name: 'Edit row 6', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('expense');
  await dialog.getByRole('button', { name: 'Update draft' }).click();
  await dialog.getByRole('button', { name: 'Edit row 7', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('reimbursement');
  await dialog.getByLabel('Original expense', { exact: true })
    .selectOption({ label: 'Training purchase · €26.00 · 2031-11-30 · In this import' }, { timeout: 2500 });
  await dialog.getByRole('button', { name: 'Update draft' }).click();
  await expect(dialog.getByText('Projected €482.00', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions)).toEqual([]);
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText('After €482.00', { exact: true })).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')));
  expect(saved.transactions).toHaveLength(2);
  expect(saved.transactions[1]).toMatchObject({
    type: 'reimbursement', linkedId: saved.transactions[0].id, amount: 800, date: '2031-12-04'
  });
  expect(monthStats(saved, '2031-11').spent).toBe(1800);
  expect(monthStats(saved, '2031-12').income).toBe(0);
});

test('a bank payback distinguishes a draft expense from a recorded duplicate and can be linked again if the draft is skipped', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  const recorded = createTransaction({
    title: 'Training purchase', category: 'shopping', account: 'shared', amount: 2600, date: '2031-11-30'
  });
  await page.addInitScript(state => localStorage.setItem('melo-state-v1', JSON.stringify(state)),
    createFinancialState({ transactions: [recorded] }));
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  await selectStatement(page, 'Import transactions', statementFile('payback.csv', [
    '29-11-2031,30-11-2031,Training purchase,26,,,101,Shopping',
    '03-12-2031,04-12-2031,Repayment credit,,8,,109,Shopping'
  ].join('\r\n')));

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Import into account', { exact: true }).selectOption('shared');
  await dialog.getByRole('button', { name: 'Preview import' }).click();
  await dialog.getByRole('button', { name: 'Edit row 6', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('expense');
  await dialog.getByRole('button', { name: 'Update draft' }).click();
  await dialog.getByRole('button', { name: 'Edit row 7', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('reimbursement');
  await dialog.getByLabel('Original expense', { exact: true })
    .selectOption({ label: 'Training purchase · €26.00 · 2031-11-30 · In this import' }, { timeout: 2500 });
  await dialog.getByRole('button', { name: 'Update draft' }).click();
  await dialog.getByLabel('Row 6 decision', { exact: true }).selectOption('skip');
  await expect(dialog.getByRole('button', { name: 'Import transactions', exact: true })).toBeDisabled();
  await expect(dialog.getByText(/linked expense no longer exists/i)).toBeVisible();

  await dialog.getByRole('button', { name: 'Edit row 7', exact: true }).click();
  await dialog.getByLabel('Original expense', { exact: true })
    .selectOption({ label: 'Training purchase · €26.00 · 2031-11-30 · Already recorded' });
  await dialog.getByRole('button', { name: 'Update draft' }).click();
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText('Import results', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')));
  expect(saved.transactions).toHaveLength(2);
  expect(saved.transactions[1]).toMatchObject({ type: 'reimbursement', linkedId: recorded.id, amount: 800 });
});

test('a Real Bank debit is imported through an editable draft for the chosen account', async ({ page }) => {
  await page.clock.install({ time: new Date(k_afterStatements) });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(state => {
    localStorage.setItem('melo-state-v1', JSON.stringify(state));
  }, createFinancialState());
  await page.goto('/');
  await openMoreSection(page, 'Settings');

  await selectStatement(page, 'Import transactions',
    statementFile('synthetic.csv', '03-12-2031,04-12-2031,Treino sintético,26,,,101,Shopping'));

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Real Bank statement', { exact: true })).toBeVisible({ timeout: 2500 });
  await expect(dialog.getByRole('button', { name: 'Preview import' })).toBeDisabled();
  await dialog.getByLabel('Import into account', { exact: true }).selectOption('shared');
  await dialog.getByRole('button', { name: 'Preview import' }).click();
  await expect(dialog.getByRole('button', { name: 'Import transactions', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: /Edit row/ }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('expense');
  await dialog.getByLabel('Title', { exact: true }).fill('Reviewed training purchase');
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await expect(dialog.getByText('Projected €474.00', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions)).toEqual([]);
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText('After €474.00', { exact: true })).toBeVisible();
  const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')));
  expect(savedState.transactions).toHaveLength(1);
  expect(savedState.transactions[0]).toMatchObject({
    title: 'Reviewed training purchase', type: 'expense', amount: 2600,
    category: 'shopping', account: 'shared', date: '2031-12-04'
  });
});

test('matching rows from two selected statement accounts can be reviewed as a single transfer', async ({ page }) => {
  await page.clock.install({ time: new Date(k_afterStatements) });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(state => localStorage.setItem('melo-state-v1', JSON.stringify(state)), createFinancialState());
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  await selectStatement(page, 'Import transactions',
    statementFile('outgoing.csv', '03-12-2031,04-12-2031,Move funds,26,,,101,Transfer'));
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Import into account', { exact: true }).selectOption('everyday');
  await expect(dialog.getByRole('button', { name: 'Add another statement' })).toBeVisible({ timeout: 2500 });
  await selectStatement(page, 'Add another statement',
    statementFile('incoming.csv', '03-12-2031,05-12-2031,Funds received,,26,,101,Transfer'));
  await dialog.getByLabel('Account for incoming.csv', { exact: true }).selectOption('shared');
  await dialog.getByRole('button', { name: 'Preview import' }).click();
  await dialog.getByRole('button', { name: 'Edit statement 1, row 6', exact: true }).click();
  await dialog.getByLabel('Type', { exact: true }).selectOption('transfer');
  await dialog.getByLabel('Matching credit', { exact: true }).selectOption('1');
  await dialog.getByLabel('Transfer date', { exact: true }).selectOption('2031-12-05');
  await dialog.getByRole('button', { name: 'Update draft', exact: true }).click();
  await expect(dialog.getByText('Projected €974.00', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Projected €526.00', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await expect(dialog.getByText(/Combined with its matching transfer debit/)).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('melo-state-v1')).transactions);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ type: 'transfer', account: 'everyday', toAccount: 'shared', amount: 2600, date: '2031-12-05' });
});

test('a ledger rename keeps the original statement row available for duplicate review', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.clock.install({ time: new Date(k_afterStatements) });
  await page.addInitScript(state => {
    if (!localStorage.getItem('melo-state-v1')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(state));
    }
  }, createFinancialState());
  const file = statementFile('synthetic.csv', '03-12-2031,04-12-2031,Original bank title,26,,,101,Shopping');
  await page.goto('/');
  await openMoreSection(page, 'Settings');
  const preview = async () => {
    await selectStatement(page, 'Import transactions', file);
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Import into account', { exact: true }).selectOption('everyday');
    await dialog.getByRole('button', { name: 'Preview import' }).click();
    await dialog.getByRole('button', { name: /Edit row/ }).click();
    await dialog.getByLabel('Type', { exact: true }).selectOption('expense');
    await dialog.getByRole('button', { name: 'Update draft' }).click();
    return dialog;
  };
  const first = await preview();
  await first.getByRole('button', { name: 'Import transactions', exact: true }).click();
  await first.getByRole('button', { name: 'Done', exact: true }).click();
  await returnHome(page);
  const editor = await editTransaction(page, 'Original bank title');
  await editor.getByLabel('Title', { exact: true }).fill('Renamed in ledger');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await openMoreSection(page, 'Settings');
  const second = await preview();
  await expect(second.getByText('1 possible duplicate', { exact: true })).toBeVisible({ timeout: 2500 });
  await expect(second.getByText(/Renamed in ledger.*€26\.00/)).toBeVisible();
});
