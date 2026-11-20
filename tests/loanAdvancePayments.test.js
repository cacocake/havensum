import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/planning.js';
import { approvePlanRevision } from '../src/planArchive.js';
import { expectedSavings } from '../src/expectedSavings.js';
import { saveTransaction } from '../src/transactionActions.js';
import { validateState } from '../src/stateSchema.js';
import { InvalidAdvancePaymentError, withAdvancePayment } from '../src/loanAdvancePayments.js';
import { applyTransactionImport, previewTransactionImport } from '../src/importReview.js';
import { isEnteredAmount } from '../src/money.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

const k_today = '2026-11-20';
const k_carLoan = { id: 'car', name: 'Car', account: 'everyday', start: '2026-01', end: '2029-12', payment: 18500, paymentChanges: [], remaining: 400000, original: 500000 };

function ledgerWithPlan() {
  const state = createFinancialState({ loans: [k_carLoan] });
  const plan = buildPlan(state, { year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02' });
  return approvePlanRevision(state, plan, { id: 'plan-2026', fromMonth: 1, today: '2026-01-02' });
}

test('an advance payment is recorded on the loan, marked as an advance, and lowers the remaining balance in one save (P14)', () => {
  const state = ledgerWithPlan();

  const advanced = withAdvancePayment(state, { loanId: 'car', id: 'advance-1', amount: 150000, date: '2026-11-18', account: 'everyday' });

  assert.equal(advanced.loans[0].remaining, 250000);
  assert.deepEqual(advanced.transactions, [{ id: 'advance-1', type: 'expense', title: 'Car · advance payment', amount: 150000, date: '2026-11-18', account: 'everyday', category: 'loan', loanId: 'car', loanAdvance: true }]);
  assert.deepEqual([advanced.loans[0].payment, advanced.loans[0].paymentChanges], [18500, []]);
  assert.equal(JSON.stringify(advanced.plans), JSON.stringify(state.plans));
  assert.doesNotThrow(() => validateState(advanced));
});

test('an advance larger than the remaining balance leaves it at zero, and an invalid advance changes nothing', () => {
  const state = ledgerWithPlan();

  assert.equal(withAdvancePayment(state, { loanId: 'car', id: 'advance-1', amount: 500000, date: '2026-11-18', account: 'everyday' }).loans[0].remaining, 0);
  for (const amount of [0, -100, 12.5]) {
    assert.throws(() => withAdvancePayment(state, { loanId: 'car', id: 'advance-1', amount, date: '2026-11-18', account: 'everyday' }), /positive/);
  }
  assert.throws(() => withAdvancePayment(state, { loanId: 'missing', id: 'advance-1', amount: 100, date: '2026-11-18', account: 'everyday' }), /loan/);
});

test('a stored advance mark must be true', () => {
  const advanced = withAdvancePayment(ledgerWithPlan(), { loanId: 'car', id: 'advance-1', amount: 1000, date: '2026-11-18', account: 'everyday' });
  const withMark = loanAdvance => ({ ...advanced, transactions: [{ ...advanced.transactions[0], loanAdvance }] });

  for (const invalidMark of [false, 'yes', 1, null]) {
    assert.throws(() => validateState(withMark(invalidMark)), /advance/);
  }
});

test('a one-off extra payment is only a recorded payment: the history and plan stay, and its month shows the larger amount', () => {
  const state = ledgerWithPlan();
  const feeMonthPayment = createTransaction({ id: 'car-november', title: 'Car', amount: 23500, date: '2026-11-05', category: 'loan', loanId: 'car' });

  const recorded = saveTransaction(state, feeMonthPayment);

  assert.deepEqual(recorded.loans, state.loans);
  assert.equal(JSON.stringify(recorded.plans), JSON.stringify(state.plans));
  assert.equal(expectedSavings(recorded, '2026-11', k_today).loan, 23500);
  assert.equal(expectedSavings(recorded, '2026-12', k_today).loan, 18500);
});

test('an advance with an invalid date or an unknown account is refused and changes nothing', () => {
  const state = ledgerWithPlan();

  for (const invalid of [{ date: '' }, { date: '2026-02-30' }, { account: 'missing' }]) {
    assert.throws(() => withAdvancePayment(state, { loanId: 'car', id: 'advance-1', amount: 1000, date: '2026-11-18', account: 'everyday', ...invalid }), InvalidAdvancePaymentError);
  }
});

test('the advance mark is valid only on an expense linked to a loan', () => {
  const advanced = withAdvancePayment(ledgerWithPlan(), { loanId: 'car', id: 'advance-1', amount: 1000, date: '2026-11-18', account: 'everyday' });
  const withEntry = changes => ({ ...advanced, transactions: [{ ...advanced.transactions[0], ...changes }] });

  assert.throws(() => validateState(withEntry({ type: 'income', category: 'salary' })), /advance/);
  assert.throws(() => validateState(withEntry({ loanId: undefined, category: 'groceries' })), /advance/);
});

test('re-importing an advance row that is no longer a loan expense drops the mark, as the file cannot carry it', () => {
  const advanced = withAdvancePayment(ledgerWithPlan(), { loanId: 'car', id: 'advance-1', amount: 1000, date: '2026-11-18', account: 'everyday' });
  const { loanAdvance, loanId, ...exportedRow } = advanced.transactions[0];
  const recategorised = { ...exportedRow, category: 'groceries' };

  const review = previewTransactionImport(advanced, [recategorised]);
  const imported = applyTransactionImport(advanced, review, { 0: 'replace' });

  assert.equal(loanAdvance, true);
  assert.deepEqual([imported.transactions[0].category, imported.transactions[0].loanAdvance, imported.transactions[0].loanId], ['groceries', undefined, undefined]);
});

test('an entered amount needs digits with at most two decimals, as in the transaction form', () => {
  for (const valid of ['12', '12.5', '12,50']) {
    assert.equal(isEnteredAmount(valid), true);
  }
  for (const invalid of ['', '12.345', '1e3', '1.000,50', '-5']) {
    assert.equal(isEnteredAmount(invalid), false);
  }
});
