import test from 'node:test';
import assert from 'node:assert/strict';
import { readImport } from '../src/files.web.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

test('a generic CSV timestamp keeps the calendar date printed by the source', async () => {
  const { previewImportFile } = await import('../src/importFileReview.js');
  const imported = await readImport(new File([
    'datetime,title,amount,account,category\n2026-06-01T00:15:00+01:00,Midnight purchase,3.00,Everyday,Groceries\n'
  ], 'generic-timestamps.csv'));
  const review = previewImportFile(createFinancialState(), imported);
  assert.equal(review.rows[0].status, 'new');
  assert.equal(review.rows[0].transaction.date, '2026-06-01');
});

test('CSV export names a legacy transaction that is missing its identifier', async () => {
  const { createTransactionCsv } = await import('../src/csvExchange.js');
  const legacyPurchase = createTransaction({ id: undefined, title: 'Historic receipt' });
  const state = createFinancialState({ transactions: [legacyPurchase] });
  assert.throws(() => createTransactionCsv(state), /Historic receipt.*identifier/i);
});

test('canonical CSV exports readable EUR amounts and stable transfer and payback associations', async () => {
  const { createTransactionCsv } = await import('../src/csvExchange.js');
  const state = createFinancialState({ transactions: [
    createTransaction({ id: '0007', title: 'Café, "boa tarde"', note: 'First line\nSecond line', kind: 'Variable' }),
    createTransaction({ id: 'payback', type: 'reimbursement', linkedId: '0007', amount: 234 }),
    createTransaction({ id: 'transfer', type: 'transfer', category: null, toAccount: 'shared', amount: 10000 }),
    createTransaction({ id: 'salary', type: 'income', category: 'salary', amount: 200000 })
  ] });
  const csv = createTransactionCsv(state);
  const imported = await readImport(new File([csv], 'Havensum-transactions.csv'));

  assert.equal(imported.rows.length, 4);
  assert.deepEqual(imported.rows.map(row => [row.schema_version, row.type, row.amount, row.currency]), [
    ['1', 'expense', '12.34', 'EUR'],
    ['1', 'reimbursement', '2.34', 'EUR'],
    ['1', 'transfer', '100.00', 'EUR'],
    ['1', 'income', '2000.00', 'EUR']
  ]);
  assert.match(csv, /\r\n/);
  assert.equal(imported.rows[0].id, "'0007");
  assert.equal(imported.rows[0].title, "'Café, \"boa tarde\"");
  assert.equal(imported.rows[0].note, "'First line\nSecond line");
  assert.equal(imported.rows[1].linked_id, "'0007");
  assert.equal(imported.rows[2].to_account_id, "'shared");
  assert.equal(imported.rows[3].account_name, "'Everyday");
});

test('malformed JSON transaction identifiers cannot enter the ledger or be flattened into CSV text', async () => {
  const { previewImportFile } = await import('../src/importFileReview.js');
  const { createTransactionCsv } = await import('../src/csvExchange.js');
  const base = { title: 'Purchase', amount: '1.00', date: '2026-11-10', account: 'everyday', category: 'groceries' };
  const review = previewImportFile(createFinancialState(), { rows: [{ ...base, id: {} }, { ...base, id: 0.5 }] });
  assert.deepEqual(review.rows.map(row => row.status), ['invalid', 'invalid']);
  assert.throws(() => createTransactionCsv(createFinancialState({ transactions: [createTransaction({ id: {} })] })), /identifier/i);
});

test('an explicitly cleared account mapping is not silently restored from a matching name', async () => {
  const { normalizeImportRows } = await import('../src/importNormalization.js');
  const state = createFinancialState();
  const data = { rows: [{ title: 'Purchase', amount: '1.00', date: '2026-11-10', account: 'Everyday', category: 'Groceries' }] };
  assert.throws(() => normalizeImportRows(state, data, { accounts: { Everyday: '' } }), /map the account/i);
});

test('manual field mappings honor the selected note and typed legacy dates and cent amounts', async () => {
  const { normalizeImportRows } = await import('../src/importNormalization.js');
  const rows = normalizeImportRows(createFinancialState(), { rows: [{
    label: 'Mapped purchase', total: 1250, booked: new Date('2026-11-10T00:00:00Z'), pocket: 'shared', group: 'shopping', note: 'Not selected', details: 'Chosen note'
  }] }, { unit: 'cents', mapping: { title: 'label', amount: 'total', date: 'booked', account: 'pocket', category: 'group', note: 'details', type: '' } });
  assert.equal(rows[0].note, 'Chosen note');
  assert.equal(rows[0].amount, 1250);
  assert.equal(rows[0].date, '2026-11-10');
});

test('snake-case links in generic CSV cannot silently become unlinked balance adjustments', async () => {
  const { previewImportFile } = await import('../src/importFileReview.js');
  const state = createFinancialState({ transactions: [createTransaction({ id: 'original', amount: 1000 })] });
  const data = { rows: [{ title: 'Refund', type: 'reimbursement', amount: '4.00', date: '2026-11-11', account: 'everyday', linked_id: 'original' }] };
  const review = previewImportFile(state, data);
  assert.equal(review.rows[0].transaction.linkedId, 'original');
  assert.equal(review.rows[0].status, 'new');
  data.rows[0].linked_id = 'missing-expense';
  assert.equal(previewImportFile(state, data).rows[0].status, 'invalid');
});

test('a friendly Currency header cannot hide a non-EUR amount', async () => {
  const { previewImportFile } = await import('../src/importFileReview.js');
  const review = previewImportFile(createFinancialState(), { rows: [{
    Date: '2026-11-10', Title: 'Foreign purchase', Amount: '10.00', Account: 'Everyday', Category: 'Groceries', Currency: 'USD'
  }] });
  assert.equal(review.rows[0].status, 'invalid');
  assert.match(review.rows[0].error, /EUR/);
});

test('CSV export rejects invalid control fields rather than emitting spreadsheet expressions as types', async () => {
  const { createTransactionCsv } = await import('../src/csvExchange.js');
  assert.throws(() => createTransactionCsv(createFinancialState({ transactions: [createTransaction({ type: '=1+1' })] })), /valid transaction type/);
  assert.throws(() => createTransactionCsv(createFinancialState({ transactions: [createTransaction({ kind: '=1+1' })] })), /behaviour/);
  assert.throws(() => createTransactionCsv(createFinancialState({ transactions: [createTransaction({ amount: -1 })] })), /amount/);
});

test('CSV round trips retain existing numeric-zero identifiers and their reimbursement links', async () => {
  const { createTransactionCsv } = await import('../src/csvExchange.js');
  const { previewImportFile } = await import('../src/importFileReview.js');
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 0, amount: 1000 }),
    createTransaction({ id: 'payback', type: 'reimbursement', linkedId: 0, amount: 400 })
  ] });
  const imported = await readImport(new File([createTransactionCsv(state)], 'Havensum.csv'));
  const review = previewImportFile(state, imported);
  assert.deepEqual(review.rows.map(row => row.status), ['unchanged', 'unchanged']);
  assert.equal(review.rows[0].transaction.id, 0);
  assert.equal(review.rows[1].transaction.linkedId, 0);
});

test('pending payback-task fields and unknown loan or behaviour inputs are rejected instead of discarded', async () => {
  const { previewImportFile } = await import('../src/importFileReview.js');
  const state = createFinancialState();
  const base = { title: 'Purchase', amount: '12.34', date: '2026-11-10', account: 'everyday', category: 'groceries' };
  const review = previewImportFile(state, { rows: [
    { ...base, expect_payback: 'true' },
    { ...base, kind: 'Unknown' },
    { ...base, loanId: 'unregistered' }
  ] });
  assert.deepEqual(review.rows.map(row => row.status), ['invalid', 'invalid', 'invalid']);
  assert.match(review.rows[0].error, /payback.task.*not.*implemented/i);
  assert.match(review.rows[1].error, /behaviour/);
  assert.match(review.rows[2].error, /loan/);
});

test('file preview counts invalid rows without partially importing valid neighbours', async () => {
  const { previewImportFile } = await import('../src/importFileReview.js');
  const { applyTransactionImport } = await import('../src/importReview.js');
  const state = createFinancialState();
  const baseRow = { title: 'Valid purchase', amount: '12.34', date: '2026-11-10', account: 'everyday', category: 'groceries' };
  const review = previewImportFile(state, { rows: [
    baseRow, { ...baseRow, amount: '1,234' }, { ...baseRow, currency: 'USD' },
    { ...baseRow, type: 'bank-inflow' }, { ...baseRow, date: '2026-02-30' }
  ] });
  assert.deepEqual(review.rows.map(row => row.status), ['new', 'invalid', 'invalid', 'invalid', 'invalid']);
  assert.match(review.rows[1].error, /two decimals/);
  assert.match(review.rows[2].error, /EUR/);
  assert.match(review.rows[3].error, /explicit/);
  assert.match(review.rows[4].error, /valid date/);
  assert.throws(() => applyTransactionImport(state, review, {}, () => 'new-row'), /Row 2/);
  assert.equal(state.transactions.length, 0);
});

test('missing categories and unknown accounts require explicit mappings instead of defaulting to a pocket', async () => {
  const { normalizeImportRows } = await import('../src/importNormalization.js');
  const state = createFinancialState();
  const data = { rows: [{ Title: 'Unmapped purchase', Amount: '10.00', Date: '2026-11-10', Account: 'Imported pocket', Category: '' }] };
  assert.throws(() => normalizeImportRows(state, data), /map the account/i);
  assert.throws(() => normalizeImportRows(state, data, { accounts: { 'Imported pocket': 'shared' } }), /map the category/i);
  const rows = normalizeImportRows(state, data, { accounts: { 'Imported pocket': 'shared' }, categories: { '': 'groceries' } });
  assert.equal(rows[0].account, 'shared');
  assert.equal(rows[0].category, 'groceries');
  assert.equal(state.transactions.length, 0);
});

test('the blank quick-entry template accepts Portuguese decimals, paths and quoted notes without sample purchases', async () => {
  const { createQuickEntryTemplate } = await import('../src/csvExchange.js');
  const { normalizeImportRows } = await import('../src/importNormalization.js');
  const template = await readImport(new File([createQuickEntryTemplate()], 'Havensum-template.csv'));
  assert.deepEqual(template.rows, []);
  const state = createFinancialState({ categories: [
    { id: 'home', name: 'Casa', kind: 'Variable' },
    { id: 'child', name: 'Café', parentId: 'home' }
  ] });
  const imported = await readImport(new File(['\uFEFFDate;Title;Amount;Account;Category;Note\r\n2026-11-10;Café;12,34;Everyday;Casa / Café;"A comma, and \"\"quotes\"\""\r\n'], 'portugal.csv'));
  const rows = normalizeImportRows(state, imported);
  assert.deepEqual(rows, [{
    id: undefined, type: 'expense', date: '2026-11-10', title: 'Café', amount: 1234,
    account: 'everyday', category: 'child', note: 'A comma, and "quotes"'
  }]);
});

test('exported CSV imports exact cents and text without executing or retaining safe-text prefixes', async () => {
  const { createTransactionCsv } = await import('../src/csvExchange.js');
  const { normalizeImportRows } = await import('../src/importNormalization.js');
  const state = createFinancialState({ transactions: [
    createTransaction({ id: '0007', title: '=SUM(A1:A2)', note: "'literal apostrophe", amount: 9007199254740991 }),
    createTransaction({ id: 'payback', type: 'reimbursement', linkedId: '0007', amount: 234 }),
    createTransaction({ id: 'transfer', type: 'transfer', category: null, toAccount: 'shared', amount: 10000 })
  ] });
  const imported = await readImport(new File([createTransactionCsv(state)], 'Havensum.csv'));
  const rows = normalizeImportRows(createFinancialState(), imported);

  assert.equal(rows[0].id, '0007');
  assert.equal(rows[0].amount, 9007199254740991);
  assert.equal(rows[0].title, '=SUM(A1:A2)');
  assert.equal(rows[0].note, "'literal apostrophe");
  assert.equal(rows[1].linkedId, '0007');
  assert.equal(rows[2].toAccount, 'shared');
});
test('canonical transaction CSV preserves an explicitly linked planned cost', async () => {
  const { createTransactionCsv } = await import('../src/csvExchange.js');
  const { previewImportFile } = await import('../src/importFileReview.js');
  const plannedCost = { eventId: 0, month: '2026-12', singleOccurrence: true };
  const transaction = createTransaction({ plannedCost });
  const original = createFinancialState({ transactions: [transaction] });
  const file = await readImport(new File([createTransactionCsv(original)], 'planned.csv'));
  const review = previewImportFile(createFinancialState(), file);
  assert.equal(review.rows[0].status, 'new');
  assert.deepEqual(review.rows[0].transaction.plannedCost, plannedCost);
});
