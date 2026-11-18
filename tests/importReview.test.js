import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

test('edited stable IDs require a choice and only approved edits change the existing transaction', async () => {
  const { previewTransactionImport, applyTransactionImport } = await import('../src/importReview.js');
  const original = createTransaction();
  const state = createFinancialState({ transactions: [original] });
  const incoming = { ...original, amount: 2000 };
  const review = previewTransactionImport(state, [incoming]);

  assert.equal(review.rows[0].status, 'edited');
  assert.throws(() => applyTransactionImport(state, review, {}), /review choice/i);
  assert.deepEqual(applyTransactionImport(state, review, { 0: 'keep' }).transactions, [original]);
  const approved = applyTransactionImport(state, review, { 0: 'replace' });
  assert.deepEqual(approved.transactions, [incoming]);
  assert.equal(state.transactions[0].amount, 1234);
});

test('scoped source repeats are safe and an imported reference still reviews a matching manual purchase', async () => {
  const { previewTransactionImport, applyTransactionImport } = await import('../src/importReview.js');
  const sourcePurchase = createTransaction({ id: undefined, externalSource: 'synthetic-bank', externalId: '0001' });
  const empty = createFinancialState();
  const repeated = previewTransactionImport(empty, [sourcePurchase, sourcePurchase]);
  assert.deepEqual(repeated.rows.map(row => row.status), ['new', 'unchanged']);
  assert.equal(applyTransactionImport(empty, repeated, {}, () => 'synthetic-generated-id').transactions.length, 1);
  const manualState = createFinancialState({ transactions: [createTransaction()] });
  const manualMatch = previewTransactionImport(manualState, [sourcePurchase]);
  assert.equal(manualMatch.rows[0].status, 'possible');
});

test('a legacy numeric-zero expense ID still protects against excessive imported reimbursements', async () => {
  const { previewTransactionImport, applyTransactionImport } = await import('../src/importReview.js');
  const state = createFinancialState({ transactions: [createTransaction({ id: 0, amount: 1000 })] });
  const review = previewTransactionImport(state, [createTransaction({ id: 'payback', type: 'reimbursement', linkedId: 0, amount: 1001 })]);
  assert.equal(review.rows[0].status, 'invalid');
  assert.throws(() => applyTransactionImport(state, review, {}), /remains/);
  assert.equal(state.transactions.length, 1);
});

test('conflicting repeated IDs are invalid in preview and forward expense links validate as one batch', async () => {
  const { previewTransactionImport, applyTransactionImport } = await import('../src/importReview.js');
  const state = createFinancialState();
  const expense = createTransaction({ amount: 10000 });
  const conflicting = previewTransactionImport(state, [expense, { ...expense, amount: 20000 }]);
  assert.deepEqual(conflicting.rows.map(row => row.status), ['invalid', 'invalid']);
  assert.match(conflicting.rows[0].error, /duplicate.*ID/i);
  const payback = createTransaction({ id: 'payback', type: 'reimbursement', linkedId: expense.id, amount: 4000 });
  const review = previewTransactionImport(state, [payback, expense]);
  assert.deepEqual(review.rows.map(row => row.status), ['new', 'new']);
  const imported = applyTransactionImport(state, review, {});
  assert.deepEqual(imported.transactions, [payback, expense]);
});

test('an import review cannot overwrite a ledger that changed after preview', async () => {
  const { previewTransactionImport, applyTransactionImport } = await import('../src/importReview.js');
  const state = createFinancialState({ transactions: [createTransaction()] });
  const review = previewTransactionImport(state, [createTransaction({ amount: 2000 })]);
  const changedState = structuredClone(state);
  changedState.transactions[0].note = 'Edited after preview';
  assert.throws(() => applyTransactionImport(changedState, review, { 0: 'replace' }), /changed.*preview/i);
  assert.equal(changedState.transactions[0].note, 'Edited after preview');
});

test('external identity is scoped by source and account and changed source records require edit review', async () => {
  const { previewTransactionImport } = await import('../src/importReview.js');
  const original = createTransaction({ externalSource: 'synthetic-profile-a', externalId: '0001' });
  const state = createFinancialState({ transactions: [original] });
  const review = previewTransactionImport(state, [
    { ...original, id: undefined, amount: 2000 },
    { ...original, id: undefined, externalSource: 'synthetic-profile-b' },
    { ...original, id: undefined, account: 'shared' }
  ]);
  assert.deepEqual(review.rows.map(row => row.status), ['edited', 'new', 'new']);
  const legacy = createTransaction({ externalSource: 'synthetic-profile-a', externalId: 0 });
  const legacyReview = previewTransactionImport(createFinancialState({ transactions: [legacy] }), [{ ...legacy, id: undefined, externalId: '0' }]);
  assert.equal(legacyReview.rows[0].status, 'unchanged');
});

test('review shows invalid rows and a declined expense edit cannot allow an excessive payback', async () => {
  const { previewTransactionImport, applyTransactionImport } = await import('../src/importReview.js');
  const expense = createTransaction({ amount: 1000 });
  const state = createFinancialState({ transactions: [expense] });
  const invalid = previewTransactionImport(state, [createTransaction({ id: 'bad-date', date: '2026-02-30' })]);
  assert.equal(invalid.rows[0].status, 'invalid');
  assert.match(invalid.rows[0].error, /valid date/);
  const review = previewTransactionImport(state, [
    { ...expense, amount: 2000 },
    createTransaction({ id: 'payback', type: 'reimbursement', linkedId: expense.id, amount: 1500 })
  ]);
  assert.throws(() => applyTransactionImport(state, review, { 0: 'keep' }), /remains|reimbursements/);
  assert.equal(state.transactions.length, 1);
  assert.equal(applyTransactionImport(state, review, { 0: 'replace' }).transactions.length, 2);
});

test('a CSV row cannot edit a transaction when its ledger ID and source reference identify different purchases', async () => {
  const { previewTransactionImport, applyTransactionImport } = await import('../src/importReview.js');
  const manualPurchase = createTransaction({ id: 'manual' });
  const importedPurchase = createTransaction({ id: 'imported', externalSource: 'synthetic-bank-v1', externalId: '0001' });
  const state = createFinancialState({ transactions: [manualPurchase, importedPurchase] });
  const incoming = { ...importedPurchase, id: manualPurchase.id };
  const review = previewTransactionImport(state, [incoming]);

  assert.equal(review.rows[0].status, 'invalid');
  assert.match(review.rows[0].error, /match different transactions/);
  assert.throws(() => applyTransactionImport(state, review, { 0: 'replace' }), /match different transactions/);
  assert.deepEqual(state.transactions, [manualPurchase, importedPurchase]);
});

test('conflicting rows cannot both edit the same purchase through different identifiers', async () => {
  const { previewTransactionImport, applyTransactionImport } = await import('../src/importReview.js');
  const purchase = createTransaction({ id: 'recorded', externalSource: 'synthetic-bank-v1', externalId: '0001' });
  const state = createFinancialState({ transactions: [purchase] });
  const ledgerEdit = createTransaction({ id: purchase.id, amount: 1500 });
  const bankEdit = { ...purchase, id: undefined, amount: 2000 };
  const review = previewTransactionImport(state, [ledgerEdit, bankEdit]);

  assert.deepEqual(review.rows.map(row => row.status), ['invalid', 'invalid']);
  assert.throws(() => applyTransactionImport(state, review, { 0: 'replace', 1: 'replace' }), /conflicting duplicate/i);
  assert.deepEqual(state.transactions, [purchase]);
});

test('identical purchases remain distinct and reruns require an explicit duplicate decision', async () => {
  const { previewTransactionImport, applyTransactionImport } = await import('../src/importReview.js');
  const state = createFinancialState();
  const purchase = createTransaction({ id: undefined });
  let nextIdentifier = 0;
  const createIdentifier = () => `synthetic-import-${++nextIdentifier}`;
  const firstReview = previewTransactionImport(state, [purchase, purchase]);
  const firstImport = applyTransactionImport(state, firstReview, {}, createIdentifier);
  assert.equal(firstImport.transactions.length, 2);
  assert.notEqual(firstImport.transactions[0].id, firstImport.transactions[1].id);

  const repeated = previewTransactionImport(firstImport, [purchase]);
  assert.equal(repeated.rows[0].status, 'possible');
  assert.throws(() => applyTransactionImport(firstImport, repeated, {}, createIdentifier), /review choice/i);
  assert.equal(applyTransactionImport(firstImport, repeated, { 0: 'skip' }, createIdentifier).transactions.length, 2);
  assert.equal(applyTransactionImport(firstImport, repeated, { 0: 'add' }, createIdentifier).transactions.length, 3);
  assert.equal(state.transactions.length, 0);
});
