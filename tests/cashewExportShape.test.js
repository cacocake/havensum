// IMPORT-2 follow-up: synthetic rows shaped like the owner's real v2 test
// export (K10-K12). No real export content is stored here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportContent } from '../src/importFiles.js';
import { previewImportFile } from '../src/importFileReview.js';
import { applyTransactionImport, reviseTransactionImport } from '../src/importReview.js';
import { createFinancialState } from './helpers/financialFixtures.js';
import { accountBalance, monthStats } from '../src/ledger.js';
import { loanMeaning } from '../src/cashewReview.js';

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
    [transferLeg('Carteira', '-25.0', 'Carteira → Cartão Vale'), transferLeg('Cartão Vale', '25.0', 'Carteira → Cartão Vale')],
    [transferLeg('Carteira', '-25.0', `${transferNote('Carteira', 'Cartão Vale')}\nPaid back lunch`), transferLeg('Cartão Vale', '25.0', transferNote('Carteira', 'Cartão Vale'))],
    [transferLeg('Carteira', '-25.0', transferNote('Carteira', 'Cartão Vale')), transferLeg('Carteira', '-25.0', transferNote('Carteira', 'Cartão Vale')), transferLeg('Cartão Vale', '25.0', transferNote('Carteira', 'Cartão Vale'))]
  ];
  for (const rows of cases) {
    const preview = previewImportFile(state, await exportFile(rows), k_accountOptions);
    assert.deepEqual(preview.rows.map(row => row.transaction.type), rows.map(() => undefined));
  }
});

test('a Cashew transfer note tolerates CRLF and a trailing blank line, but not an arrow inside an account name (K11)', async () => {
  const state = createFinancialState();
  const tolerated = [`Transferred Balance\r\nCarteira → Cartão Vale`, `${transferNote('Carteira', 'Cartão Vale')}\n`];
  for (const note of tolerated) {
    const preview = previewImportFile(state, await exportFile([transferLeg('Carteira', '-25.0', note), transferLeg('Cartão Vale', '25.0', note)]), k_accountOptions);
    assert.deepEqual(preview.rows.map(row => row.status), ['new', 'paired']);
  }
  const arrowNote = transferNote('Carteira', 'Vale → Novo');
  const arrowOptions = { accounts: { Carteira: 'everyday', 'Vale → Novo': 'shared' } };
  const arrowFile = await exportFile([transferLeg('Carteira', '-25.0', arrowNote), transferLeg('Vale → Novo', '25.0', arrowNote)]);
  const arrowPreview = previewImportFile(state, arrowFile, arrowOptions);
  assert.deepEqual(arrowPreview.rows.map(row => row.transaction.type), [undefined, undefined]);
});

const k_carLoan = { id: 'car', name: 'Car loan', remaining: 500000, original: 800000, payment: 18500, start: '2026-01', end: '2029-12', account: 'everyday' };
const k_loanObjective = 'Empréstimo da família';

function objectiveRow(amount, title) {
  return exportRow({ account: 'Carteira', amount, title, 'category name': 'Comer Fora', objective: k_loanObjective, extra: k_recurrence });
}

test('a row with a Cashew objective can be recorded against a chosen Havensum loan by its sign (K12)', async () => {
  const state = createFinancialState({ loans: [k_carLoan] });
  const file = await exportFile([objectiveRow('300.0', 'Dinheiro recebido'), objectiveRow('-50.0', 'Prestação')]);
  let review = previewImportFile(state, file, k_accountOptions);
  assert.deepEqual(review.rows.map(row => row.bank.loanOptional), [true, true]);
  assert.match(review.rows[0].bank.objectiveNote, /may be a loan/i);

  const wrongShape = [
    [0, { type: 'income', category: 'salary', loanId: 'car' }, /loan proceeds/i],
    [1, { type: 'expense', category: 'groceries', loanId: 'car' }, /loan category/i],
    [1, { type: 'expense', category: 'loan', loanId: 'unknown-loan' }, /choose the havensum loan/i]
  ];
  for (const [index, changes, message] of wrongShape) {
    const attempt = reviseTransactionImport(state, review, index, changes);
    assert.equal(attempt.rows[index].status, 'invalid');
    assert.match(attempt.rows[index].error, message);
  }

  review = reviseTransactionImport(state, review, 0, { type: 'reimbursement', linkedId: null, loanId: 'car' });
  review = reviseTransactionImport(state, review, 1, { type: 'expense', category: 'loan', loanId: 'car' });
  let next = 0;
  const saved = applyTransactionImport(state, review, {}, () => `objective-${next++}`);
  assert.deepEqual(saved.transactions.map(({ type, amount, loanId }) => [type, amount, loanId]),
    [['reimbursement', 30000, 'car'], ['expense', 5000, 'car']]);
  assert.deepEqual(saved.loans, state.loans);
  assert.equal(monthStats(saved, '2026-11').income, 0);
  assert.equal(monthStats(saved, '2026-11').spent, 5000);
  assert.equal(accountBalance(saved, 'everyday', '2026-11-30'), 100000 + 30000 - 5000);
});

test('a row with a Cashew objective and no loan picked is classified like an ordinary row (K12)', async () => {
  const state = createFinancialState({ loans: [k_carLoan] });
  const file = await exportFile([objectiveRow('-50.0', 'Prestação')]);
  const preview = previewImportFile(state, file, k_accountOptions);
  const reviewed = reviseTransactionImport(state, preview, 0, { type: 'expense', category: 'groceries' });
  assert.equal(reviewed.rows[0].status, 'new');
  const saved = applyTransactionImport(state, reviewed, {}, () => 'ordinary');
  assert.equal(saved.transactions[0].loanId, undefined);
  assert.equal(monthStats(saved, '2026-11').spent, 5000);
});

test('switching the loan off again classifies a Cashew objective row as an ordinary entry (K12)', async () => {
  const state = createFinancialState({ loans: [k_carLoan] });
  const file = await exportFile([objectiveRow('-50.0', 'Prestação')]);
  let review = previewImportFile(state, file, k_accountOptions);
  review = reviseTransactionImport(state, review, 0, { type: 'expense', category: 'loan', loanId: 'car' });
  assert.equal(review.rows[0].transaction.loanId, 'car');
  review = reviseTransactionImport(state, review, 0, { type: 'expense', category: 'groceries', loanId: undefined });
  assert.equal(review.rows[0].status, 'new');
  const saved = applyTransactionImport(state, review, {}, () => 'switched-off');
  assert.equal(saved.transactions[0].loanId, undefined);
  assert.equal(saved.transactions[0].category, 'groceries');
});

test('the review spells out what a loan-linked Cashew row becomes from its sign (K13)', async () => {
  const state = createFinancialState({ loans: [k_carLoan] });
  const file = await exportFile([objectiveRow('300.0', 'Dinheiro recebido'), objectiveRow('-50.0', 'Prestação')]);
  const review = previewImportFile(state, file, k_accountOptions);
  assert.deepEqual(review.rows.map(row => loanMeaning(row.bank)),
    ['Loan money received · adds to this account, never income', 'Payment on the loan · a repayment expense in the loan category']);
  const asIncome = reviseTransactionImport(state, review, 0, { type: 'income', category: 'salary', loanId: 'car' });
  assert.equal(asIncome.rows[0].status, 'invalid');
  const asProceeds = reviseTransactionImport(state, review, 0, { type: 'reimbursement', linkedId: null, loanId: 'car' });
  assert.equal(asProceeds.rows[0].status, 'new');
  const asOrdinaryExpense = reviseTransactionImport(state, review, 1, { type: 'expense', category: 'groceries', loanId: 'car' });
  assert.equal(asOrdinaryExpense.rows[1].status, 'invalid');
  const asRepayment = reviseTransactionImport(state, review, 1, { type: 'expense', category: 'loan', loanId: 'car' });
  assert.equal(asRepayment.rows[1].status, 'new');

  const debtFile = await exportFile([exportRow({ account: 'Carteira', amount: '-50.0', title: 'Prestação', type: 'debt', 'category name': 'Dívidas' })]);
  const debtReview = previewImportFile(state, debtFile, k_accountOptions);
  assert.equal(debtReview.rows[0].bank.loanRequired, true);
  assert.equal(loanMeaning(debtReview.rows[0].bank), 'Payment on the loan · a repayment expense in the loan category');
});

function suggestedTypes(preview) {
  return preview.rows.map(row => row.transaction.type);
}

test('a Cashew transfer note is recognised in another app language (K14)', async () => {
  const state = createFinancialState();
  for (const heading of ['Balanço transferido', 'Saldo transferido', '振替済残高']) {
    const note = `${heading}\nCarteira → Cartão Vale`;
    const preview = previewImportFile(state, await exportFile([transferLeg('Carteira', '-25.0', note), transferLeg('Cartão Vale', '25.0', note)]), k_accountOptions);
    assert.deepEqual(suggestedTypes(preview), ['transfer', undefined], heading);
    assert.equal(preview.rows[0].transaction.toAccount, 'shared');
  }
  const unknownHeading = 'Dinheiro mudado\nCarteira → Cartão Vale';
  const unknown = previewImportFile(state, await exportFile([transferLeg('Carteira', '-25.0', unknownHeading), transferLeg('Cartão Vale', '25.0', unknownHeading)]), k_accountOptions);
  assert.deepEqual(suggestedTypes(unknown), [undefined, undefined]);
});

test('a reversed Cashew transfer note (A ← B) means money moved from B to A (K14)', async () => {
  const state = createFinancialState();
  const note = 'Transferred Balance\nCartão Vale ← Carteira';
  const preview = previewImportFile(state, await exportFile([transferLeg('Cartão Vale', '25.0', note), transferLeg('Carteira', '-25.0', note)]), k_accountOptions);
  assert.deepEqual(preview.rows.map(row => row.status), ['paired', 'new']);
  assert.equal(preview.rows[1].transaction.account, 'everyday');
  assert.equal(preview.rows[1].transaction.toAccount, 'shared');
  const wrongWay = 'Transferred Balance\nCarteira ← Cartão Vale';
  const refused = previewImportFile(state, await exportFile([transferLeg('Cartão Vale', '25.0', wrongWay), transferLeg('Carteira', '-25.0', wrongWay)]), k_accountOptions);
  assert.deepEqual(suggestedTypes(refused), [undefined, undefined]);
});

test('Cashew transfer legs up to 61 seconds apart are still suggested as a pair (K15)', async () => {
  const state = createFinancialState();
  const note = transferNote('Carteira', 'Cartão Vale');
  const legsAt = (debitTime, creditTime) => exportFile([
    exportRow({ account: 'Carteira', amount: '-25.0', title: 'Mover dinheiro', note, date: debitTime, 'category name': 'Correção de saldo' }),
    exportRow({ account: 'Cartão Vale', amount: '25.0', title: 'Mover dinheiro', note, date: creditTime, 'category name': 'Correção de saldo' })
  ]);
  const oneSecond = previewImportFile(state, await legsAt('2026-11-10 20:28:30.000', '2026-11-10 20:28:31.000'), k_accountOptions);
  assert.deepEqual(suggestedTypes(oneSecond), ['transfer', undefined]);
  const acrossMidnight = previewImportFile(state, await legsAt('2026-11-10 23:59:30.000', '2026-11-11 00:00:30.000'), k_accountOptions);
  assert.deepEqual(suggestedTypes(acrossMidnight), ['transfer', undefined]);
  const minuteRollover = previewImportFile(state, await legsAt('2026-11-10 20:28:30.000', '2026-11-10 20:29:31.000'), k_accountOptions);
  assert.deepEqual(suggestedTypes(minuteRollover), ['transfer', undefined]);
  const tooFar = previewImportFile(state, await legsAt('2026-11-10 20:28:30.000', '2026-11-10 20:29:32.000'), k_accountOptions);
  assert.deepEqual(suggestedTypes(tooFar), [undefined, undefined]);
  const dateOnly = previewImportFile(state, await legsAt('2026-11-10', '2026-11-10'), k_accountOptions);
  assert.deepEqual(suggestedTypes(dateOnly), ['transfer', undefined]);
});

test('two Cashew credits inside the window at different times leave the transfer for manual pairing (K15)', async () => {
  const state = createFinancialState();
  const note = transferNote('Carteira', 'Cartão Vale');
  const leg = (account, amount, date) => exportRow({ account, amount, title: 'Mover dinheiro', note, date, 'category name': 'Correção de saldo' });
  const file = await exportFile([
    leg('Carteira', '-25.0', '2026-11-10 20:28:30.000'),
    leg('Cartão Vale', '25.0', '2026-11-10 20:28:31.000'),
    leg('Cartão Vale', '25.0', '2026-11-10 20:29:10.000')
  ]);
  assert.deepEqual(suggestedTypes(previewImportFile(state, file, k_accountOptions)), [undefined, undefined, undefined]);
});

test('an account name with both arrows is never read as a transfer route (K14)', async () => {
  const state = createFinancialState();
  const note = 'Transferred Balance\nCarteira ← Vale → Cartão Vale';
  const preview = previewImportFile(state, await exportFile([transferLeg('Carteira', '-25.0', note), transferLeg('Cartão Vale', '25.0', note)]), k_accountOptions);
  assert.deepEqual(suggestedTypes(preview), [undefined, undefined]);
});

test('the objective note says to pick a loan only for money borrowed (K16)', async () => {
  const state = createFinancialState({ loans: [k_carLoan] });
  const preview = previewImportFile(state, await exportFile([objectiveRow('-50.0', 'Prestação')]), k_accountOptions);
  assert.match(preview.rows[0].bank.objectiveNote, /only for money you borrowed/i);
  assert.match(preview.rows[0].bank.objectiveNote, /money you lent.*skip.*unlinked balance adjustment/i);
});
