import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readImport } from '../src/files.web.js';
import { createWorkbook } from '../src/workbook.js';
import { importUnique, mergeThreeWay } from '../src/engine.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

test('workbook serialization preserves euro amounts, identities and transaction associations', async () => {
  const transactions = [
    createTransaction({ note: 'Synthetic café, with "quotes"\nand a second line', externalId: 'source-123' }),
    createTransaction({ id: 'payback', type: 'reimbursement', amount: 234, linkedId: 'weekly-shopping' }),
    createTransaction({ id: 'move', type: 'transfer', category: null, amount: 10000, toAccount: 'shared' }),
    createTransaction({ id: 'car-payment', amount: 18500, category: 'loan', loanId: 'car' })
  ];
  const state = createFinancialState({ transactions });
  const workbook = createWorkbook(ExcelJS, state, '2026-11');
  const bytes = await workbook.xlsx.writeBuffer();
  const imported = await readImport(new File([bytes], 'synthetic.xlsx'));

  assert.equal(imported.rows[0].amount, 12.34);
  assert.equal(imported.rows[0].note, transactions[0].note);
  assert.equal(imported.rows[0].externalId, 'source-123');
  assert.equal(imported.rows[1].linkedId, 'weekly-shopping');
  assert.equal(imported.rows[2].toAccount, 'shared');
  assert.equal(imported.rows[3].loanId, 'car');
  assert.equal(imported.accounts[0].openingBalance, 100000);
  assert.equal(imported.categories[0].budget, 20000);
});

test('the exported monthly summary separates net expenses, paybacks and cash', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ amount: 10000 }),
    createTransaction({ id: 'payback', type: 'reimbursement', amount: 4000, linkedId: 'weekly-shopping' }),
    createTransaction({ id: 'salary', type: 'income', amount: 200000 }),
    createTransaction({ id: 'move', type: 'transfer', amount: 50000, toAccount: 'shared' })
  ] });
  const summary = createWorkbook(ExcelJS, state, '2026-11').getWorksheet('Your month');

  assert.deepEqual([summary.getCell('B5').value, summary.getCell('B6').value, summary.getCell('B7').value, summary.getCell('B8').value], [2000, 60, 1940, 40]);
});

test('CSV parsing preserves accented text, commas, escaped quotes and embedded newlines', async () => {
  const csv = 'title,amount,date\r\n"Café, \"\"boa tarde\"\"\nsecond line",12.34,2026-11-10\r\n';
  const imported = await readImport(new File([csv], 'synthetic.csv'));

  assert.deepEqual(imported.rows, [{ title: 'Café, "boa tarde"\nsecond line', amount: '12.34', date: '2026-11-10' }]);
});

test('transaction-array JSON and full-backup JSON are distinguished without changing their cent units', async () => {
  const state = createFinancialState({ transactions: [createTransaction()] });
  const backup = await readImport(new File([JSON.stringify(state)], 'synthetic-backup.json'));
  const transactionFile = await readImport(new File([JSON.stringify(state.transactions)], 'synthetic-transactions.json'));

  assert.deepEqual(backup, { rows: state.transactions, backup: state });
  assert.deepEqual(transactionFile, { rows: state.transactions });
});

test('malformed JSON and JSON without a transactions array are rejected', async () => {
  await assert.rejects(readImport(new File(['{broken'], 'broken.json')), SyntaxError);
  await assert.rejects(readImport(new File(['{}'], 'empty.json')), /transactions array/);
});

test('a batch with an invalid row cannot mutate the existing ledger or partially append', () => {
  const state = createFinancialState({ transactions: [createTransaction()] });
  const originalState = structuredClone(state);
  const validRow = createTransaction({ id: 'new-valid', title: 'Another purchase' });
  const invalidRow = createTransaction({ id: 'invalid', title: 'Broken row', amount: -1 });

  assert.throws(() => importUnique(state, [validRow, invalidRow]), /amount/);
  assert.deepEqual(state, originalState);
});

test('a payback can precede its original expense in the same import batch', () => {
  const state = createFinancialState();
  const expense = createTransaction({ amount: 10000 });
  const reimbursement = createTransaction({ id: 'payback', type: 'reimbursement', amount: 10000, linkedId: expense.id });

  assert.deepEqual(importUnique(state, [reimbursement, expense]).added, [reimbursement, expense]);
});

test('a batch cannot over-refund an expense through multiple individually valid paybacks', () => {
  const expense = createTransaction({ amount: 10000 });
  const firstPayback = createTransaction({ id: 'first-payback', type: 'reimbursement', title: 'First payback', amount: 6000, linkedId: expense.id });
  const secondPayback = createTransaction({ ...firstPayback, id: 'second-payback', title: 'Second payback' });

  assert.throws(() => importUnique(createFinancialState(), [expense, firstPayback, secondPayback]), /reimbursements|remains/i);
});

test('unchanged-side deletions merge while edit-versus-delete requires explicit review', () => {
  const base = createFinancialState({ transactions: [createTransaction()] });
  const local = structuredClone(base);
  local.transactions = [];

  assert.deepEqual(mergeThreeWay(base, local, base).result.transactions, []);
  const remote = structuredClone(base);
  remote.transactions[0].amount = 1500;
  const merged = mergeThreeWay(base, local, remote);

  assert.deepEqual(merged.conflicts.map(({ collection, field }) => ({ collection, field })), [{ collection: 'transactions', field: '$record' }]);
});

test('independent new records merge without changing any input', () => {
  const base = createFinancialState();
  const local = createFinancialState({ transactions: [createTransaction()] });
  const remote = createFinancialState({ transactions: [createTransaction({ id: 'remote-purchase' })] });
  const originals = structuredClone([base, local, remote]);
  const result = mergeThreeWay(base, local, remote);

  assert.deepEqual(result.result.transactions.map(transaction => transaction.id), ['weekly-shopping', 'remote-purchase']);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual([base, local, remote], originals);
});

test('concurrent frozen-plan edits conflict as whole snapshots', () => {
  const base = createFinancialState({ plan: { revision: 1, months: {} } });
  const local = createFinancialState({ plan: { revision: 2, months: { '2026-11': { balance: 10000 } } } });
  const remote = createFinancialState({ plan: { revision: 2, months: { '2026-11': { balance: 20000 } } } });
  const merged = mergeThreeWay(base, local, remote);

  assert.equal(merged.conflicts[0].field, '$plan');
  assert.deepEqual(merged.result.plan, local.plan);
  assert.deepEqual(mergeThreeWay(base, base, remote).result.plan, remote.plan);
});
