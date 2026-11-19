// IMPORT-2 follow-up: synthetic rows shaped like the owner's real v2 test
// export (K10-K12). No real export content is stored here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportContent } from '../src/importFiles.js';
import { previewImportFile } from '../src/importFileReview.js';
import { applyTransactionImport, reviseTransactionImport } from '../src/importReview.js';
import { createFinancialState } from './helpers/financialFixtures.js';
import { accountBalance, monthStats } from '../src/ledger.js';

const k_header = 'account,amount,amount unpaid,currency,title,note,date,income,type,category name,subcategory name,color,icon,emoji,budget,objective,extra';
const k_columns = k_header.split(',');
const k_moment = '2026-11-10 20:28:00.000';
const k_recurrence = 'repeat every 1 month';
const k_accountOptions = { accounts: { Carteira: 'everyday', 'Cartão Vale': 'shared' } };

function exportRow(fields) {
  const values = {
    currency: 'EUR', date: k_moment, type: 'default', color: '0XFF607D8B', icon: 'cutlery', ...fields
  };
  values.income = values.income ?? String(!String(values.amount ?? '').startsWith('-'));
  return k_columns.map(column => csvCell(values[column] ?? '')).join(',');
}

function csvCell(value) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function exportFile(rows) {
  return parseImportContent('synthetic-export.csv', Buffer.from([k_header, ...rows].join('\n'), 'utf8'));
}

function transferNote(from, to) {
  return `Transferred Balance\n${from} → ${to}`;
}

test('recurrence text in Cashew extra is shown read-only and no longer blocks an ordinary row (K10)', async () => {
  const file = await exportFile([
    exportRow({ account: 'Carteira', amount: '-4.5', title: 'Jantar', 'category name': 'Comer Fora', 'subcategory name': 'Restaurante', extra: k_recurrence })
  ]);
  const state = createFinancialState();
  const preview = previewImportFile(state, file, k_accountOptions);
  assert.equal(preview.rows[0].bank.sourceDetails.extra, k_recurrence);
  assert.match(preview.rows[0].error, /classification/i);
  const reviewed = reviseTransactionImport(state, preview, 0, { type: 'expense', category: 'groceries' });
  assert.equal(reviewed.rows[0].status, 'new');
  const saved = applyTransactionImport(state, reviewed, {}, () => 'dinner');
  assert.equal(saved.transactions.length, 1);
  assert.equal(monthStats(saved, '2026-11').spent, 450);
  assert.deepEqual(saved.events, state.events);
});

function transferLeg(account, amount, note, category = 'Correção do equilíbrio') {
  return exportRow({ account, amount, title: 'Mover dinheiro', note, 'category name': category, icon: 'charts' });
}

test('a Cashew transfer is suggested from its Transferred Balance note in any app language (K11)', async () => {
  const note = transferNote('Carteira', 'Cartão Vale');
  const file = await exportFile([
    transferLeg('Cartão Vale', '25.0', note),
    exportRow({ account: 'Carteira', amount: '-25.0', title: 'Almoço', 'category name': 'Comer Fora', extra: k_recurrence }),
    transferLeg('Carteira', '-25.0', note)
  ]);
  const state = createFinancialState();
  const preview = previewImportFile(state, file, k_accountOptions);
  assert.deepEqual(preview.rows.map(row => row.status), ['paired', 'invalid', 'new']);
  assert.equal(preview.rows[2].transaction.type, 'transfer');
  assert.equal(preview.rows[2].transaction.toAccount, 'shared');
  const saved = applyTransactionImport(state, preview, { 1: 'skip' }, () => 'note-transfer');
  assert.equal(accountBalance(saved, 'everyday', '2026-11-30'), 100000 - 2500);
  assert.equal(accountBalance(saved, 'shared', '2026-11-30'), 50000 + 2500);
  assert.equal(monthStats(saved, '2026-11').income, 0);
  assert.equal(monthStats(saved, '2026-11').spent, 0);
});

test('a Cashew transfer note must name both legs in the right direction, and the category alone suggests nothing (K11)', async () => {
  const state = createFinancialState();
  const cases = [
    [transferLeg('Carteira', '-25.0', transferNote('Cartão Vale', 'Carteira')), transferLeg('Cartão Vale', '25.0', transferNote('Cartão Vale', 'Carteira'))],
    [transferLeg('Carteira', '-25.0', transferNote('Carteira', 'Outra')), transferLeg('Cartão Vale', '25.0', transferNote('Carteira', 'Outra'))],
    [transferLeg('Carteira', '-25.0', '', 'Balance Correction'), transferLeg('Cartão Vale', '25.0', '', 'Balance Correction')],
    [transferLeg('Carteira', '-25.0', 'Carteira → Cartão Vale'), transferLeg('Cartão Vale', '25.0', 'Carteira → Cartão Vale')]
  ];
  for (const rows of cases) {
    const preview = previewImportFile(state, await exportFile(rows), k_accountOptions);
    assert.deepEqual(preview.rows.map(row => row.transaction.type), [undefined, undefined]);
  }
});
