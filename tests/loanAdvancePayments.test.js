import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/planning.js';
import { approvePlanRevision } from '../src/planArchive.js';
import { expectedSavings } from '../src/expectedSavings.js';
import { saveTransaction } from '../src/transactionActions.js';
import { validateState } from '../src/stateSchema.js';
import { withAdvancePayment } from '../src/loanAdvancePayments.js';
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
