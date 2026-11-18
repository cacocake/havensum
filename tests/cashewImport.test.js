import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportContent } from '../src/importFiles.js';
import { previewImportFile } from '../src/importFileReview.js';
import { applyTransactionImport, reviseTransactionImport } from '../src/importReview.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';
import { accountBalance, monthStats } from '../src/ledger.js';

const k_header = 'account,amount,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective';
const k_expense = 'Wallet,-12.34,EUR,Café,"A note, with punctuation",2026-11-12 23:40:00.123,false,null,Food,Snacks,,,,,';
const k_credit = 'Wallet,5.01,EUR,Incoming,,2026-11-13 00:10:00.000,true,TransactionSpecialType.debt,Other,,,,,,';

test('the published Cashew header selects its profile and reads exact cents and the written calendar date', async () => {
  const file = await parseImportContent('renamed.csv', [k_header, k_expense, k_credit].join('\r\n'));
  assert.equal(file.cashew.profile, 'cashew-csv-v1');
  assert.deepEqual(file.rows.map(row => row.movement), [
    { amount: 1234, date: '2026-11-12', direction: 'debit' },
    { amount: 501, date: '2026-11-13', direction: 'credit' }
  ]);
  assert.equal(file.rows[0].note, 'A note, with punctuation');
  assert.equal(file.rows[0].category, 'Food / Snacks');
  assert.equal(file.rows[1].specialType, 'TransactionSpecialType.debt');
});

test('Cashew review can create a missing account only for transactions approved on confirmation', async () => {
  const state = createFinancialState();
  const file = await parseImportContent('synthetic.csv', [k_header, k_expense, k_credit].join('\n'));
  const unknown = previewImportFile(state, file);
  assert.match(unknown.rows[0].error, /account/i);
  const options = { newAccounts: [{ sourceName: 'Wallet', id: 'cashew-wallet' }] };
  const preview = previewImportFile(state, file, options);
  assert.equal(preview.rows[1].status, 'invalid');
  assert.match(preview.rows[1].error, /classification/i);
  assert.deepEqual(applyTransactionImport(state, preview, { 0: 'skip', 1: 'skip' }).accounts, state.accounts);

  const review = reviseTransactionImport(state, preview, 0, { type: 'expense', category: 'groceries' });
  const result = applyTransactionImport(state, review, { 1: 'skip' }, () => 'expense-1');
  assert.deepEqual(result.accounts.slice(-1).map(({ id, name, openingBalance }) => [id, name, openingBalance]),
    [['cashew-wallet', 'Wallet', 0]]);
  assert.deepEqual(result.transactions.map(({ account, amount, type }) => [account, amount, type]),
    [['cashew-wallet', 1234, 'expense']]);
  assert.equal(state.accounts.length, 2);
});

test('a Cashew sign and income mismatch reaches review with its warning and no classification', async () => {
  const source = k_expense.replace(',false,null,', ',true,null,');
  const file = await parseImportContent('synthetic.csv', [k_header, source].join('\n'));
  const review = previewImportFile(createFinancialState(), file, { accounts: { Wallet: 'everyday' } });
  assert.equal(review.rows[0].status, 'invalid');
  assert.match(review.rows[0].bank.sourceWarning, /income flag.*sign/i);
  assert.equal(review.rows[0].transaction.type, undefined);
});

test('opposite Cashew rows become one neutral transfer, with both export legs available for duplicate review', async () => {
  const rows = [
    'Wallet,-36.40,EUR,Explicit transfer out,,2026-11-12 23:40:00.123,false,null,Balance Correction,,,,,,',
    'Savings,36.40,EUR,Explicit transfer in,,2026-11-12 23:40:00.123,true,null,Balance Correction,,,,,,'
  ];
  const file = await parseImportContent('synthetic.csv', [k_header, ...rows].join('\n'));
  const state = createFinancialState();
  const options = { accounts: { Wallet: 'everyday' }, newAccounts: [{ sourceName: 'Savings', id: 'new-savings' }] };
  const preview = previewImportFile(state, file, options);
  const review = reviseTransactionImport(state, preview, 0, { type: 'transfer', counterpartIndex: 1 });
  assert.deepEqual(review.rows.map(row => row.status), ['new', 'paired']);
  const saved = applyTransactionImport(state, review, {}, () => 'matched-cashew-transfer');
  assert.equal(saved.transactions.length, 1);
  assert.equal(accountBalance(saved, 'everyday'), 96360);
  assert.equal(accountBalance(saved, 'new-savings'), 3640);
  assert.equal(monthStats(saved, '2026-11').income, 0);
  assert.equal(monthStats(saved, '2026-11').spent, 0);
  const repeated = previewImportFile(saved, file, { accounts: { Wallet: 'everyday' } });
  assert.deepEqual(repeated.rows.map(row => row.possibleMatches.map(match => match.id)),
    [['matched-cashew-transfer'], ['matched-cashew-transfer']]);
});

test('a reviewed Cashew credit can offset an earlier expense without adding earnings', async () => {
  const expense = createTransaction({ id: 'traced-expense', date: '2026-10-14', amount: 1200 });
  const state = createFinancialState({ transactions: [expense] });
  const file = await parseImportContent('synthetic.csv', [k_header, k_credit].join('\n'));
  const preview = previewImportFile(state, file, { accounts: { Wallet: 'everyday' } });
  const review = reviseTransactionImport(state, preview, 0, { type: 'reimbursement', linkedId: expense.id });
  const saved = applyTransactionImport(state, review, {}, () => 'confirmed-payback');
  assert.equal(monthStats(saved, '2026-10').spent, 699);
  assert.equal(monthStats(saved, '2026-11').income, 0);
});

test('Cashew rejects unsupported currencies, invalid dates and ambiguous amounts on their source rows', async () => {
  const file = await parseImportContent('synthetic.csv', [k_header,
    k_expense.replace('EUR', 'USD'),
    k_expense.replace('2026-11-12', '2026-02-31'),
    k_expense.replace('-12.34', '-12.345'),
    '', k_credit].join('\n'));
  assert.deepEqual(file.rows.map(row => row.sourceRow), [2, 3, 4, 6]);
  assert.match(file.rows[0].error, /only EUR/i);
  assert.match(file.rows[1].error, /invalid/);
  assert.match(file.rows[2].error, /signed EUR amount/);
  assert.equal(file.rows[3].movement.amount, 501);
});

test('a recognizable but unsupported Cashew layout does not fall back to generic expense defaults', async () => {
  const otherLayout = [`${k_header},extra`, `${k_credit},value`].join('\n');
  await assert.rejects(parseImportContent('changed.csv', otherLayout), /unsupported Cashew.*header/i);
});
