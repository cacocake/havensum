// IMPORT-2: synthetic rows that mirror the published Cashew export (K01).
// Everything beyond the ordinary EUR rows verified from v6.7.5+524 is
// unverified against a real export.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportContent } from '../src/importFiles.js';
import { previewImportFile } from '../src/importFileReview.js';
import { applyTransactionImport, reviseTransactionImport } from '../src/importReview.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';
import { accountBalance, monthStats } from '../src/ledger.js';
import { isSuggestedTransferActive } from '../src/cashewReview.js';

const k_byteOrderMark = '﻿';
const k_publishedHeader = 'account,amount,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective';
const k_betaHeader = 'account,amount,amount unpaid,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective,extra';
const k_publishedColumns = k_publishedHeader.split(',');
const k_betaColumns = k_betaHeader.split(',');

function publishedRow(fields) {
  const values = { currency: 'EUR', income: 'false', type: 'null', ...fields };
  return k_publishedColumns.map(column => csvCell(values[column] ?? '')).join(',');
}

function betaRow(fields) {
  const values = { currency: 'EUR', income: 'false', type: 'default', ...fields };
  return k_betaColumns.map(column => csvCell(values[column] ?? '')).join(',');
}

function csvCell(value) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function cashewFile(header, rows) {
  return parseImportContent('synthetic-cashew.csv', Buffer.from(k_byteOrderMark + [header, ...rows].join('\r\n'), 'utf8'));
}

const k_cafe = {
  account: 'Conta Poupança', amount: '-3.2', title: 'Café São João', note: 'Pão de açúcar',
  date: '2026-11-12 08:15:00.000', 'category name': 'Refeições', 'subcategory name': 'Pequeno-almoço'
};

test('both Cashew layouts keep UTF-8 accents and match an accented Havensum account by name', async () => {
  const state = createFinancialState({
    accounts: [{ id: 'poupanca', name: 'Conta Poupança', tag: 'Personal', openingBalance: 0 }]
  });
  for (const file of [await cashewFile(k_publishedHeader, [publishedRow(k_cafe)]), await cashewFile(k_betaHeader, [betaRow(k_cafe)])]) {
    const [row] = file.rows;
    assert.deepEqual([row.account, row.title, row.note, row.category, row.movement.amount],
      ['Conta Poupança', 'Café São João', 'Pão de açúcar', 'Refeições / Pequeno-almoço', 320]);
    const review = previewImportFile(state, file);
    assert.equal(review.rows[0].transaction.account, 'poupanca');
  }
});

test('both Cashew layouts read Dart double amounts as exact integer cents and flag a fraction of a cent', async () => {
  const amounts = ['-5.0', '1234567.89', '-0.1', '-12.340000000000002', '7.499999999999999', '-1.235', '-0.0'];
  const expected = [500, 123456789, 10, 1234, 750];
  for (const [header, makeRow] of [[k_publishedHeader, publishedRow], [k_betaHeader, betaRow]]) {
    const file = await cashewFile(header, amounts.map(amount => makeRow({ ...k_cafe, amount, income: String(!amount.startsWith('-')) })));
    assert.deepEqual(file.rows.slice(0, expected.length).map(row => row.movement?.amount), expected, header);
    assert.match(file.rows[5].error, /fraction of a cent/i);
    assert.match(file.rows[6].error, /positive/i);
  }
});

async function importReviewed(state, file, options, changes, id) {
  const preview = previewImportFile(state, file, options);
  const reviewed = reviseTransactionImport(state, preview, 0, changes);
  return applyTransactionImport(state, reviewed, {}, () => id);
}

test('a repeated Cashew row is still offered as a match after Havensum renames its account and category', async () => {
  const initial = createFinancialState({
    accounts: [{ id: 'poupanca', name: 'Conta Poupança', tag: 'Personal', openingBalance: 0 }],
    categories: [{ id: 'meals', name: 'Refeições', kind: 'Variable' }]
  });
  const file = await cashewFile(k_publishedHeader, [publishedRow({ ...k_cafe, 'subcategory name': '' })]);
  const saved = await importReviewed(initial, file, {}, { type: 'expense', category: 'meals' }, 'recorded-cafe');
  const renamed = {
    ...saved,
    accounts: [{ ...saved.accounts[0], name: 'Poupança antiga' }],
    categories: [{ ...saved.categories[0], name: 'Comida' }]
  };
  const unmapped = previewImportFile(renamed, file);
  assert.match(unmapped.rows[0].error, /map this cashew account/i);
  const repeated = previewImportFile(renamed, file, { accounts: { 'Conta Poupança': 'poupanca' } });
  assert.equal(repeated.rows[0].transaction.category, undefined);
  assert.deepEqual(repeated.rows[0].possibleMatches.map(match => match.id), ['recorded-cafe']);
  const classified = reviseTransactionImport(renamed, repeated, 0, { type: 'expense', category: 'meals' });
  assert.equal(classified.rows[0].status, 'possible');
});

test('a Cashew-side account rename is matched once the row is classified like the recorded one', async () => {
  const state = createFinancialState();
  const options = { accounts: { 'Conta Poupança': 'everyday', 'Poupança nova': 'everyday' } };
  const original = await cashewFile(k_publishedHeader, [publishedRow(k_cafe)]);
  const changes = { type: 'expense', category: 'groceries' };
  const saved = await importReviewed(state, original, options, changes, 'recorded-cafe');
  const renamedSource = await cashewFile(k_betaHeader, [betaRow({ ...k_cafe, account: 'Poupança nova' })]);
  const repeated = previewImportFile(saved, renamedSource, options);
  assert.deepEqual(repeated.rows[0].possibleMatches, []);
  const classified = reviseTransactionImport(saved, repeated, 0, changes);
  assert.equal(classified.rows[0].status, 'possible');
  assert.deepEqual(classified.rows[0].possibleMatches.map(match => match.id), ['recorded-cafe']);
});

test('a Cashew payback links to an original expense later in the same file and offsets only its month', async () => {
  const payback = publishedRow({ ...k_cafe, amount: '1.2', title: 'Ana paid me back', income: 'true', date: '2026-11-02 09:00:00.000' });
  const dinner = publishedRow({ ...k_cafe, amount: '-30.0', title: 'Dinner', date: '2026-10-30 21:00:00.000' });
  const file = await cashewFile(k_publishedHeader, [payback, dinner]);
  const state = createFinancialState();
  const options = { accounts: { 'Conta Poupança': 'everyday' } };
  let review = previewImportFile(state, file, options);
  review = reviseTransactionImport(state, review, 1, { type: 'expense', category: 'groceries', id: 'dinner-in-file' });
  review = reviseTransactionImport(state, review, 0, { type: 'reimbursement', linkedId: 'dinner-in-file' });
  assert.deepEqual(review.rows.map(row => row.status), ['new', 'new']);
  const withoutExpense = reviseTransactionImport(state, review, 1, { type: undefined });
  assert.equal(withoutExpense.rows[0].status, 'invalid');
  assert.match(withoutExpense.rows[0].error, /linked expense no longer exists/i);
  const saved = applyTransactionImport(state, review, {}, () => 'payback-id');
  assert.equal(monthStats(saved, '2026-10').spent, 2880);
  assert.equal(monthStats(saved, '2026-11').income, 0);
  assert.equal(monthStats(saved, '2026-11').spent, 0);
  assert.equal(accountBalance(saved, 'everyday', '2026-11-30'), 100000 - 3000 + 120);
});

test('a paid Cashew scheduled entry needs a classification and then imports like an ordinary row (K04)', async () => {
  const scheduledTypes = ['TransactionSpecialType.upcoming', 'TransactionSpecialType.subscription', 'TransactionSpecialType.repetitive'];
  const published = scheduledTypes.map(type => publishedRow({ ...k_cafe, type }));
  const beta = [['upcoming', ''], ['subscription', '0'], ['repetitive', '0.0'], ['upcoming', '4.21']]
    .map(([type, unpaid]) => betaRow({ ...k_cafe, type, 'amount unpaid': unpaid }));
  const state = createFinancialState();
  const options = { accounts: { 'Conta Poupança': 'everyday' } };
  for (const file of [await cashewFile(k_publishedHeader, published), await cashewFile(k_betaHeader, beta)]) {
    let review = previewImportFile(state, file, options);
    for (const index of scheduledTypes.keys()) {
      assert.match(review.rows[index].bank.scheduledNote, /scheduled cashew entry/i);
      assert.match(review.rows[index].error, /classification/i);
      review = reviseTransactionImport(state, review, index, { type: 'expense', category: 'groceries' });
      assert.equal(review.rows[index].status, 'new');
    }
    const choices = { 3: 'skip' };
    const saved = applyTransactionImport(state, review, choices, (() => {
      let next = 0;
      return () => `scheduled-${next++}`;
    })());
    assert.equal(saved.transactions.length, 3);
    assert.equal(monthStats(saved, '2026-11').spent, 960);
  }
  const unpaid = (await cashewFile(k_betaHeader, beta)).rows[3];
  assert.match(unpaid.error, /amount unpaid/i);
});

test('Cashew budget and objective are shown read-only and category styling is never imported (K07)', async () => {
  const styled = {
    ...k_cafe, color: '0xff4caf50', icon: 'coffee.png', emoji: '☕', budget: 'Orçamento mensal', objective: 'Férias'
  };
  const state = createFinancialState();
  for (const file of [await cashewFile(k_publishedHeader, [publishedRow(styled)]), await cashewFile(k_betaHeader, [betaRow(styled)])]) {
    const preview = previewImportFile(state, file, { accounts: { 'Conta Poupança': 'everyday' } });
    assert.deepEqual(preview.rows[0].bank.sourceDetails, { budget: 'Orçamento mensal', objective: 'Férias' });
    const reviewed = reviseTransactionImport(state, preview, 0, { type: 'expense', category: 'groceries' });
    const saved = applyTransactionImport(state, reviewed, {}, () => 'styled-cafe');
    assert.deepEqual(saved.categories, state.categories);
    assert.deepEqual(saved.accounts, state.accounts);
    assert.deepEqual(saved.plans, state.plans);
    assert.deepEqual(saved.events, state.events);
    assert.equal(saved.transactions[0].note, 'Pão de açúcar');
    assert.deepEqual(Object.keys(saved.transactions[0]).filter(key => /budget|objective|emoji|icon|color/i.test(key)), []);
  }
});

function balanceCorrection(account, amount, date = '2026-11-12 23:40:00.123', route = 'Carteira → Poupança') {
  const income = String(!amount.startsWith('-'));
  return publishedRow({
    account, amount, income, date, title: 'Transfer', note: `Transferred Balance\n${route}`, 'category name': 'Balance Correction'
  });
}

test('a unique opposite Balance Correction row is preselected as a suggested transfer the owner can change (K05)', async () => {
  const file = await cashewFile(k_publishedHeader, [
    balanceCorrection('Carteira', '-36.4'), publishedRow(k_cafe), balanceCorrection('Poupança', '36.4')
  ]);
  const state = createFinancialState();
  const options = { accounts: { Carteira: 'everyday', Poupança: 'shared', 'Conta Poupança': 'everyday' } };
  const preview = previewImportFile(state, file, options);
  assert.deepEqual(preview.rows.map(row => row.status), ['new', 'invalid', 'paired']);
  assert.equal(preview.rows[0].transaction.type, 'transfer');
  assert.equal(preview.rows[0].transaction.toAccount, 'shared');
  assert.equal(preview.rows[0].bank.suggestedCounterpartRow, 4);
  assert.equal(preview.rows[2].bank.suggestedCounterpartRow, 2);
  const saved = applyTransactionImport(state, preview, { 1: 'skip' }, () => 'suggested-transfer');
  assert.equal(saved.transactions.length, 1);
  assert.equal(accountBalance(saved, 'everyday', '2026-11-30'), 100000 - 3640);
  assert.equal(accountBalance(saved, 'shared', '2026-11-30'), 50000 + 3640);
  assert.equal(monthStats(saved, '2026-11').income, 0);
  assert.equal(monthStats(saved, '2026-11').spent, 0);

  const changed = reviseTransactionImport(state, preview, 0, { type: 'expense', category: 'groceries' });
  assert.deepEqual(changed.rows.map(row => row.status), ['new', 'invalid', 'invalid']);
  assert.equal(changed.rows[2].transaction.type, undefined);
});

test('Cashew suggests no transfer when the opposite Balance Correction row is ambiguous or differs (K05)', async () => {
  const options = { accounts: { Carteira: 'everyday', Poupança: 'shared' } };
  const state = createFinancialState();
  const cases = [
    [balanceCorrection('Carteira', '-10.0'), balanceCorrection('Poupança', '10.0'), balanceCorrection('Poupança', '10.0')],
    [balanceCorrection('Carteira', '-10.0'), balanceCorrection('Poupança', '10.0', '2026-11-12 23:41:00.123')],
    [balanceCorrection('Carteira', '-10.0'), balanceCorrection('Poupança', '10.01')],
    [balanceCorrection('Carteira', '-10.0'), balanceCorrection('Carteira', '10.0')],
    [balanceCorrection('Carteira', '-10.0'), publishedRow({ account: 'Poupança', amount: '10.0', income: 'true', title: 'Transfer', date: '2026-11-12 23:40:00.123', 'category name': 'Other' })]
  ];
  for (const rows of cases) {
    const preview = previewImportFile(state, await cashewFile(k_publishedHeader, rows), options);
    assert.deepEqual(preview.rows.map(row => row.transaction.type), rows.map(() => undefined));
    assert.deepEqual(preview.rows.map(row => row.bank.suggestedCounterpartRow), rows.map(() => undefined));
  }
});

const k_carLoan = { id: 'car', name: 'Car loan', remaining: 500000, original: 800000, payment: 18500, start: '2026-01', end: '2029-12', account: 'everyday' };

function debtRow(amount, title) {
  const income = String(!amount.startsWith('-'));
  return publishedRow({ ...k_cafe, account: 'Carteira', amount, income, title, type: 'TransactionSpecialType.debt', 'category name': 'Dívidas', 'subcategory name': '' });
}

test('a Cashew borrowing row imports only once a Havensum loan is picked, and its sign decides proceeds or repayment (K02/K03)', async () => {
  const state = createFinancialState({ loans: [k_carLoan] });
  const file = await cashewFile(k_publishedHeader, [debtRow('2000.0', 'Borrowed from bank'), debtRow('-185.0', 'Loan instalment')]);
  const options = { accounts: { Carteira: 'everyday' } };
  let review = previewImportFile(state, file, options);
  assert.deepEqual(review.rows.map(row => row.bank.loanRequired), [true, true]);
  assert.deepEqual(review.rows.map(row => row.status), ['invalid', 'invalid']);

  const attempts = [
    [0, { type: 'reimbursement', linkedId: null }, /choose the havensum loan/i],
    [0, { type: 'reimbursement', linkedId: null, loanId: 'unknown-loan' }, /choose the havensum loan/i],
    [0, { type: 'income', category: 'salary', loanId: 'car' }, /loan proceeds/i],
    [1, { type: 'expense', category: 'groceries', loanId: 'car' }, /loan category/i],
    [1, { type: 'expense', category: 'loan' }, /choose the havensum loan/i]
  ];
  for (const [index, changes, message] of attempts) {
    const attempt = reviseTransactionImport(state, review, index, changes);
    assert.equal(attempt.rows[index].status, 'invalid');
    assert.match(attempt.rows[index].error, message);
  }

  review = reviseTransactionImport(state, review, 0, { type: 'reimbursement', linkedId: null, loanId: 'car' });
  review = reviseTransactionImport(state, review, 1, { type: 'expense', category: 'loan', loanId: 'car' });
  assert.deepEqual(review.rows.map(row => row.status), ['new', 'new']);
  let next = 0;
  const saved = applyTransactionImport(state, review, {}, () => `debt-${next++}`);
  assert.deepEqual(saved.transactions.map(({ type, amount, loanId }) => [type, amount, loanId]),
    [['reimbursement', 200000, 'car'], ['expense', 18500, 'car']]);
  assert.deepEqual(saved.loans, state.loans);
  assert.equal(accountBalance(saved, 'everyday', '2026-11-30'), 100000 + 200000 - 18500);
  assert.equal(monthStats(saved, '2026-11').income, 0);
  assert.equal(monthStats(saved, '2026-11').spent, 18500);
});

test('Cashew borrowing proceeds cannot be linked to an expense and lending stays blocked (K02/K03)', async () => {
  const expense = createTransaction({ id: 'old-expense', date: '2026-10-14', amount: 300000 });
  const state = createFinancialState({ loans: [k_carLoan], transactions: [expense] });
  const lending = publishedRow({ ...k_cafe, account: 'Carteira', amount: '-50.0', type: 'TransactionSpecialType.credit' });
  const file = await cashewFile(k_publishedHeader, [debtRow('2000.0', 'Borrowed'), lending]);
  const review = previewImportFile(state, file, { accounts: { Carteira: 'everyday' } });
  const linked = reviseTransactionImport(state, review, 0, { type: 'reimbursement', linkedId: 'old-expense', loanId: 'car' });
  assert.match(linked.rows[0].error, /loan proceeds/i);
  assert.equal(review.rows[1].bank.loanRequired, undefined);
  const lendingAsExpense = reviseTransactionImport(state, review, 1, { type: 'expense', category: 'loan', loanId: 'car' });
  assert.equal(lendingAsExpense.rows[1].status, 'invalid');
  assert.match(lendingAsExpense.rows[1].error, /lending/i);
});

test('malformed Cashew cells stay row errors or warnings and invalid account creation choices are refused', async () => {
  const rows = [
    publishedRow({ ...k_cafe, amount: '-1,234.56' }),
    publishedRow({ ...k_cafe, amount: '€5' }),
    publishedRow({ ...k_cafe, amount: '1,000' }),
    publishedRow({ ...k_cafe, amount: '-1.000' }),
    publishedRow({ ...k_cafe, income: 'yes' }) + ',unexpected',
    publishedRow({ ...k_cafe, income: '' })
  ];
  const file = await cashewFile(`${k_publishedHeader},,`, rows);
  assert.equal(file.cashew.profile, 'cashew-csv-v1');
  assert.match(file.rows[0].error, /signed EUR amount/i);
  assert.match(file.rows[1].error, /signed EUR amount/i);
  assert.match(file.rows[2].error, /signed EUR amount/i);
  assert.match(file.rows[3].error, /signed EUR amount/i);
  assert.match(file.rows[4].error, /extra values/i);
  const state = createFinancialState();
  const review = previewImportFile(state, file, { accounts: { 'Conta Poupança': 'everyday' } });
  assert.match(review.rows[5].bank.sourceWarning, /income flag is missing or unrecognized/i);
  const invalidChoices = [
    [{ sourceName: 'Conta Poupança', id: 'everyday' }],
    [{ sourceName: 'Not in this file', id: 'new-account' }],
    [{ sourceName: 'Conta Poupança', id: '' }]
  ];
  for (const newAccounts of invalidChoices) {
    assert.throws(() => previewImportFile(state, file, { newAccounts }), /distinct new account/i);
  }
});

test('a Cashew borrowing credit is never suggested or accepted as a transfer leg (K02 review fix)', async () => {
  const state = createFinancialState({ loans: [k_carLoan] });
  const borrowedLeg = publishedRow({
    account: 'Poupança', amount: '36.4', income: 'true', title: 'Transfer', date: '2026-11-12 23:40:00.123',
    type: 'TransactionSpecialType.debt', note: 'Transferred Balance\nCarteira → Poupança', 'category name': 'Balance Correction'
  });
  const file = await cashewFile(k_publishedHeader, [balanceCorrection('Carteira', '-36.4'), borrowedLeg]);
  const preview = previewImportFile(state, file, { accounts: { Carteira: 'everyday', Poupança: 'shared' } });
  assert.deepEqual(preview.rows.map(row => row.transaction.type), [undefined, undefined]);
  assert.equal(preview.rows[1].bank.suggestedCounterpartRow, undefined);
  const manual = reviseTransactionImport(state, preview, 0, { type: 'transfer', counterpartIndex: 1 });
  assert.equal(manual.rows[1].status, 'invalid');
  assert.equal(manual.rows[0].pair, undefined);
  assert.match(manual.rows[0].error, /matching credit/i);
});

test('the transfer suggestion note applies only while the suggested pair is kept (K05 review fix)', async () => {
  const file = await cashewFile(k_publishedHeader, [balanceCorrection('Carteira', '-36.4'), balanceCorrection('Poupança', '36.4')]);
  const state = createFinancialState();
  const preview = previewImportFile(state, file, { accounts: { Carteira: 'everyday', Poupança: 'shared' } });
  assert.deepEqual(preview.rows.map(row => isSuggestedTransferActive(preview, row)), [true, true]);
  const changed = reviseTransactionImport(state, preview, 0, { type: 'expense', category: 'groceries' });
  assert.deepEqual(changed.rows.map(row => isSuggestedTransferActive(changed, row)), [false, false]);
});
