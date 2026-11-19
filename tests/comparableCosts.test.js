import test from 'node:test';
import assert from 'node:assert/strict';
import { comparableCostEstimate, comparableOccurrences, plannedCostOccurrences } from '../src/comparableCosts.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

const k_today = '2026-11-19';
const k_celebrations = { id: 'celebrations', name: 'December celebrations', month: 12, amount: 30000 };

function linkedPayment(overrides) {
  return createTransaction({ category: 'shopping', plannedCost: { eventId: 'celebrations', month: '2025-12' }, ...overrides });
}

test('a completed occurrence reports its linked payments net of linked paybacks', () => {
  const state = createFinancialState({
    events: [k_celebrations],
    outlook: { completeMonths: ['2025-12'] },
    transactions: [
      linkedPayment({ id: 'gifts', date: '2025-11-20', amount: 25000 }),
      linkedPayment({ id: 'dinner', date: '2025-12-24', amount: 18000 }),
      { id: 'dinner-share', type: 'reimbursement', linkedId: 'dinner', amount: 6000, date: '2026-01-05', account: 'everyday', title: 'Share' }
    ]
  });

  const [occurrence] = plannedCostOccurrences(state, k_celebrations, k_today);

  assert.deepEqual(occurrence, { month: '2025-12', status: 'completed', actual: 37000, paymentIds: ['gifts', 'dinner'] });
});

function celebrationsState(overrides = {}) {
  return createFinancialState({ events: [k_celebrations], outlook: { completeMonths: ['2025-12'] }, ...overrides });
}

test('a partly paid occurrence in a month the owner has not confirmed complete is not evidence', () => {
  const state = celebrationsState({
    outlook: { completeMonths: [] },
    transactions: [linkedPayment({ id: 'deposit', date: '2025-12-02', amount: 9000 })]
  });

  const [occurrence] = plannedCostOccurrences(state, k_celebrations, k_today);

  assert.equal(occurrence.status, 'unconfirmed');
  assert.equal(occurrence.actual, 9000);
});

test('a payment still linked to a moved occurrence needs review before the cost counts', () => {
  const movedCelebrations = { ...k_celebrations, month: 11 };
  const state = celebrationsState({
    events: [movedCelebrations],
    outlook: { completeMonths: ['2025-11', '2025-12'] },
    transactions: [linkedPayment({ id: 'gifts', date: '2025-11-20', amount: 25000 })]
  });

  const occurrences = plannedCostOccurrences(state, movedCelebrations, k_today);

  assert.deepEqual(occurrences.map(occurrence => [occurrence.month, occurrence.status]), [['2025-11', 'needsReview']]);
});

test('an occurrence with a payback still expected is held back until the payback is received or closed', () => {
  const state = celebrationsState({
    transactions: [linkedPayment({ id: 'dinner', date: '2025-12-24', amount: 18000 })],
    paybackTasksVersion: 1,
    paybackTasks: [{ id: 'dinner-task', expenseId: 'dinner', expectedAmount: 6000, person: 'Marina', dueDate: '', note: '',
      createdAt: '2025-12-24T12:00:00.000Z', updatedAt: '2025-12-24T12:00:00.000Z', manuallyClosed: false, closureHistory: [] }]
  });

  assert.equal(plannedCostOccurrences(state, k_celebrations, k_today)[0].status, 'awaitingPayback');

  const closed = { ...state, paybackTasks: [{ ...state.paybackTasks[0], manuallyClosed: true }] };
  const [occurrence] = plannedCostOccurrences(closed, k_celebrations, k_today);
  assert.equal(occurrence.status, 'completed');
  assert.equal(occurrence.actual, 18000);
});

test('a confirmed month without linked payments is reported, not counted as a €0 cost', () => {
  const state = celebrationsState({
    transactions: [createTransaction({ id: 'unlinked-gifts', category: 'shopping', date: '2025-12-20', amount: 22000 })]
  });

  const [occurrence] = plannedCostOccurrences(state, k_celebrations, k_today);

  assert.deepEqual(occurrence, { month: '2025-12', status: 'noPayments', actual: 0, paymentIds: [] });
});

test('only completed months before today are occurrences, starting from the first recorded year', () => {
  const state = celebrationsState({
    transactions: [createTransaction({ id: 'first-record', date: '2024-03-01' })]
  });

  const months = plannedCostOccurrences(state, k_celebrations, k_today).map(occurrence => occurrence.month);
  const novemberEvent = { ...k_celebrations, month: 11 };
  const novemberMonths = plannedCostOccurrences(state, novemberEvent, k_today).map(occurrence => occurrence.month);

  assert.deepEqual(months, ['2024-12', '2025-12']);
  assert.deepEqual(novemberMonths, ['2024-11', '2025-11']);
  assert.deepEqual(plannedCostOccurrences(createFinancialState(), k_celebrations, k_today), []);
});

test('a one-off cost has a single occurrence in its own year', () => {
  const trip = { id: 'lisbon', name: 'Lisbon weekend', month: 5, year: 2026, amount: 60000 };
  const state = createFinancialState({
    events: [trip],
    outlook: { completeMonths: ['2026-05'] },
    transactions: [createTransaction({ id: 'train', category: 'shopping', date: '2026-04-10', amount: 21000, plannedCost: { eventId: 'lisbon', month: '2026-05', singleOccurrence: true } })]
  });

  assert.deepEqual(plannedCostOccurrences(state, trip, k_today), [{ month: '2026-05', status: 'completed', actual: 21000, paymentIds: ['train'] }]);
  assert.deepEqual(plannedCostOccurrences(state, trip, '2026-05-20'), []);
});

test('an earlier evaluation date sees only payments and paybacks recorded by then', () => {
  const state = celebrationsState({
    transactions: [
      linkedPayment({ id: 'dinner', date: '2025-12-24', amount: 18000 }),
      { id: 'late-share', type: 'reimbursement', linkedId: 'dinner', amount: 6000, date: '2026-02-01', account: 'everyday', title: 'Share' }
    ]
  });

  assert.equal(plannedCostOccurrences(state, k_celebrations, '2026-01-15')[0].actual, 18000);
  assert.equal(plannedCostOccurrences(state, k_celebrations, k_today)[0].actual, 12000);
});

// One December payment per year, every December confirmed complete.
function yearlyCelebrations(storedAmount, actualsByYear) {
  const event = { ...k_celebrations, amount: storedAmount };
  const years = Object.keys(actualsByYear);
  return {
    event,
    state: createFinancialState({
      events: [event],
      outlook: { completeMonths: years.map(year => `${year}-12`) },
      transactions: years.map(year => linkedPayment({
        id: `celebrations-${year}`, date: `${year}-12-10`, amount: actualsByYear[year], plannedCost: { eventId: 'celebrations', month: `${year}-12` }
      }))
    })
  };
}

// Predicts each December from what was known on its first day.
function backtest({ state, event }, years) {
  return years.map(year => {
    const estimate = comparableCostEstimate(comparableOccurrences(state, event, `${year}-12-01`));
    const [actualOccurrence] = plannedCostOccurrences(state, event, `${year + 1}-01-01`).slice(-1);
    return { year, actual: actualOccurrence.actual, estimate: estimate.estimate, baselineError: Math.abs(event.amount - actualOccurrence.actual),
      estimateError: Math.abs(estimate.estimate - actualOccurrence.actual) };
  });
}

test('with fewer than two completed occurrences there is no estimate and the owner enters an amount', () => {
  const { state, event } = yearlyCelebrations(30000, { 2025: 41000 });

  const estimate = comparableCostEstimate(comparableOccurrences(state, event, k_today));

  assert.deepEqual(estimate, { enough: false, comparable: [{ month: '2025-12', status: 'completed', actual: 41000, paymentIds: ['celebrations-2025'] }] });
});

test('the estimate is the median of completed occurrences with their range, skipping occurrences that are not evidence', () => {
  const { state, event } = yearlyCelebrations(30000, { 2022: 38000, 2023: 45000, 2024: 41000, 2025: 42000 });
  const withUnconfirmedYear = { ...state, outlook: { completeMonths: ['2022-12', '2023-12', '2024-12'] } };

  const estimate = comparableCostEstimate(comparableOccurrences(state, event, k_today));
  const withoutLatest = comparableCostEstimate(comparableOccurrences(withUnconfirmedYear, event, k_today));

  assert.deepEqual({ ...estimate, comparable: estimate.comparable.map(occurrence => occurrence.month) },
    { enough: true, estimate: 41500, low: 38000, high: 45000, comparable: ['2022-12', '2023-12', '2024-12', '2025-12'] });
  assert.equal(withoutLatest.estimate, 41000);
  assert.deepEqual(withoutLatest.comparable.map(occurrence => occurrence.month), ['2022-12', '2023-12', '2024-12']);
});

test('a one-off cost has no comparable occurrences without an explicit comparison rule', () => {
  const lastTrip = { id: 'lisbon-2025', name: 'Lisbon weekend', month: 5, year: 2025, amount: 60000 };
  const nextTrip = { id: 'lisbon-2026', name: 'Lisbon weekend', month: 5, year: 2026, amount: 60000 };
  const state = createFinancialState({
    events: [lastTrip, nextTrip],
    outlook: { completeMonths: ['2025-05'] },
    transactions: [createTransaction({ id: 'train', category: 'shopping', date: '2025-05-10', amount: 21000, plannedCost: { eventId: 'lisbon-2025', month: '2025-05', singleOccurrence: true } })]
  });

  assert.deepEqual(comparableOccurrences(state, nextTrip, '2026-04-01'), []);
});

test('backtest: when the stored amount is consistently low, past occurrences predict better', () => {
  const results = backtest(yearlyCelebrations(30000, { 2021: 41000, 2022: 38000, 2023: 45000, 2024: 42000, 2025: 40000 }), [2023, 2024, 2025]);

  // Medians worked by hand: 2023 from 410/380 → 395; 2024 from 410/380/450 → 410; 2025 from 410/380/450/420 → 415.
  assert.deepEqual(results.map(result => result.estimate), [39500, 41000, 41500]);
  assert.deepEqual(results.map(result => result.estimateError), [5500, 1000, 1500]);
  assert.deepEqual(results.map(result => result.baselineError), [15000, 12000, 10000]);
});

test('backtest: when the stored amount is already accurate, past occurrences add noise', () => {
  const results = backtest(yearlyCelebrations(40000, { 2021: 36000, 2022: 44000, 2023: 39000, 2024: 41000, 2025: 40000 }), [2023, 2024, 2025]);

  // 2023 from 360/440 → 400; 2024 from 360/440/390 → 390; 2025 from 360/440/390/410 → 400.
  assert.deepEqual(results.map(result => result.estimateError), [1000, 2000, 0]);
  assert.deepEqual(results.map(result => result.baselineError), [1000, 1000, 0]);
});

test('backtest: one unusual year barely moves the median, unlike an average', () => {
  const [result] = backtest(yearlyCelebrations(40000, { 2021: 40000, 2022: 42000, 2023: 120000, 2024: 41000, 2025: 40500 }), [2025]);
  const averageOfEarlierYears = (40000 + 42000 + 120000 + 41000) / 4;

  assert.equal(result.estimate, 41500);
  assert.equal(result.estimateError, 1000);
  assert.equal(Math.abs(averageOfEarlierYears - result.actual), 20250);
});

test('backtest: a steadily rising cost makes the median lag behind', () => {
  const [result] = backtest(yearlyCelebrations(30000, { 2022: 30000, 2023: 33000, 2024: 36000, 2025: 39000 }), [2025]);

  // 2025 from 300/330/360 → 330, while the latest year alone was 360.
  assert.equal(result.estimate, 33000);
  assert.equal(result.estimateError, 6000);
  assert.equal(result.baselineError, 9000);
});

test('an even number of occurrences gives a median in whole cents', () => {
  const { state, event } = yearlyCelebrations(30000, { 2024: 40000, 2025: 40001 });

  assert.equal(comparableCostEstimate(comparableOccurrences(state, event, k_today)).estimate, 40001);
});
