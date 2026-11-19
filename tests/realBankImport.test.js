import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportContent } from '../src/importFiles.js';
import { readImport } from '../src/files.web.js';
import { createTransactionCsv } from '../src/csvExchange.js';
import { previewImportFile } from '../src/importFileReview.js';
import { applyTransactionImport, reviseTransactionImport } from '../src/importReview.js';
import { getImportResults } from '../src/importOutcomes.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';
import { accountBalance, monthStats } from '../src/engine.js';

// The synthetic statements are dated in 2032; balances are read once they have posted.
const k_afterStatements = '2032-12-31';

const k_realBankStatement = [
  'Consultar saldos e movimentos à ordem - 09-02-2032',
  '',
  '',
  'Conta,synthetic-account',
  'Data de início,01-02-2032',
  'Data de fim,09-02-2032',
  '',
  '',
  'Data mov.,Data valor,Descrição,Débito,Crédito,Saldo contabilístico,Saldo disponível,Categoria',
  '03-02-2032,04-02-2032,"Café, chá",12.45,,111.11,110.00,Alimentação'
].join('\r\n');

test('Real Bank CSV recognizes its preamble and reads the transaction table with both source dates', async () => {
  const imported = await parseImportContent('synthetic.csv', k_realBankStatement);

  assert.deepEqual(imported.bank, { profile: 'real-bank-v1', account: 'synthetic-account' });
  assert.deepEqual(imported.rows, [{
    sourceRow: 10,
    movementDate: '03-02-2032',
    valueDate: '04-02-2032',
    title: 'Café, chá',
    debit: '12.45',
    credit: '',
    category: 'Alimentação',
    movement: { date: '2032-02-04', amount: 1245, direction: 'debit', currency: 'EUR' }
  }]);
});

test('a trailing booked-balance summary is excluded without hiding a malformed movement', async () => {
  const malformed = '06-02-2032,06-02-2032,,4,,,100,Outros';
  const footer = ',,,,Saldo contabilístico,Synthetic balance,,';
  const statement = await parseImportContent('synthetic.csv', [k_realBankStatement, malformed, footer, ',,,,,,,'].join('\r\n'));
  assert.deepEqual(statement.rows.map(row => row.sourceRow), [10, 11]);
  assert.match(statement.rows[1].error, /description/i);
});

test('a Windows-1252 Real Bank file keeps Portuguese accents and punctuation when picked on web', async () => {
  const statement = k_realBankStatement.replace('Café, chá', 'Café, chá \x96 lanche');
  const file = new File([Buffer.from(statement, 'latin1')], 'synthetic.CSV');
  const imported = await readImport(file);

  assert.equal(imported.bank.profile, 'real-bank-v1');
  assert.equal(imported.rows[0].title, 'Café, chá – lanche');
});

test('Real Bank credits use the value date and exact EUR cents while awaiting classification', async () => {
  const statement = k_realBankStatement + '\r\n28-02-2032,01-03-2032,Crédito sintético,,"0,07",111.18,111.18,Outros';
  const imported = await parseImportContent('synthetic.csv', statement);

  assert.deepEqual(imported.rows[1].movement, {
    date: '2032-03-01', amount: 7, direction: 'credit', currency: 'EUR'
  });
  assert.equal(imported.rows[1].type, undefined);
});

test('a UTF-8 byte order mark does not hide the Real Bank profile', async () => {
  const file = new File(['\uFEFF', k_realBankStatement], 'synthetic.csv');
  const imported = await readImport(file);

  assert.equal(imported.bank?.profile, 'real-bank-v1');
});

test('the Real Bank parser reports a missing description on the source row and keeps subsequent rows reviewable', async () => {
  const invalidRow = '05-02-2032,06-02-2032,,3,,,107,Lazer';
  const nextRow = '06-02-2032,07-02-2032,Compra sintética,4,,,103,Lazer';
  const statement = [k_realBankStatement, invalidRow, nextRow].join('\r\n');
  const imported = await parseImportContent('synthetic.csv', statement);

  assert.equal(imported.rows[1].sourceRow, 11);
  assert.match(imported.rows[1].error, /description/i);
  assert.equal(imported.rows[1].movement, undefined);
  assert.equal(imported.rows[2].movement.amount, 400);
});

test('ambiguous statement amounts and invalid value dates report row errors before balances can change', async () => {
  const state = createFinancialState();
  const invalidRows = [
    '05-02-2032,2032-02-06,Unexpected date,3,,,107,Lazer',
    '05-02-2032,31-02-2032,Invalid date,3,,,107,Lazer',
    '05-02-2032,06-02-2032,Both directions,3,2,,107,Lazer',
    '05-02-2032,06-02-2032,Ambiguous amount,1.234,,,107,Lazer',
    '05-02-2032,06-02-2032,Amount too large,90071992547410,,,107,Lazer'
  ];
  const statement = await parseImportContent('synthetic.csv', [k_realBankStatement, ...invalidRows].join('\r\n'));
  const preview = previewImportFile(state, statement, { targetAccount: 'everyday' });
  const rows = preview.rows.slice(1);
  assert.deepEqual(rows.map(row => row.sourceRow), [11, 12, 13, 14, 15]);
  assert.deepEqual(rows.map(row => row.status), Array(5).fill('invalid'));
  const expectedMessages = [/DD-MM-YYYY/, /valid calendar/, /exactly one/, /thousands separator/, /safe integer/];
  rows.forEach((row, index) => assert.match(row.error, expectedMessages[index]));
  assert.equal(accountBalance(state, 'everyday', k_afterStatements), 100000);
});

test('overlapping Real Bank exports review identical purchases after draft edits and a canonical round trip', async () => {
  const state = createFinancialState();
  const statement = await parseImportContent('first.csv', k_realBankStatement);
  const preview = previewImportFile(state, statement, { targetAccount: 'everyday' });
  const review = reviseTransactionImport(state, preview, 0, {
    type: 'expense', category: 'groceries', title: 'Renamed purchase', amount: 1200
  });
  const saved = applyTransactionImport(state, review, {}, () => 'recorded-purchase');
  const exported = await parseImportContent('portable.csv', createTransactionCsv(saved));
  const restored = applyTransactionImport(state, previewImportFile(state, exported), {});

  const row = k_realBankStatement.split('\r\n').at(-1);
  const overlap = await parseImportContent('overlap.csv', [
    k_realBankStatement.replace(row, '06-02-2032,07-02-2032,Other purchase,1,,,110,Outros'),
    row,
    row
  ].join('\r\n'));
  const overlappingPreview = previewImportFile(restored, overlap, { targetAccount: 'everyday' });
  const overlappingReview = overlap.rows.reduce((priorReview, _, index) => reviseTransactionImport(restored, priorReview, index,
    { type: 'expense', category: 'groceries' }), overlappingPreview);
  assert.deepEqual(overlappingReview.rows.map(entry => entry.status), ['new', 'possible', 'possible']);
  const combined = applyTransactionImport(restored, overlappingReview, { 1: 'skip', 2: 'add' },
    (() => { let next = 0; return () => `overlap-${++next}`; })());
  assert.deepEqual(combined.transactions.map(record => record.amount), [1200, 100, 1245]);

  const otherAccountReview = previewImportFile(restored, statement, { targetAccount: 'shared' });
  assert.equal(reviseTransactionImport(restored, otherAccountReview, 0,
    { type: 'expense', category: 'groceries' }).rows[0].status, 'new');
});

test('opposite statement rows become one neutral transfer only when the counterpart is explicitly selected', async () => {
  const state = createFinancialState();
  const outgoing = await parseImportContent('outgoing.csv', k_realBankStatement);
  const incoming = await parseImportContent('incoming.csv', k_realBankStatement.replace(
    '03-02-2032,04-02-2032,"Café, chá",12.45,,111.11,110.00,Alimentação',
    '03-02-2032,04-02-2032,Recebimento,,12.45,112.45,112.45,Outros'
  ));
  const preview = previewImportFile(state, outgoing, {
    statements: [
      { data: outgoing, targetAccount: 'everyday' },
      { data: incoming, targetAccount: 'shared' }
    ]
  });
  const unpaired = reviseTransactionImport(state, preview, 0, { type: 'transfer', toAccount: 'shared' });
  assert.equal(unpaired.rows[0].status, 'invalid');
  const paired = reviseTransactionImport(state, unpaired, 0, { type: 'transfer', counterpartIndex: 1 });
  assert.deepEqual(paired.rows.map(row => row.status), ['new', 'paired']);
  const saved = applyTransactionImport(state, paired, {}, () => 'reviewed-transfer');
  assert.equal(saved.transactions.length, 1);
  assert.equal(accountBalance(saved, 'everyday', k_afterStatements), 98755);
  assert.equal(accountBalance(saved, 'shared', k_afterStatements), 51245);
  assert.equal(monthStats(saved, '2032-02').income, 0);
  assert.equal(monthStats(saved, '2032-02').spent, 0);
});

test('overlapping statements in the same import require a choice for the repeated movement', async () => {
  const state = createFinancialState();
  const first = await parseImportContent('first.csv', k_realBankStatement);
  const second = await parseImportContent('overlap.csv', k_realBankStatement);
  const preview = previewImportFile(state, first, { statements: [
    { data: first, targetAccount: 'everyday' }, { data: second, targetAccount: 'everyday' }
  ] });
  const reviewedFirst = reviseTransactionImport(state, preview, 0, { type: 'expense', category: 'groceries' });
  const reviewed = reviseTransactionImport(state, reviewedFirst, 1, { type: 'expense', category: 'groceries', title: 'Edited description' });
  assert.equal(reviewed.rows[0].status, 'new');
  assert.equal(reviewed.rows[1].status, 'possible');
  assert.throws(() => applyTransactionImport(state, reviewed, {}, () => 'first'), /make a review choice/i);
  const saved = applyTransactionImport(state, reviewed, { 1: 'skip' }, () => 'first');
  assert.deepEqual(saved.transactions.map(transaction => transaction.amount), [1245]);
});

test('a paired transfer keeps the matched amount and value date after draft edits', async () => {
  const state = createFinancialState();
  const outgoing = await parseImportContent('outgoing.csv', k_realBankStatement);
  const incoming = await parseImportContent('incoming.csv', k_realBankStatement.replace(
    k_realBankStatement.split('\r\n').at(-1), '03-02-2032,04-02-2032,Recebimento,,12.45,112.45,112.45,Outros'
  ));
  const preview = previewImportFile(state, outgoing, { statements: [
    { data: outgoing, targetAccount: 'everyday' }, { data: incoming, targetAccount: 'shared' }
  ] });
  const paired = reviseTransactionImport(state, preview, 0, {
    type: 'transfer', counterpartIndex: 1, amount: 9900, date: '2032-02-07'
  });
  const saved = applyTransactionImport(state, paired, {}, () => 'reviewed-transfer');
  assert.equal(saved.transactions[0].amount, 1245);
  assert.equal(saved.transactions[0].date, '2032-02-04');
});

test('both sides of a skipped transfer are reported as skipped', async () => {
  const state = createFinancialState();
  const outgoing = await parseImportContent('outgoing.csv', k_realBankStatement);
  const incoming = await parseImportContent('incoming.csv', k_realBankStatement.replace(
    k_realBankStatement.split('\r\n').at(-1), '03-02-2032,04-02-2032,Recebimento,,12.45,112.45,112.45,Outros'
  ));
  const preview = previewImportFile(state, outgoing, { statements: [
    { data: outgoing, targetAccount: 'everyday' }, { data: incoming, targetAccount: 'shared' }
  ] });
  const paired = reviseTransactionImport(state, preview, 0, { type: 'transfer', counterpartIndex: 1, title: '' });
  const choices = { 0: 'skip' };
  const saved = applyTransactionImport(state, paired, choices, () => 'never-used');
  const receipt = getImportResults(state, saved, paired, choices);
  assert.deepEqual(receipt.counts, { added: 0, updated: 0, skipped: 2 });
  assert.match(receipt.rows[1].label, /skipped with.*transfer debit/i);
  assert.deepEqual(saved.transactions, []);
});

test('the credit side of a recorded transfer remains a possible duplicate after CSV export and import', async () => {
  const state = createFinancialState();
  const outgoing = await parseImportContent('outgoing.csv', k_realBankStatement);
  const incoming = await parseImportContent('incoming.csv', k_realBankStatement.replace(
    k_realBankStatement.split('\r\n').at(-1), '03-02-2032,04-02-2032,Recebimento,,12.45,112.45,112.45,Outros'
  ));
  const preview = previewImportFile(state, outgoing, { statements: [
    { data: outgoing, targetAccount: 'everyday' }, { data: incoming, targetAccount: 'shared' }
  ] });
  const paired = reviseTransactionImport(state, preview, 0, { type: 'transfer', counterpartIndex: 1 });
  const saved = applyTransactionImport(state, paired, {}, () => 'saved-transfer');
  const exported = await parseImportContent('portable.csv', createTransactionCsv(saved));
  const restored = applyTransactionImport(state, previewImportFile(state, exported), {});
  const overlap = previewImportFile(restored, incoming, { targetAccount: 'shared' });
  assert.deepEqual(overlap.rows[0].possibleMatches.map(record => record.id), ['saved-transfer']);
  const classified = reviseTransactionImport(restored, overlap, 0, { type: 'income' });
  assert.equal(classified.rows[0].status, 'possible');
  assert.throws(() => applyTransactionImport(restored, classified, {}), /make a review choice/i);
});

test('an older CSV can update a transfer title without dropping the credit reference', async () => {
  const transfer = createTransaction({
    id: 'older-transfer', type: 'transfer', toAccount: 'shared', title: 'Reviewed transfer',
    externalSource: 'real-bank-v1', sourceFingerprint: 'debit-fingerprint', counterpartSourceFingerprint: 'credit-fingerprint'
  });
  const state = createFinancialState({ transactions: [transfer] });
  const newerCsv = createTransactionCsv(state);
  const olderCsv = newerCsv.replace(',counterpart_source_fingerprint', '').replace(',"\'credit-fingerprint"', '');
  const file = await parseImportContent('older.csv', olderCsv);
  assert.equal(previewImportFile(state, file).rows[0].status, 'unchanged');
  const editedCsv = await parseImportContent('older.csv', olderCsv.replace('Reviewed transfer', 'Updated title'));
  const review = previewImportFile(state, editedCsv);
  const saved = applyTransactionImport(state, review, { 0: 'replace' });
  assert.equal(saved.transactions[0].title, 'Updated title');
  assert.equal(saved.transactions[0].counterpartSourceFingerprint, 'credit-fingerprint');
});

test('pairing a transfer flags its credit when that movement has already been recorded', async () => {
  const state = createFinancialState();
  const outgoing = await parseImportContent('outgoing.csv', k_realBankStatement);
  const incoming = await parseImportContent('incoming.csv', k_realBankStatement.replace(
    k_realBankStatement.split('\r\n').at(-1), '03-02-2032,04-02-2032,Recebimento,,12.45,112.45,112.45,Outros'
  ));
  const credit = previewImportFile(state, incoming, { targetAccount: 'shared' });
  const classified = reviseTransactionImport(state, credit, 0, { type: 'reimbursement', linkedId: null });
  const ledger = applyTransactionImport(state, classified, {}, () => 'saved-credit');
  const preview = previewImportFile(ledger, outgoing, { statements: [
    { data: outgoing, targetAccount: 'everyday' }, { data: incoming, targetAccount: 'shared' }
  ] });
  const paired = reviseTransactionImport(ledger, preview, 0, { type: 'transfer', counterpartIndex: 1 });
  assert.deepEqual(paired.rows[0].possibleMatches.map(record => record.id), ['saved-credit']);
  assert.throws(() => applyTransactionImport(ledger, paired, {}), /make a review choice/i);
  assert.equal(accountBalance(applyTransactionImport(ledger, paired, { 0: 'skip' }), 'shared', k_afterStatements), 51245);
});

test('a credit repeated across statements needs review even when its other copy is paired', async () => {
  const state = createFinancialState();
  const outgoing = await parseImportContent('outgoing.csv', k_realBankStatement);
  const incoming = await parseImportContent('incoming.csv', k_realBankStatement.replace(
    k_realBankStatement.split('\r\n').at(-1), '03-02-2032,04-02-2032,Recebimento,,12.45,112.45,112.45,Outros'
  ));
  const preview = previewImportFile(state, outgoing, { statements: [
    { data: incoming, targetAccount: 'shared' }, { data: outgoing, targetAccount: 'everyday' },
    { data: { ...incoming, name: 'incoming-overlap.csv' }, targetAccount: 'shared' }
  ] });
  for (const [chosenCredit, otherCredit] of [[0, 2], [2, 0]]) {
    const paired = reviseTransactionImport(state, preview, 1, { type: 'transfer', counterpartIndex: chosenCredit });
    const reviewed = reviseTransactionImport(state, paired, otherCredit, { type: 'reimbursement', linkedId: null });
    assert.equal(reviewed.rows[otherCredit].status, 'possible');
    assert.throws(() => applyTransactionImport(state, reviewed, {}, () => 'saved-transfer'), /make a review choice/i);
    const saved = applyTransactionImport(state, reviewed, { [otherCredit]: 'skip' }, () => 'saved-transfer');
    assert.equal(accountBalance(saved, 'shared', k_afterStatements), 51245);
  }
});

test('a saved transfer credit needs duplicate review even when paired with a debit from another account', async () => {
  const base = createFinancialState();
  const state = { ...base, accounts: [...base.accounts, { id: 'savings', name: 'Savings', openingBalance: 10000 }] };
  const outgoing = await parseImportContent('outgoing.csv', k_realBankStatement);
  const incoming = await parseImportContent('incoming.csv', k_realBankStatement.replace(
    k_realBankStatement.split('\r\n').at(-1), '03-02-2032,04-02-2032,Recebimento,,12.45,112.45,112.45,Outros'
  ));
  const savings = await parseImportContent('savings.csv', k_realBankStatement.replace('Café, chá', 'Transfer from savings'));
  const firstPreview = previewImportFile(state, outgoing, { statements: [
    { data: outgoing, targetAccount: 'everyday' }, { data: incoming, targetAccount: 'shared' }
  ] });
  const firstPair = reviseTransactionImport(state, firstPreview, 0, { type: 'transfer', counterpartIndex: 1 });
  const ledger = applyTransactionImport(state, firstPair, {}, () => 'saved-transfer');
  const secondPreview = previewImportFile(ledger, savings, { statements: [
    { data: savings, targetAccount: 'savings' }, { data: incoming, targetAccount: 'shared' }
  ] });
  const secondPair = reviseTransactionImport(ledger, secondPreview, 0, { type: 'transfer', counterpartIndex: 1 });
  assert.deepEqual(secondPair.rows[0].possibleMatches.map(record => record.id), ['saved-transfer']);
  assert.throws(() => applyTransactionImport(ledger, secondPair, {}), /make a review choice/i);
  const saved = applyTransactionImport(ledger, secondPair, { 0: 'skip' });
  assert.equal(accountBalance(saved, 'shared', k_afterStatements), 51245);
});

test('a bank refund requires an explicit expense or balance-adjustment choice and never becomes earnings', async () => {
  const originalExpense = createTransaction({ date: '2032-01-31', amount: 1000 });
  const state = createFinancialState({ transactions: [originalExpense] });
  const firstRow = k_realBankStatement.split('\r\n').at(-1);
  const statement = await parseImportContent('refund.csv', k_realBankStatement.replace(
    firstRow, '03-02-2032,04-02-2032,Refund,,3.00,103,103,Outros'));
  const preview = previewImportFile(state, statement, { targetAccount: 'everyday' });
  const unresolved = reviseTransactionImport(state, preview, 0, { type: 'reimbursement' });
  assert.match(unresolved.rows[0].error, /choose.*expense/i);
  assert.throws(() => applyTransactionImport(state, unresolved, {}), /choose.*expense/i);

  const reviewed = reviseTransactionImport(state, unresolved, 0, { type: 'reimbursement', linkedId: originalExpense.id });
  const saved = applyTransactionImport(state, reviewed, {}, () => 'recorded-refund');
  assert.equal(accountBalance(saved, 'everyday', k_afterStatements), 99300);
  assert.equal(monthStats(saved, '2032-01').spent, 700);
  assert.equal(monthStats(saved, '2032-02').spent, 0);
  assert.equal(monthStats(saved, '2032-02').income, 0);

  const unlinked = reviseTransactionImport(state, unresolved, 0, { type: 'reimbursement', linkedId: null });
  const adjusted = applyTransactionImport(state, unlinked, {}, () => 'unlinked-refund');
  assert.equal(monthStats(adjusted, '2032-01').spent, 1000);
  assert.equal(monthStats(adjusted, '2032-02').income, 0);
});

test('a paired transfer with different value dates uses the date the user chooses', async () => {
  const state = createFinancialState();
  const outgoing = await parseImportContent('outgoing.csv', k_realBankStatement);
  const incoming = await parseImportContent('incoming.csv', k_realBankStatement.replace(
    k_realBankStatement.split('\r\n').at(-1),
    '04-02-2032,05-02-2032,Recebimento,,12.45,112.45,112.45,Outros'
  ));
  const preview = previewImportFile(state, outgoing, { statements: [
    { data: outgoing, targetAccount: 'everyday' }, { data: incoming, targetAccount: 'shared' }
  ] });
  const unresolved = reviseTransactionImport(state, preview, 0, { type: 'transfer', counterpartIndex: 1 });
  assert.match(unresolved.rows[0].error, /choose.*value date/i);
  assert.throws(() => applyTransactionImport(state, unresolved, {}), /choose.*value date/i);
  const reviewed = reviseTransactionImport(state, unresolved, 0, {
    type: 'transfer', counterpartIndex: 1, transferDate: '2032-02-05'
  });
  const imported = applyTransactionImport(state, reviewed, {}, () => 'reviewed-transfer');
  assert.equal(imported.transactions[0].date, '2032-02-05');
});
