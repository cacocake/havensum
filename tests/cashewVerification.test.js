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
