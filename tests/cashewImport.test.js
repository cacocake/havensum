import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportContent } from '../src/importFiles.js';
import { previewImportFile } from '../src/importFileReview.js';
import { applyTransactionImport, reviseTransactionImport } from '../src/importReview.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';
import { accountBalance, monthStats } from '../src/ledger.js';

const k_header = 'account,amount,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective';
const k_expense = 'Wallet,-12.34,EUR,Café,"A note, with punctuation",2026-11-12 23:40:00.123,false,null,Food,Snacks,,,,,';
const k_credit = 'Wallet,5.01,EUR,Incoming,,2026-11-13 00:10:00.000,true,null,Other,,,,,,';
const k_borrowing = k_credit.replace(',true,null,', ',true,TransactionSpecialType.debt,');

test('the published Cashew header selects its profile and reads exact cents and the written calendar date', async () => {
  const file = await parseImportContent('renamed.csv', [k_header, k_expense, k_borrowing].join('\r\n'));
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

test('a Cashew borrowing or lending entry cannot be applied as ordinary income or spending', async () => {
  const lending = k_expense.replace(',false,null,', ',false,TransactionSpecialType.credit,');
  const file = await parseImportContent('synthetic.csv', [k_header, k_borrowing, lending].join('\n'));
  const state = createFinancialState();
  const review = previewImportFile(state, file, { accounts: { Wallet: 'everyday' } });
  for (const [index, type] of [[0, 'income'], [1, 'expense']]) {
    const changed = reviseTransactionImport(state, review, index, { type, category: 'groceries' });
    assert.equal(changed.rows[index].status, 'invalid');
    assert.match(changed.rows[index].error, /borrowing and lending/i);
  }
  assert.deepEqual(applyTransactionImport(state, review, { 0: 'skip', 1: 'skip' }).transactions, []);
});

test('Cashew duplicate hints keep the original account and timestamp distinct when mapped to one account', async () => {
  const later = k_expense.replace('23:40:00.123', '23:41:00.123');
  const otherAccount = k_expense.replace(/^Wallet,/, 'Other wallet,');
  const file = await parseImportContent('synthetic.csv', [k_header, k_expense, later, otherAccount].join('\n'));
  const ledger = createFinancialState();
  const review = previewImportFile(ledger, file, { accounts: { Wallet: 'everyday', 'Other wallet': 'everyday' } });
  assert.equal(new Set(review.rows.map(row => row.transaction.sourceFingerprint)).size, 3);
});

test('a leading blank line preserves the Cashew format and physical source row', async () => {
  const file = await parseImportContent('synthetic.csv', ['', k_header, k_credit].join('\r\n'));
  assert.equal(file.cashew?.profile, 'cashew-csv-v1');
  assert.equal(file.rows[0].sourceRow, 3);
});

test('the Cashew beta export preserves UTF-8 accents and recognizes its ordinary transaction rows', async () => {
  const header = k_header.replace('amount,currency', 'amount,amount unpaid,currency') + ',extra';
  const source = [header,
    'Poupança,-12.50,,EUR,Café,Pequeno-almoço,2026-11-12 23:40:00.123,false,default,Refeições,,,,,,,'
  ].join('\r\n');
  const file = await parseImportContent('synthetic-beta.csv', Buffer.from(source, 'utf8'));
  const review = previewImportFile(createFinancialState(), file, { accounts: { Poupança: 'everyday' } });
  assert.equal(file.cashew.profile, 'cashew-csv-v2');
  assert.deepEqual(file.rows.map(({ account, title, note, category, movement }) =>
    [account, title, note, category, movement?.amount]),
  [['Poupança', 'Café', 'Pequeno-almoço', 'Refeições', 1250]]);
  assert.match(review.rows[0].error, /classification/i);
  assert.equal(review.rows[0].bank.specialType, 'null');
});

test('Cashew beta normalizes representation noise on either side of a cent and flags sub-cent amounts', async () => {
  const header = k_header.replace('amount,currency', 'amount,amount unpaid,currency') + ',extra';
  const rows = ['12.340000000000002', '-7.499999999999999', '1.235'].map(amount =>
    ['Wallet', amount, '', 'EUR', 'Example', '', '2026-11-12 12:00:00.000',
      String(!amount.startsWith('-')), 'default', 'Food', '', '', '', '', '', '', ''].join(','));
  const file = await parseImportContent('synthetic-beta.csv', [header, ...rows].join('\n'));
  assert.deepEqual(file.rows.slice(0, 2).map(row => row.movement?.amount), [1234, 750]);
  assert.match(file.rows[2].error, /fraction of a cent/i);
});

test('unverified Cashew beta metadata stays visible as a row error', async () => {
  const header = k_header.replace('amount,currency', 'amount,amount unpaid,currency') + ',extra';
  const betaRow = ['Wallet', '-12.34', '', 'EUR', 'Example', '', '2026-11-12 12:00:00.000',
    'false', 'default', 'Food', '', '', '', '', '', '', ''];
  const withUnpaid = betaRow.with(2, '4.21');
  const withExtra = betaRow.with(16, 'unknown metadata');
  const file = await parseImportContent('synthetic-beta.csv', [header, withUnpaid.join(','), withExtra.join(',')].join('\n'));
  const state = createFinancialState();
  const review = previewImportFile(state, file, { accounts: { Wallet: 'everyday' } });
  assert.match(review.rows[0].error, /amount unpaid/i);
  assert.match(review.rows[1].error, /extra/i);
  assert.deepEqual(applyTransactionImport(state, review, { 0: 'skip', 1: 'skip' }).transactions, []);
});

test('a Cashew-shaped export with a missing optional header cannot enter generic import', async () => {
  const header = k_header.replace(',objective', '');
  await assert.rejects(parseImportContent('synthetic.csv', [header, k_credit.slice(0, -1)].join('\n')),
    /unsupported Cashew.*header/i);
});

test('a Cashew layout upgrade still finds the original transaction after it was renamed', async () => {
  const state = createFinancialState();
  const options = { accounts: { Wallet: 'everyday' } };
  const original = await parseImportContent('original.csv', [k_header, k_expense].join('\n'));
  const draft = previewImportFile(state, original, options);
  const reviewed = reviseTransactionImport(state, draft, 0, { type: 'expense', category: 'groceries', title: 'Edited purchase' });
  const saved = applyTransactionImport(state, reviewed, {}, () => 'recorded-purchase');
  const betaHeader = k_header.replace('amount,currency', 'amount,amount unpaid,currency') + ',extra';
  const betaRow = k_expense.replace(',EUR,', ',,EUR,').replace(',false,null,', ',false,default,') + ',';
  const upgraded = await parseImportContent('upgraded.csv', [betaHeader, betaRow].join('\n'));
  const repeated = previewImportFile(saved, upgraded, options);
  assert.deepEqual(repeated.rows[0].possibleMatches.map(match => match.id), ['recorded-purchase']);
});

test('Cashew scheduled entries with no verified payment status cannot add cash movements', async () => {
  const rows = ['upcoming', 'subscription', 'repetitive'].map(type =>
    k_expense.replace(',false,null,', ',false,TransactionSpecialType.' + type + ','));
  const file = await parseImportContent('synthetic.csv', [k_header, ...rows].join('\n'));
  const state = createFinancialState();
  let review = previewImportFile(state, file, { accounts: { Wallet: 'everyday' } });
  for (const index of rows.keys()) {
    review = reviseTransactionImport(state, review, index, { type: 'expense', category: 'groceries' });
    assert.equal(review.rows[index].status, 'invalid');
    assert.match(review.rows[index].error, /payment status/i);
  }
  assert.deepEqual(applyTransactionImport(state, review, { 0: 'skip', 1: 'skip', 2: 'skip' }).transactions, []);
});
