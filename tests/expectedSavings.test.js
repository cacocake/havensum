import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedSavings } from '../src/expectedSavings.js';
import { billIdentity } from '../src/outlookInputs.js';
import { planInsights } from '../src/planInsights.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

test('expected savings uses confirmed history without requiring a frozen target', () => {
  const state = createFinancialState({
    outlook: { completeMonths: ['2026-10'] },
    transactions: [
      createTransaction({ id: 'salary', type: 'income', amount: 200000, date: '2026-10-01' }),
      createTransaction({ id: 'history', amount: 30000, date: '2026-10-10' }),
      createTransaction({ id: 'current', amount: 10000, date: '2026-11-10' })
    ]
  });
  const before = structuredClone(state);

  const result = expectedSavings(state, '2026-11', '2026-11-15');

  assert.equal(result.income, 200000);
  assert.equal(result.expense, 25000);
  assert.equal(result.balance, 175000);
  assert.deepEqual(state, before);
});

test('missing history returns an unknown estimate instead of inventing savings', () => {
  assert.equal(expectedSavings(createFinancialState(), '2026-11', '2026-11-15'), null);
});

test('future forecasts keep the same last completed history beyond the prediction window', () => {
  const state = createFinancialState({
    outlook: { window: 3, completeMonths: ['2026-10'] },
    transactions: [
      createTransaction({ id: 'income-history', type: 'income', amount: 200000, date: '2026-10-01' }),
      createTransaction({ id: 'variable-history', amount: 30000, date: '2026-10-10' })
    ]
  });
  const result = expectedSavings(state, '2027-08', '2026-11-15');
  assert.deepEqual(result.historyMonths, ['2026-10']);
  assert.equal(result.balance, 170000);
});

test('unconfirmed recorded history supports an explicitly partial estimate', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ amount: 30000, date: '2026-10-10' })
  ] });

  const result = expectedSavings(state, '2026-11', '2026-11-15');

  assert.equal(result.expense, 15000);
  assert.equal(result.partial, true);
  assert.deepEqual(result.historyMonths, ['2026-10']);
});

test('historical occasional costs form a reserve absorbed by known costs', () => {
  const state = createFinancialState({
    outlook: { completeMonths: ['2026-10'] },
    events: [{ id: 'trip', name: 'Trip', year: 2026, month: 11, amount: 20000 }],
    transactions: [createTransaction({ category: 'shopping', amount: 30000, date: '2026-10-10' })]
  });

  const result = expectedSavings(state, '2026-11', '2026-11-15');

  assert.equal(result.occasional, 30000);
  assert.equal(result.expense, 30000);
});

test('past months report received results and future months use a full allowance across year boundaries', () => {
  const state = createFinancialState({
    outlook: { completeMonths: ['2026-12'] },
    transactions: [
      createTransaction({ id: 'salary', type: 'income', amount: 200000, date: '2026-12-01' }),
      createTransaction({ amount: 31000, date: '2026-12-10' })
    ]
  });

  assert.equal(expectedSavings(state, '2026-12', '2027-01-15').balance, 169000);
  assert.equal(expectedSavings(state, '2027-02', '2027-01-15').expense, 31000);
});

test('scheduled expenses and income set floors while future reimbursements remain unreceived', () => {
  const state = createFinancialState({
    outlook: { completeMonths: ['2026-10'] },
    transactions: [
      createTransaction({ id: 'old', date: '2026-10-10', amount: 30000 }),
      createTransaction({ id: 'salary', type: 'income', date: '2026-11-28', amount: 200000 }),
      createTransaction({ id: 'future', date: '2026-11-29', amount: 50000 }),
      createTransaction({ id: 'payback', type: 'reimbursement', linkedId: 'old', date: '2026-11-30', amount: 10000 })
    ]
  });

  const result = expectedSavings(state, '2026-11', '2026-11-15');

  assert.equal(result.income, 200000);
  assert.equal(result.expense, 50000);
  assert.equal(result.balance, 150000);
});

test('registered loan payments are included once and historical loan costs do not enter variable averages', () => {
  const state = createFinancialState({
    outlook: { completeMonths: ['2026-10'] },
    loans: [{ id: 'car', payment: 20000, start: '2026-01', end: '2026-12' }],
    transactions: [
      createTransaction({ id: 'old-loan', category: 'loan', date: '2026-10-05', amount: 20000 }),
      createTransaction({ id: 'paid-loan', category: 'loan', loanId: 'car', date: '2026-11-05', amount: 20000 })
    ]
  });

  assert.equal(expectedSavings(state, '2026-11', '2026-11-15').expense, 20000);
  assert.equal(expectedSavings(state, '2026-12', '2026-11-15').loan, 20000);
  assert.equal(expectedSavings(state, '2027-01', '2026-11-15').loan, 0);
});

test('target-only edits cannot move expected savings', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ date: '2026-10-10', amount: 30000 })
  ] });
  const prediction = expectedSavings(state, '2026-11', '2026-11-15');
  state.plan = {
    window: 12,
    months: { '2026-11': {
      income: 900000, expense: 100, balance: 899900, cushion: 90000, loan: 80000,
      lines: [{ category: 'groceries', kind: 'Variable', amount: 100, override: true }]
    } }
  };

  assert.deepEqual(expectedSavings(state, '2026-11', '2026-11-15'), prediction);
});

test('cancelling Internet leaves paid Rent in the same category and preserves past results', () => {
  const rent = createTransaction({ id: 'rent', title: 'Rent', category: 'rent', date: '2026-10-01', amount: 80000 });
  const internet = createTransaction({ id: 'internet', title: 'Internet', category: 'rent', date: '2026-10-02', amount: 3500 });
  const state = createFinancialState({
    transactions: [rent, internet, { ...rent, id: 'nov-rent', date: '2026-11-01' }],
    outlook: { completeMonths: ['2026-10'] }
  });

  assert.equal(expectedSavings(state, '2026-11', '2026-11-15').expense, 83500);
  state.outlook.billCancellations = { [billIdentity(internet)]: '2026-11' };
  const cancelled = expectedSavings(state, '2026-11', '2026-11-15');
  assert.equal(cancelled.expense, 80000);
  assert.equal(cancelled.bills.find(bill => bill.name === 'Rent').status, 'recorded');
  assert.equal(cancelled.bills.find(bill => bill.name === 'Internet').status, 'cancelled');
  assert.equal(expectedSavings(state, '2026-10', '2026-11-15').expense, 83500);
});

test('a known obligation supports a partial estimate without history', () => {
  const state = createFinancialState({ loans: [{ id: 'car', payment: 20000, start: '2026-01', end: '2026-12' }] });
  const result = expectedSavings(state, '2026-11', '2026-11-15');
  assert.equal(result.expense, 20000);
  assert.equal(result.partial, true);
});

test('variable allowances are kept per category so one scheduled cost cannot consume another allowance', () => {
  const state = createFinancialState({
    categories: [
      { id: 'food', name: 'Food', kind: 'Variable' },
      { id: 'travel', name: 'Travel', kind: 'Variable' }
    ],
    transactions: [
      createTransaction({ id: 'food-history', category: 'food', date: '2026-10-01', amount: 30000 }),
      createTransaction({ id: 'travel-history', category: 'travel', date: '2026-10-01', amount: 30000 }),
      createTransaction({ id: 'trip', category: 'travel', date: '2026-11-28', amount: 20000 })
    ]
  });
  assert.equal(expectedSavings(state, '2026-11', '2026-11-15').expense, 35000);
});

test('overpaying one loan cannot hide another unpaid loan', () => {
  const state = createFinancialState({
    loans: [
      { id: 'car', name: 'Car', account: 'everyday', payment: 20000, start: '2026-01', end: '2026-12' },
      { id: 'bike', name: 'Bike', account: 'everyday', payment: 10000, start: '2026-01', end: '2026-12' }
    ],
    transactions: [createTransaction({ category: 'loan', loanId: 'car', amount: 40000 })]
  });
  assert.equal(expectedSavings(state, '2026-11', '2026-11-15').loan, 50000);
});

test('independent income and loan changes affect the estimate without changing a frozen target', () => {
  const state = createFinancialState({
    outlook: { incomeChanges: [{ since: '2026-11', amount: 250000 }], loanChanges: [{ loanId: 'car', since: '2026-11', amount: 15000 }] },
    loans: [{ id: 'car', payment: 20000, start: '2026-01', end: '2026-12' }],
    plan: { months: { '2026-11': { balance: 123 } } }
  });
  const result = expectedSavings(state, '2026-11', '2026-11-15');
  assert.equal(result.income, 250000);
  assert.equal(result.loan, 15000);
  assert.equal(result.balance, 235000);
  assert.equal(state.plan.months['2026-11'].balance, 123);
});

test('the screen insight boundary exposes independent savings even without a plan', () => {
  const state = createFinancialState({ outlook: { incomeChanges: [{ since: '2026-11', amount: 100000 }] } });
  const insight = planInsights(state, '2026-11', '2026-11-15');
  assert.equal(insight.forecast.balance, 100000);
  assert.equal(insight.forecast.variance, null);
});

test('a received fixed-bill payback reduces spending without restoring an already paid bill', () => {
  const rent = createTransaction({ id: 'rent', title: 'Rent', category: 'rent', amount: 80000, date: '2026-10-01' });
  const state = createFinancialState({ transactions: [
    rent, { ...rent, id: 'nov-rent', date: '2026-11-01' },
    createTransaction({ id: 'payback', type: 'reimbursement', linkedId: 'nov-rent', amount: 40000, date: '2026-11-10' })
  ] });
  const result = expectedSavings(state, '2026-11', '2026-11-15');
  assert.equal(result.fixed, 40000);
  assert.equal(result.bills[0].remaining, 0);
});

test('known upcoming occasional costs combine with unrelated spending and explicit payment matches prevent duplication', () => {
  const state = createFinancialState({
    outlook: { completeMonths: ['2026-10'] },
    events: [{ id: 'trip', name: 'Trip', month: 11, year: 2026, amount: 20000 }],
    transactions: [
      createTransaction({ id: 'old', category: 'shopping', amount: 30000, date: '2026-10-10' }),
      createTransaction({ id: 'purchase', category: 'shopping', amount: 15000, date: '2026-11-10' })
    ]
  });
  assert.equal(expectedSavings(state, '2026-11', '2026-11-15').occasional, 35000);
  state.outlook.eventPayments = { trip: 'purchase' };
  assert.equal(expectedSavings(state, '2026-11', '2026-11-15').occasional, 30000);
});

test('confirmed zero-activity months count in both displayed averages and prediction history', () => {
  const state = createFinancialState({
    outlook: { completeMonths: ['2026-09', '2026-10'] },
    transactions: [createTransaction({ amount: 30000, date: '2026-10-10' })]
  });
  const insight = planInsights(state, '2026-11', '2026-11-15');
  assert.equal(insight.averages.spent, 15000);
  assert.equal(insight.count, 2);
  assert.equal(insight.forecast.expense, 7500);
});

test('legacy numeric zero loan IDs retain their payment association', () => {
  const state = createFinancialState({
    loans: [{ id: 0, name: 'Car', account: 'everyday', payment: 20000, start: '2026-01', end: '2026-12' }],
    transactions: [createTransaction({ category: 'loan', loanId: 0, amount: 20000 })]
  });
  assert.equal(expectedSavings(state, '2026-11', '2026-11-15').loan, 20000);
});

test('a fixed bill inherits behavior from a legacy numeric zero parent category', () => {
  const state = createFinancialState({
    categories: [{ id: 0, name: 'Home', kind: 'Fixed' }, { id: 'internet', parentId: 0, name: 'Internet' }],
    transactions: [createTransaction({ title: 'Internet', category: 'internet', amount: 3500, date: '2026-10-01' })]
  });
  assert.equal(expectedSavings(state, '2026-11', '2026-11-15').expense, 3500);
});
