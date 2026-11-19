import test from 'node:test';
import assert from 'node:assert/strict';
import { accountBalance, reportingMonthStats } from '../src/engine.js';
import { scheduledMonthStats } from '../src/ledger.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';
import { atLocalTime } from './helpers/localClock.js';
import { planInsights } from '../src/planInsights.js';
import { yearOutlook } from '../src/yearOutlook.js';
import { expectedSavings } from '../src/expectedSavings.js';

// L01: an entry counts from its date, by the device's local date.
function ledgerAroundTheTenth() {
  return createFinancialState({ transactions: [
    createTransaction({ id: 'tenth', amount: 100, date: '2026-11-10' }),
    createTransaction({ id: 'eleventh', amount: 200, date: '2026-11-11' }),
    createTransaction({ id: 'twelfth', amount: 400, date: '2026-11-12' })
  ] });
}

test('a current balance counts entries from their local date, east of UTC just after midnight', () => {
  // 00:30 on 11 November in Auckland is still 10 November in UTC.
  const balance = atLocalTime('Pacific/Auckland', '2026-11-10T11:30:00Z', () => accountBalance(ledgerAroundTheTenth(), 'everyday'));

  assert.equal(balance, 100000 - 100 - 200);
});

test('a current balance leaves an entry dated tomorrow out, west of UTC in the evening', () => {
  // 21:00 on 10 November in Los Angeles is already 11 November in UTC.
  const balance = atLocalTime('America/Los_Angeles', '2026-11-11T05:00:00Z', () => accountBalance(ledgerAroundTheTenth(), 'everyday'));

  assert.equal(balance, 100000 - 100);
});

const k_trip = { id: 'trip', name: 'Trip', month: 12, amount: 120000 };

test('a future month reports posted early payments now and its scheduled entries only from their date', () => {
  const state = createFinancialState({
    events: [k_trip],
    transactions: [
      createTransaction({ id: 'deposit', amount: 30000, category: 'shopping', date: '2026-11-15', plannedCost: { eventId: 'trip', month: '2026-12' } }),
      createTransaction({ id: 'hotel', amount: 50000, category: 'shopping', date: '2026-12-20', plannedCost: { eventId: 'trip', month: '2026-12' } }),
      createTransaction({ id: 'bonus', type: 'income', category: 'salary', amount: 20000, date: '2026-12-18' })
    ]
  });

  const beforeTheHotel = reportingMonthStats(state, '2026-12', '2026-11-17');
  assert.deepEqual([beforeTheHotel.income, beforeTheHotel.spent], [0, 30000]);
  assert.deepEqual(scheduledMonthStats(state, '2026-12', '2026-11-17'), { income: 20000, spent: 50000, balance: -30000, count: 2 });

  const onTheHotelDate = reportingMonthStats(state, '2026-12', '2026-12-20');
  assert.deepEqual([onTheHotelDate.income, onTheHotelDate.spent], [20000, 80000]);
  assert.deepEqual(scheduledMonthStats(state, '2026-12', '2026-12-20'), { income: 0, spent: 0, balance: 0, count: 0 });
});

test('an entry dated on the last day of the month counts that day and not the day before', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'month-end', amount: 7000, date: '2026-11-30' })
  ] });

  assert.equal(reportingMonthStats(state, '2026-11', '2026-11-29').spent, 0);
  assert.equal(scheduledMonthStats(state, '2026-11', '2026-11-29').spent, 7000);
  assert.equal(accountBalance(state, 'everyday', '2026-11-29'), 100000);
  assert.equal(reportingMonthStats(state, '2026-11', '2026-11-30').spent, 7000);
  assert.equal(accountBalance(state, 'everyday', '2026-11-30'), 93000);
});

test('a late payment for a past planned cost joins that month once its own date arrives', () => {
  // F15: an expense dated after its occurrence counts in the occurrence month.
  const state = createFinancialState({
    events: [{ id: 'party', name: 'Party', month: 10, amount: 40000, year: 2026 }],
    transactions: [
      createTransaction({ id: 'catering', amount: 25000, category: 'shopping', date: '2026-11-25', plannedCost: { eventId: 'party', month: '2026-10' } })
    ]
  });

  assert.equal(reportingMonthStats(state, '2026-10', '2026-11-17').spent, 0);
  assert.equal(scheduledMonthStats(state, '2026-10', '2026-11-17').spent, 25000);
  assert.equal(accountBalance(state, 'everyday', '2026-11-17'), 100000);
  assert.equal(reportingMonthStats(state, '2026-10', '2026-11-25').spent, 25000);
  assert.equal(reportingMonthStats(state, '2026-11', '2026-11-25').spent, 0, 'cash moves in November, spending stays in October');
  assert.equal(accountBalance(state, 'everyday', '2026-11-25'), 75000);
});

test('a payback dated later nets its original month and reaches the receiving account only from its date', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'dinner', amount: 12000, date: '2026-10-08' }),
    createTransaction({ id: 'friend-pays', type: 'reimbursement', account: 'shared', amount: 4000, date: '2026-11-25', linkedId: 'dinner' })
  ] });

  assert.equal(reportingMonthStats(state, '2026-10', '2026-11-17').spent, 12000);
  assert.deepEqual(scheduledMonthStats(state, '2026-10', '2026-11-17'), { income: 0, spent: -4000, balance: 4000, count: 1 });
  assert.equal(accountBalance(state, 'shared', '2026-11-17'), 50000);

  assert.equal(reportingMonthStats(state, '2026-10', '2026-11-25').spent, 8000);
  assert.equal(reportingMonthStats(state, '2026-11', '2026-11-25').income, 0, 'a payback never becomes income');
  assert.equal(accountBalance(state, 'shared', '2026-11-25'), 54000);
});

test('a future transfer moves cash only from its date and never enters a report', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'to-shared', type: 'transfer', account: 'everyday', toAccount: 'shared', category: undefined, amount: 15000, date: '2026-12-01' })
  ] });

  assert.deepEqual([accountBalance(state, 'everyday', '2026-11-30'), accountBalance(state, 'shared', '2026-11-30')], [100000, 50000]);
  assert.deepEqual([accountBalance(state, 'everyday', '2026-12-01'), accountBalance(state, 'shared', '2026-12-01')], [85000, 65000]);
  assert.deepEqual(scheduledMonthStats(state, '2026-12', '2026-11-30'), { income: 0, spent: 0, balance: 0, count: 0 });
  const december = reportingMonthStats(state, '2026-12', '2026-12-01');
  assert.deepEqual([december.income, december.spent], [0, 0]);
});

test('reports decide what has posted by the local date when no date is given', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'first', amount: 3000, date: '2026-12-01' })
  ] });

  // 00:30 on 1 December in Auckland is still 30 November in UTC.
  const auckland = atLocalTime('Pacific/Auckland', '2026-11-30T11:30:00Z', () => reportingMonthStats(state, '2026-12'));
  // 21:00 on 30 November in Los Angeles is already 1 December in UTC.
  const losAngeles = atLocalTime('America/Los_Angeles', '2026-12-01T05:00:00Z', () => [reportingMonthStats(state, '2026-12'), scheduledMonthStats(state, '2026-12')]);

  assert.equal(auckland.spent, 3000);
  assert.equal(losAngeles[0].spent, 0);
  assert.equal(losAngeles[1].spent, 3000);
});

test('forecasts treat the local date as today when no date is given', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'groceries', amount: 3000, date: '2026-11-20' })
  ] });

  // 21:00 on 30 November in Los Angeles is already 1 December in UTC.
  const [insights, outlook, estimate] = atLocalTime('America/Los_Angeles', '2026-12-01T05:00:00Z', () => [
    planInsights(state, '2026-11'),
    yearOutlook(state, 2026),
    expectedSavings(state, '2026-12')
  ]);

  assert.equal(insights.period, 'current');
  assert.equal(insights.elapsed, 30);
  assert.equal(outlook.months[10].period, 'current');
  assert.equal(estimate, null, 'November is not complete yet, so December has no history to estimate from');
});
