import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedSavings } from '../src/expectedSavings.js';
import { billIdentity } from '../src/outlookInputs.js';
import { planInsights } from '../src/planInsights.js';
import { accountBalance, reportingMonthStats } from '../src/ledger.js';
import { plannedCostOptions } from '../src/plannedCosts.js';
import { createFinancialState, createTransaction, planArchiveOf } from './helpers/financialFixtures.js';

test('the planned-cost picker offers occurrences from the previous year onwards and retains a saved choice when the original month moved', () => {
  const events = [
    { id: 'service', name: 'Car service', year: 2027, month: 6 },
    { id: 'gifts', name: 'Gifts', month: 12 },
    { id: 'past', name: 'Past event', year: 2027, month: 1 },
    { id: 'long-ago', name: 'Long ago', year: 2025, month: 4 }
  ];
  const prior = { eventId: 'service', month: '2027-05', singleOccurrence: true };
  const options = plannedCostOptions(events, '2027-03-12', prior);
  // Owner decision F15: a late settlement can link to an earlier occurrence.
  assert.deepEqual(options.map(option => JSON.parse(option.value)), [
    { eventId: 'gifts', month: '2026-12' },
    { eventId: 'past', month: '2027-01', singleOccurrence: true },
    prior,
    { eventId: 'service', month: '2027-06', singleOccurrence: true },
    { eventId: 'gifts', month: '2027-12' },
    { eventId: 'gifts', month: '2028-12' }
  ]);
  assert.match(options[2].label, /original month 2027-05/);
});

test('a saved link to an occurrence more than a year before the payment keeps its own label', () => {
  const events = [{ id: 'gifts', name: 'Gifts', month: 12 }, { id: 'old-trip', name: 'Old trip', year: 2025, month: 6 }];
  const saved = { eventId: 'gifts', month: '2025-12' };

  const options = plannedCostOptions(events, '2027-03-12', saved);

  assert.equal(options.some(option => option.label.startsWith('Old trip')), false);
  assert.equal(options.find(option => option.value === JSON.stringify(saved)).label, 'Gifts · December 2025');
});

test('a saved link more than a year back does not bring in a moved occurrence of that year', () => {
  const movedGifts = [{ id: 'gifts', name: 'Gifts', month: 11 }];
  const saved = { eventId: 'gifts', month: '2025-12' };

  const options = plannedCostOptions(movedGifts, '2027-03-12', saved);

  assert.deepEqual(options.map(option => option.label).filter(label => label.includes('2025')), ['Gifts · original month 2025-12']);
});

test('two early payments count once in their specific planned month and keep their cash dates', () => {
  const plannedCost = { eventId: 'trip', month: '2027-11' };
  const state = createFinancialState({
    events: [{ id: 'trip', name: 'Trip', month: 11, amount: 120000 }],
    outlook: { completeMonths: ['2027-03', '2027-04'] },
    transactions: [
      createTransaction({ id: 'tickets', amount: 40000, category: 'shopping', date: '2027-03-12', plannedCost }),
      createTransaction({ id: 'bookings', amount: 30000, category: 'shopping', date: '2027-04-16', plannedCost })
    ]
  });
  const today = '2027-05-01';
  assert.equal(accountBalance(state, 'everyday', '2027-03-31'), 60000);
  assert.equal(accountBalance(state, 'everyday', '2027-04-30'), 30000);
  assert.equal(reportingMonthStats(state, '2027-03', today).spent, 0);
  assert.equal(reportingMonthStats(state, '2027-04', today).spent, 0);
  assert.equal(reportingMonthStats(state, '2027-11', today).spent, 70000);
  const estimate = expectedSavings(state, '2027-11', today);
  assert.equal(estimate.events[0].paid, 70000);
  assert.equal(estimate.events[0].remaining, 50000);
  assert.equal(estimate.expense, 120000);
  assert.equal(expectedSavings(state, '2028-11', today).events[0].remaining, 120000);
});

test('moving a planned cost flags its linked payments without moving spending or counting the estimate twice', () => {
  const earlyPayment = createTransaction({
    id: 'tickets', title: 'Tickets', amount: 70000, date: '2027-03-12',
    plannedCost: { eventId: 'trip', month: '2027-11' }
  });
  const state = createFinancialState({
    events: [{ id: 'trip', name: 'Trip', year: 2027, month: 12, amount: 120000 }],
    transactions: [earlyPayment]
  });
  const today = '2027-05-01';
  assert.equal(reportingMonthStats(state, '2027-11', today).spent, 70000);
  assert.equal(reportingMonthStats(state, '2027-12', today).spent, 0);
  const december = expectedSavings(state, '2027-12', today);
  assert.deepEqual(december.events[0].paymentsToReview.map(payment => payment.id), ['tickets']);
  assert.equal(december.events[0].remaining, 50000);
  assert.equal(december.expense, 50000);
});

test('a former recurring occurrence cannot reduce a later occurrence that becomes a one-off', () => {
  const state = createFinancialState({
    events: [{ id: 'trip', name: 'Trip', year: 2028, month: 11, amount: 120000 }],
    transactions: [createTransaction({ amount: 40000, date: '2027-03-12',
      plannedCost: { eventId: 'trip', month: '2027-11' } })]
  });
  const event = expectedSavings(state, '2028-11', '2028-01-01').events[0];
  assert.equal(event.remaining, 120000);
  assert.deepEqual(event.paymentsToReview, []);
});

test('a received payback reduces the net cost without reopening the planned payment', () => {
  const state = createFinancialState({
    events: [{ id: 'trip', name: 'Trip', year: 2027, month: 11, amount: 120000 }],
    transactions: [
      createTransaction({ id: 'tickets', amount: 40000, date: '2027-03-12',
        plannedCost: { eventId: 'trip', month: '2027-11' } }),
      createTransaction({ id: 'share', type: 'reimbursement', linkedId: 'tickets', amount: 10000, date: '2027-05-02' })
    ]
  });
  const today = '2027-05-03';
  const november = expectedSavings(state, '2027-11', today);
  assert.equal(accountBalance(state, 'everyday', today), 70000);
  assert.equal(reportingMonthStats(state, '2027-11', today).spent, 30000);
  assert.equal(november.events[0].paid, 40000);
  assert.equal(november.events[0].remaining, 80000);
  assert.equal(november.expense, 110000);
});

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
  state.plans = planArchiveOf({
    window: 12,
    months: { '2026-11': {
      income: 900000, expense: 100, balance: 899900, cushion: 90000, loan: 80000,
      lines: [{ category: 'groceries', kind: 'Variable', amount: 100, override: true }]
    } }
  });

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
    plans: planArchiveOf({ months: { '2026-11': { balance: 123 } } })
  });
  const result = expectedSavings(state, '2026-11', '2026-11-15');
  assert.equal(result.income, 250000);
  assert.equal(result.loan, 15000);
  assert.equal(result.balance, 235000);
  assert.equal(state.plans[2026][0].months['2026-11'].balance, 123);
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

// €1,000 at a 12% effective annual rate earns €9.49 in one month under the
// monthly compounding convention; the following month compounds on €1,009.49.
function scheduledSavingsState({ interestSchedule = [{ since: '2027-01', rate: 12 }], extraTransactions = [], outlook = {} } = {}) {
  const historyMonths = ['2027-01', '2027-02', '2027-03'];
  const salaries = historyMonths.map(month => createTransaction({
    id: `salary-${month}`, type: 'income', title: 'Salary', amount: 200000, date: `${month}-01`, category: 'salary'
  }));
  // Recorded interest keeps its posted amounts; it is not recomputed from the rate.
  const recordedInterest = historyMonths.map(month => createTransaction({
    id: `interest-savings-${month}`, type: 'income', title: 'Savings interest', amount: 2000,
    date: `${month}-28`, account: 'savings', category: 'interest'
  }));
  return createFinancialState({
    accounts: [
      { id: 'everyday', name: 'Everyday', tag: 'Personal', openingBalance: 100000 },
      { id: 'savings', name: 'Rainy day', tag: 'Savings', openingBalance: 94000, interestSchedule }
    ],
    outlook: { window: 3, completeMonths: historyMonths, ...outlook },
    transactions: [...salaries, ...recordedInterest, ...extraTransactions]
  });
}

test('scheduled rates replace historical interest in expected income and compound earlier estimates', () => {
  const state = scheduledSavingsState();
  const april = expectedSavings(state, '2027-04', '2027-04-10');
  assert.equal(april.income, 200000 + 949);
  assert.deepEqual(april.interest.map(line => [line.account, line.rate, line.recorded, line.scheduledEstimate]), [['savings', 12, 0, 949]]);
  const may = expectedSavings(state, '2027-05', '2027-04-10');
  assert.equal(may.income, 200000 + 958);
  assert.equal(state.transactions.length, 6, 'estimates stay out of the ledger');
});

test('recorded interest in a forecast month counts once instead of the estimate', () => {
  const bankInterest = createTransaction({
    id: 'bank-interest-april', type: 'income', title: 'Interest', amount: 1500, date: '2027-04-05', account: 'savings', category: 'interest'
  });
  const april = expectedSavings(scheduledSavingsState({ extraTransactions: [bankInterest] }), '2027-04', '2027-04-10');
  assert.equal(april.income, 200000 + 1500);
  assert.equal(april.interest[0].recorded, 1500);
});

test('a scheduled 0% successor stops estimated interest from its start month', () => {
  const state = scheduledSavingsState({ interestSchedule: [{ since: '2027-01', rate: 12 }, { since: '2027-05', rate: 0 }] });
  assert.equal(expectedSavings(state, '2027-04', '2027-04-10').income, 200000 + 949);
  assert.equal(expectedSavings(state, '2027-05', '2027-04-10').income, 200000);
});

test('an unscheduled legacy rate keeps its historical interest in expected income', () => {
  const state = scheduledSavingsState();
  const unscheduled = { ...state, accounts: state.accounts.map(account => account.id === 'savings'
    ? { id: 'savings', name: 'Rainy day', tag: 'Savings', openingBalance: 94000, unscheduledInterest: 12 } : account) };
  const april = expectedSavings(unscheduled, '2027-04', '2027-04-10');
  assert.equal(april.income, 202000);
  assert.deepEqual(april.interest, []);
});

test('a scheduled rate alone does not make a month without history or activity available', () => {
  const state = createFinancialState({
    accounts: [{ id: 'savings', name: 'Rainy day', tag: 'Savings', openingBalance: 100000, interestSchedule: [{ since: '2027-01', rate: 12 }] }]
  });
  assert.equal(expectedSavings(state, '2027-04', '2027-04-10'), null);
});

test('historical interest stays in expected income until the account has a scheduled rate for the month', () => {
  const state = scheduledSavingsState({ interestSchedule: [{ since: '2027-09', rate: 12 }] });
  assert.equal(expectedSavings(state, '2027-04', '2027-04-10').income, 202000);
});

test('recorded interest is evidence even when a month has no other history or activity', () => {
  const state = createFinancialState({
    accounts: [{ id: 'savings', name: 'Rainy day', tag: 'Savings', openingBalance: 100000, interestSchedule: [{ since: '2027-01', rate: 12 }] }],
    transactions: [createTransaction({ id: 'bank-interest', type: 'income', title: 'Interest', amount: 1500, date: '2027-04-05', account: 'savings', category: 'interest' })]
  });
  assert.equal(expectedSavings(state, '2027-04', '2027-04-10').income, 1500);
});
