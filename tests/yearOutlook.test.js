import test from 'node:test';
import assert from 'node:assert/strict';
import { yearOutlook } from '../src/yearOutlook.js';
import { approvePlanRevision } from '../src/planArchive.js';
import { createFinancialState, createTransaction, planArchiveOf } from './helpers/financialFixtures.js';

function monthlyEntries(months, { salary = 200000, rent = 80000 } = {}) {
  return months.flatMap(month => [
    createTransaction({ id: `salary-${month}`, type: 'income', title: 'Salary', amount: salary, date: `${month}-01`, category: 'salary' }),
    createTransaction({ id: `rent-${month}`, title: 'Rent', amount: rent, date: `${month}-02`, category: 'rent' })
  ]);
}

const k_firstQuarter = ['2027-01', '2027-02', '2027-03'];

function steadyLedger(overrides = {}) {
  return createFinancialState({
    outlook: { window: 3, completeMonths: k_firstQuarter },
    transactions: monthlyEntries([...k_firstQuarter, '2027-04']),
    ...overrides
  });
}

function totals(income, expense) {
  return { income, expense, balance: income - expense };
}

test('a midyear outlook combines recorded past months with expected months, counting the current month once', () => {
  const plannedMonths = Object.fromEntries(['06', '07', '08', '09', '10', '11', '12']
    .map(month => [`2027-${month}`, { income: 200000, expense: 90000, balance: 110000 }]));
  const state = steadyLedger({ plans: planArchiveOf({ year: 2027, revision: 1, months: plannedMonths }) });
  const outlook = yearOutlook(state, 2027, '2027-04-10');
  assert.deepEqual(outlook.months.map(month => month.period), [
    'past', 'past', 'past', 'current', 'future', 'future', 'future', 'future', 'future', 'future', 'future', 'future'
  ]);
  assert.deepEqual(outlook.months[0].recorded, totals(200000, 80000));
  assert.deepEqual(outlook.months[3].recorded, totals(200000, 80000));
  assert.deepEqual(outlook.months[3].expected, totals(200000, 80000));
  assert.equal(outlook.months[4].recorded, null);
  assert.equal(outlook.months[4].planned, null, 'a partial-year plan leaves earlier months without a target');
  assert.deepEqual(outlook.recorded, totals(800000, 320000));
  assert.deepEqual(outlook.expected, totals(2400000, 960000));
  assert.deepEqual(outlook.planned, totals(1400000, 630000));
  assert.deepEqual(outlook.plannedMonths, ['2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12']);
  assert.equal(outlook.variance, 7 * 120000 - 770000, 'variance compares expected and planned savings over the planned months');
});

test('months without evidence are unavailable and unconfirmed history is labelled partial', () => {
  const fullYear = Object.fromEntries(Array.from({ length: 12 }, (_, index) =>
    [`2027-${String(index + 1).padStart(2, '0')}`, { income: 200000, expense: 90000, balance: 110000 }]));
  const state = createFinancialState({
    outlook: { window: 3 },
    transactions: monthlyEntries(['2027-01', '2027-02']),
    plans: planArchiveOf({ year: 2027, revision: 1, months: fullYear })
  });
  const outlook = yearOutlook(state, 2027, '2027-04-10');
  assert.equal(outlook.months[2].hasRecords, false);
  assert.equal(outlook.months[2].expected, null, 'an unconfirmed past month without records is unavailable, not a zero result');
  assert.deepEqual(outlook.unavailableMonths, ['2027-03']);
  assert.deepEqual(outlook.partialMonths, ['2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12']);
  assert.equal(outlook.comparableMonths.length, 11);
  assert.equal(outlook.variance, 11 * 120000 - 11 * 110000, 'the variance compares only months with both an outlook and a target');

  const confirmedZero = yearOutlook({ ...state, outlook: { window: 3, completeMonths: ['2027-03'] } }, 2027, '2027-04-10');
  assert.deepEqual(confirmedZero.months[2].expected, totals(0, 0), 'a confirmed empty month is a recorded zero');
  assert.deepEqual(confirmedZero.unavailableMonths, []);
});

test('with no history or known income every forecast month is unavailable and there is no variance without a target', () => {
  const outlook = yearOutlook(createFinancialState(), 2027, '2027-04-10');
  assert.deepEqual(outlook.unavailableMonths, Array.from({ length: 12 }, (_, index) => `2027-${String(index + 1).padStart(2, '0')}`));
  assert.equal(outlook.planned, null);
  assert.equal(outlook.variance, null);
  assert.deepEqual(outlook.expected, totals(0, 0));
});

function plannedMonthsFrom(firstMonthNumber, target) {
  return Object.fromEntries(Array.from({ length: 13 - firstMonthNumber }, (_, index) =>
    [`2027-${String(firstMonthNumber + index).padStart(2, '0')}`, target]));
}

test('a target-only revision moves the variance but leaves the expected outlook unchanged', () => {
  const firstPlan = { year: 2027, revision: 1, months: plannedMonthsFrom(1, { income: 200000, expense: 90000, balance: 110000 }) };
  const state = steadyLedger({ plans: planArchiveOf(firstPlan) });
  const before = yearOutlook(state, 2027, '2027-04-10');
  const revisedMonths = { ...firstPlan.months, ...plannedMonthsFrom(4, { income: 200000, expense: 70000, balance: 130000 }) };
  const revised = approvePlanRevision(state, { ...firstPlan, revision: 2, months: revisedMonths }, { id: 'plan-2027-r2', fromMonth: 4, today: '2027-04-10' });
  const after = yearOutlook(revised, 2027, '2027-04-10');
  assert.deepEqual(after.expected, before.expected);
  assert.deepEqual(after.months.map(month => month.expected), before.months.map(month => month.expected));
  assert.equal(before.variance, 12 * 120000 - 12 * 110000);
  assert.equal(after.variance, 12 * 120000 - (3 * 110000 + 9 * 130000));
  const earlierRevision = yearOutlook(revised, 2027, '2027-04-10', { planRevisionId: 'plan-2027-fixture' });
  assert.equal(earlierRevision.variance, before.variance, 'an earlier revision can still be compared read-only');
});

test('changed obligations shape the expected months and are explained for the forecast months', () => {
  const state = steadyLedger({
    outlook: {
      window: 3, completeMonths: k_firstQuarter,
      incomeChanges: [{ since: '2027-07', amount: 220000 }],
      loanChanges: [{ loanId: 'car', since: '2027-06', amount: 10000 }],
      billCancellations: { [JSON.stringify(['everyday', 'rent', 'rent'])]: '2027-11' }
    },
    loans: [{ id: 'car', name: 'Car loan', account: 'everyday', payment: 15000, start: '2027-01', end: '2027-09' }],
    events: [{ id: 'trip', name: 'Summer trip', year: 2027, month: 8, amount: 120000 }]
  });
  const outlook = yearOutlook(state, 2027, '2027-04-10');
  assert.deepEqual(outlook.months.slice(3).map(month => month.expected), [
    totals(200000, 95000), totals(200000, 95000), totals(200000, 90000), totals(220000, 90000),
    totals(220000, 210000), totals(220000, 90000), totals(220000, 80000), totals(220000, 0), totals(220000, 0)
  ]);
  assert.deepEqual(outlook.expected, totals(600000 + 1920000, 240000 + 750000));
  const { drivers } = outlook;
  assert.deepEqual(drivers.forecastMonths, ['2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12']);
  assert.deepEqual(drivers.incomeChanges, [{ since: '2027-07', amount: 220000 }]);
  assert.equal(drivers.fixed, 7 * 80000);
  assert.deepEqual(drivers.bills.map(bill => [bill.name, bill.expected, bill.cancelledSince]), [['Rent', 7 * 80000, '2027-11']]);
  assert.equal(drivers.loans, 2 * 15000 + 4 * 10000);
  assert.deepEqual(drivers.loanChanges, [{ loanId: 'car', name: 'Car loan', since: '2027-06', amount: 10000 }]);
  assert.deepEqual(drivers.activeLoans, [{ id: 'car', name: 'Car loan', payment: 15000, since: '2027-04', end: '2027-09' }],
    'each loan behind the total is listed with the payment in effect from the first forecast month');
  assert.equal(drivers.occasional, 120000);
  assert.deepEqual(drivers.namedCosts.map(cost => [cost.name, cost.month, cost.amount, cost.remaining]), [['Summer trip', '2027-08', 120000, 120000]]);
  assert.equal(drivers.variable, 0);
  assert.deepEqual(drivers.interest, []);
});

test('scheduled savings rates replace historical interest in the year and recorded interest counts once', () => {
  const historyInterest = k_firstQuarter.map(month => createTransaction({
    id: `interest-savings-${month}`, type: 'income', title: 'Savings interest', amount: 2000, date: `${month}-28`, account: 'savings', category: 'interest'
  }));
  const state = steadyLedger({
    accounts: [
      { id: 'everyday', name: 'Everyday', tag: 'Personal', openingBalance: 100000 },
      { id: 'savings', name: 'Rainy day', tag: 'Savings', openingBalance: 94000, interestSchedule: [{ since: '2026-06', rate: 0 }, { since: '2027-01', rate: 12 }, { since: '2027-07', rate: 0 }] }
    ],
    transactions: [...monthlyEntries([...k_firstQuarter, '2027-04']), ...historyInterest]
  });
  const outlook = yearOutlook(state, 2027, '2027-04-10');
  assert.deepEqual(outlook.months.slice(3).map(month => month.expected.income), [
    200949, 200958, 200967, 200000, 200000, 200000, 200000, 200000, 200000
  ]);
  assert.equal(outlook.expected.income, 3 * 202000 + 9 * 200000 + 949 + 958 + 967);
  assert.deepEqual(outlook.drivers.interest, [{
    account: 'savings', name: 'Rainy day', recorded: 0, estimated: 949 + 958 + 967, expected: 949 + 958 + 967,
    periods: [{ since: '2026-06', rate: 0 }, { since: '2027-01', rate: 12 }, { since: '2027-07', rate: 0 }]
  }]);
  assert.equal(state.transactions.length, 11, 'estimates stay out of the ledger');
});

test('a late linked payback reduces its original past month while an unreceived one does not', () => {
  const state = steadyLedger({
    transactions: [
      ...monthlyEntries([...k_firstQuarter, '2027-04']),
      createTransaction({ id: 'concert', title: 'Concert', amount: 30000, date: '2027-03-15', category: 'shopping' }),
      createTransaction({ id: 'friend-pays', type: 'reimbursement', title: 'Friend pays back', amount: 10000, date: '2027-04-05', linkedId: 'concert' }),
      createTransaction({ id: 'later-payback', type: 'reimbursement', title: 'Second payback', amount: 5000, date: '2027-05-03', linkedId: 'concert' })
    ]
  });
  const outlook = yearOutlook(state, 2027, '2027-04-10');
  assert.deepEqual(outlook.months[2].recorded, totals(200000, 80000 + 20000));
  assert.deepEqual(outlook.months[2].expected, totals(200000, 80000 + 20000));
  assert.deepEqual(outlook.months[3].recorded, totals(200000, 80000), 'the payback offsets March, not the month it arrived');
});

test('past and future years are wholly recorded or wholly expected', () => {
  const state = steadyLedger();
  const past = yearOutlook(state, 2027, '2028-02-01');
  assert.ok(past.months.every(month => month.period === 'past'));
  assert.deepEqual(past.drivers.forecastMonths, []);
  assert.deepEqual(past.expected, past.recorded);
  const future = yearOutlook(state, 2028, '2027-04-10');
  assert.ok(future.months.every(month => month.period === 'future' && month.recorded === null));
  assert.deepEqual(future.recorded, totals(0, 0));
  assert.deepEqual(future.expected, totals(12 * 200000, 12 * 80000));
});

// Backtest: forecast from 10 April using only entries dated by then, then
// compare with the actual results recorded later in the year.
test('a backtest from an earlier date uses only information available then and tracks later actuals', () => {
  const allMonths = Array.from({ length: 12 }, (_, index) => `2027-${String(index + 1).padStart(2, '0')}`);
  const fullYear = steadyLedger({
    outlook: { window: 3, completeMonths: allMonths.slice(0, 11) },
    transactions: [
      ...monthlyEntries(allMonths),
      createTransaction({ id: 'boiler', title: 'Boiler repair', amount: 45000, date: '2027-09-12', category: 'shopping' })
    ]
  });
  const backtestDate = '2027-04-10';
  const knownThen = { ...fullYear, outlook: { window: 3, completeMonths: k_firstQuarter }, transactions: fullYear.transactions.filter(transaction => transaction.date <= backtestDate) };
  const forecast = yearOutlook(knownThen, 2027, backtestDate);
  const actual = yearOutlook(fullYear, 2027, '2028-01-05');
  assert.deepEqual(forecast.expected, totals(12 * 200000, 12 * 80000));
  assert.deepEqual(actual.recorded, totals(12 * 200000, 12 * 80000 + 45000));
  assert.equal(actual.recorded.balance - forecast.expected.balance, -45000, 'only the unforeseen repair separates the forecast from the actual year');
  assert.deepEqual(forecast.months[8].expected, totals(200000, 80000), 'the September repair entered later is not known to the backtest');
  assert.ok(!knownThen.transactions.some(transaction => transaction.id === 'boiler'));
});

test('recorded interest in the current month counts once in the year and its explanation', () => {
  const recordedApril = createTransaction({
    id: 'bank-interest-april', type: 'income', title: 'Interest', amount: 1500, date: '2027-04-05', account: 'savings', category: 'interest'
  });
  const state = steadyLedger({
    accounts: [
      { id: 'everyday', name: 'Everyday', tag: 'Personal', openingBalance: 100000 },
      { id: 'savings', name: 'Rainy day', tag: 'Savings', openingBalance: 100000, interestSchedule: [{ since: '2027-04', rate: 12 }, { since: '2027-05', rate: 0 }] }
    ],
    transactions: [...monthlyEntries([...k_firstQuarter, '2027-04']), recordedApril]
  });
  const outlook = yearOutlook(state, 2027, '2027-04-10');
  assert.equal(outlook.months[3].recorded.income, 201500);
  assert.equal(outlook.months[3].expected.income, 201500, 'recorded interest replaces the estimate instead of adding to it');
  assert.equal(outlook.expected.income, 12 * 200000 + 1500);
  assert.deepEqual(outlook.drivers.interest.map(line => [line.recorded, line.estimated, line.expected]), [[1500, 0, 1500]]);
});

// L01: Recorded holds what has posted by today, whichever month it reports in;
// Scheduled holds what has not posted yet. Both feed Expected for this month on.
test('scheduled entries stay visible beside recorded ones in every month they report in', () => {
  const state = steadyLedger({
    events: [{ id: 'trip', name: 'Trip', month: 8, amount: 90000 }],
    transactions: [
      ...monthlyEntries([...k_firstQuarter, '2027-04']),
      createTransaction({ id: 'gift', title: 'Gift', amount: 6000, date: '2027-04-22', category: 'shopping' }),
      createTransaction({ id: 'deposit', title: 'Trip deposit', amount: 20000, date: '2027-04-05', category: 'shopping', plannedCost: { eventId: 'trip', month: '2027-08' } }),
      createTransaction({ id: 'insurance', title: 'Car insurance', amount: 45000, date: '2027-06-15', category: 'shopping' })
    ]
  });
  const outlook = yearOutlook(state, 2027, '2027-04-10');

  assert.deepEqual(outlook.months[3].recorded, totals(200000, 80000), 'April records what posted by the 10th');
  assert.deepEqual(outlook.months[3].scheduled, totals(0, 6000), 'the gift on the 22nd is scheduled');
  assert.equal(outlook.months[5].recorded, null);
  assert.deepEqual(outlook.months[5].scheduled, totals(0, 45000));
  assert.deepEqual(outlook.months[7].recorded, totals(0, 20000), 'a posted early payment is recorded in its planned month');
  assert.equal(outlook.months[7].scheduled, null);
  assert.equal(outlook.months[6].scheduled, null);
  assert.equal(outlook.months[2].scheduled, null);
  assert.deepEqual(outlook.recorded, totals(4 * 200000, 4 * 80000 + 20000));

  const onTheGiftDate = yearOutlook(state, 2027, '2027-04-22');
  assert.deepEqual(onTheGiftDate.months[3].recorded, totals(200000, 86000), 'it counts from its date without confirmation');
  assert.equal(onTheGiftDate.months[3].scheduled, null);
});

test('a late payment scheduled for a past planned cost shows as scheduled while that month keeps its recorded result', () => {
  const state = steadyLedger({
    events: [{ id: 'party', name: 'Party', month: 3, amount: 30000, year: 2027 }],
    transactions: [
      ...monthlyEntries([...k_firstQuarter, '2027-04']),
      createTransaction({ id: 'catering', title: 'Catering', amount: 25000, date: '2027-04-20', category: 'shopping', plannedCost: { eventId: 'party', month: '2027-03' } })
    ]
  });
  const outlook = yearOutlook(state, 2027, '2027-04-10');

  assert.deepEqual(outlook.months[2].recorded, totals(200000, 80000));
  assert.deepEqual(outlook.months[2].scheduled, totals(0, 25000));
  assert.deepEqual(outlook.months[2].expected, totals(200000, 80000), 'a past month expects its recorded result (FORECAST-1)');
  assert.deepEqual(yearOutlook(state, 2027, '2027-04-20').months[2].recorded, totals(200000, 105000));
});

test('loan payment changes from the history, temporary ones included, are explained in the forecast months', () => {
  const state = steadyLedger({
    outlook: { window: 3, completeMonths: k_firstQuarter },
    loans: [{
      id: 'car', name: 'Car loan', account: 'everyday', payment: 15000, start: '2027-01', end: '2027-12',
      paymentChanges: [{ since: '2027-03', amount: 14000 }, { since: '2027-06', until: '2027-07', amount: 9000 }]
    }]
  });

  const { drivers } = yearOutlook(state, 2027, '2027-04-10');

  assert.deepEqual(drivers.activeLoans, [{ id: 'car', name: 'Car loan', payment: 14000, since: '2027-04', end: '2027-12' }]);
  assert.deepEqual(drivers.loanChanges, [
    { loanId: 'car', name: 'Car loan', since: '2027-06', amount: 9000 },
    { loanId: 'car', name: 'Car loan', since: '2027-08', amount: 14000 }
  ]);
  assert.equal(drivers.loans, 7 * 14000 + 2 * 9000);
});
