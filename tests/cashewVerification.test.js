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
