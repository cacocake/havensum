import test from 'node:test';
import assert from 'node:assert/strict';
import { planInsights } from '../src/planInsights.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

test('transfer-only and unlinked-payback-only months do not dilute historical averages', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ date: '2026-10-01', amount: 10000 }),
    createTransaction({ id: 'transfer', type: 'transfer', date: '2026-09-01', amount: 99999, toAccount: 'shared' }),
    createTransaction({ id: 'adjustment', type: 'reimbursement', date: '2026-08-01', amount: 99999 })
  ] });

  assert.equal(planInsights(state, '2026-11', '2026-11-15').averages.spent, 10000);
});

test('a future-dated payback cannot reduce historical averages before it is received', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'october-expense', date: '2026-10-01', amount: 10000 }),
    createTransaction({ id: 'future-payback', type: 'reimbursement', date: '2026-11-30', amount: 4000, linkedId: 'october-expense' })
  ] });

  assert.equal(planInsights(state, '2026-11', '2026-11-15').averages.spent, 10000);
});

test('historical recorded results exclude paybacks dated after the reporting date', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'october-expense', date: '2026-10-01', amount: 10000 }),
    createTransaction({ id: 'future-payback', type: 'reimbursement', date: '2026-11-30', amount: 4000, linkedId: 'october-expense' })
  ] });

  assert.equal(planInsights(state, '2026-10', '2026-11-15').actual.spent, 10000);
});

test('missing financial history is exposed as unknown averages rather than zero predictions', () => {
  const insights = planInsights(createFinancialState(), '2026-11', '2026-11-15');

  assert.deepEqual(insights.averages, { income: null, spent: null, balance: null });
  assert.equal(insights.forecast, null);
});

test('the existing outlook uses leap-month length without double-counting paid rent', () => {
  const state = createFinancialState({
    transactions: [createTransaction({ category: 'rent', kind: 'Fixed', amount: 10000, date: '2024-02-01' })],
    plan: { months: {
      '2024-02': {
        income: 200000, expense: 12900, balance: 187100,
        lines: [
          { category: 'rent', kind: 'Fixed', amount: 10000 },
          { category: 'groceries', kind: 'Variable', amount: 2900 }
        ]
      }
    } }
  });
  const insights = planInsights(state, '2024-02', '2024-02-15');

  assert.equal(insights.days, 29);
  assert.equal(insights.forecast.expense, 11400);
  assert.equal(insights.forecast.balance, 188600);
});

test('month-end leaves no remaining variable allowance and no estimate leaks into actuals', () => {
  const state = createFinancialState({
    transactions: [createTransaction({ amount: 1234 })],
    plan: { months: {
      '2026-11': { income: 100000, expense: 30000, balance: 70000, lines: [{ category: 'groceries', kind: 'Variable', amount: 30000 }] }
    } }
  });
  const insights = planInsights(state, '2026-11', '2026-11-30');

  assert.equal(insights.forecast.expense, 1234);
  assert.equal(insights.actual.income, 0);
});

test('known future loans and occasional expenses establish floors without becoming recorded actuals', () => {
  const state = createFinancialState({
    transactions: [
      createTransaction({ id: 'future-loan', category: 'loan', kind: 'Fixed', amount: 20000, date: '2026-11-28' }),
      createTransaction({ id: 'future-purchase', category: 'shopping', kind: 'Occasional', amount: 30000, date: '2026-11-29' })
    ],
    plan: { months: {
      '2026-11': { income: 100000, expense: 20000, balance: 80000, loan: 10000, cushion: 10000, lines: [] }
    } }
  });
  const insights = planInsights(state, '2026-11', '2026-11-15');

  assert.equal(insights.actual.spent, 0);
  assert.equal(insights.forecast.expense, 50000);
});

test('a future-month entries view retains transactions registered for that month', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ amount: 10000, date: '2026-12-20' })
  ] });

  assert.equal(planInsights(state, '2026-12', '2026-11-17').actual.spent, 10000);
});
