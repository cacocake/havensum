import test from 'node:test';
import assert from 'node:assert/strict';
import { comparableCostEstimate, comparableLikeChoices, comparableOccurrences, plannedCostOccurrences } from '../src/comparableCosts.js';
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

test('occurrences are the past months from the first recorded year onwards', () => {
  const state = celebrationsState({
    transactions: [createTransaction({ id: 'later-record', date: '2025-06-01' }), createTransaction({ id: 'first-record', date: '2024-03-01' })]
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

test('with fewer than three completed occurrences there is no estimate and the owner enters an amount', () => {
  const { state, event } = yearlyCelebrations(30000, { 2024: 40000, 2025: 41000 });

  const estimate = comparableCostEstimate(comparableOccurrences(state, event, k_today));

  assert.equal(estimate.hasEnoughEvidence, false);
  assert.deepEqual(estimate.comparable, [
    { eventId: 'celebrations', name: 'December celebrations', month: '2024-12', actual: 40000, topCategory: 'shopping' },
    { eventId: 'celebrations', name: 'December celebrations', month: '2025-12', actual: 41000, topCategory: 'shopping' }
  ]);
});

test('the estimate uses only the five most recent comparable occurrences', () => {
  const { state, event } = yearlyCelebrations(30000, { 2020: 100000, 2021: 40000, 2022: 41000, 2023: 42000, 2024: 43000, 2025: 44000 });

  const estimate = comparableCostEstimate(comparableOccurrences(state, event, k_today));

  // 2021–2025: 400/410/420/430/440 → median 420, range 400–440. With 2020 the median would be 415.
  assert.deepEqual({ ...estimate, comparable: estimate.comparable.map(occurrence => occurrence.month) },
    { hasEnoughEvidence: true, estimate: 42000, low: 40000, high: 44000, comparable: ['2021-12', '2022-12', '2023-12', '2024-12', '2025-12'] });
});

test('the estimate is the median of completed occurrences with their range, skipping occurrences that are not evidence', () => {
  const { state, event } = yearlyCelebrations(30000, { 2022: 38000, 2023: 45000, 2024: 41000, 2025: 42000 });
  const withUnconfirmedYear = { ...state, outlook: { completeMonths: ['2022-12', '2023-12', '2024-12'] } };

  const estimate = comparableCostEstimate(comparableOccurrences(state, event, k_today));
  const withoutLatest = comparableCostEstimate(comparableOccurrences(withUnconfirmedYear, event, k_today));

  assert.deepEqual({ ...estimate, comparable: estimate.comparable.map(occurrence => occurrence.month) },
    { hasEnoughEvidence: true, estimate: 41500, low: 38000, high: 45000, comparable: ['2022-12', '2023-12', '2024-12', '2025-12'] });
  assert.equal(withoutLatest.estimate, 41000);
  assert.deepEqual([withoutLatest.low, withoutLatest.high], [38000, 45000]);
  assert.deepEqual(withoutLatest.comparable.map(occurrence => occurrence.month), ['2022-12', '2023-12', '2024-12']);
});

const k_tripCategories = [
  { id: 'travel', name: 'Travel', kind: 'Occasional' },
  { id: 'flights', name: 'Flights', parentId: 'travel' },
  { id: 'hotels', name: 'Hotels', parentId: 'travel' }
];

function tripCost(id, year, month) {
  return { id, name: `Trip ${id}`, year, month, amount: 50000 };
}

function tripExpense(eventId, monthKey, id, category, amount) {
  return createTransaction({ id, category, amount, date: `${monthKey}-05`, plannedCost: { eventId, month: monthKey, singleOccurrence: true } });
}

function pastTripsState(extraTransactions = []) {
  const events = [tripCost('lisbon', 2024, 5), tripCost('azores', 2025, 3), tripCost('porto', 2025, 9), tripCost('madeira', 2026, 12)];
  return {
    events,
    nextTrip: events[3],
    state: createFinancialState({
      categories: [...createFinancialState().categories, ...k_tripCategories],
      events,
      outlook: { completeMonths: ['2024-05', '2025-03', '2025-09'] },
      transactions: [
        tripExpense('lisbon', '2024-05', 'lisbon-flight', 'flights', 15000),
        tripExpense('lisbon', '2024-05', 'lisbon-hotel', 'hotels', 20000),
        tripExpense('azores', '2025-03', 'azores-flight', 'flights', 40000),
        tripExpense('porto', '2025-09', 'porto-hotel', 'hotels', 30000),
        tripExpense('porto', '2025-09', 'porto-dinner', 'groceries', 5000),
        ...extraTransactions
      ]
    })
  };
}

test('planned costs whose linked expenses share a top category compare, with subcategories rolled up to their parent', () => {
  const { state, nextTrip } = pastTripsState();

  const likePorto = comparableOccurrences(state, nextTrip, k_today, { eventId: 'porto' });
  const likeFlights = comparableOccurrences(state, nextTrip, k_today, { categoryId: 'flights' });

  // Lisbon €150 + €200 and Azores €400 are all Travel; Porto's €300 hotel outweighs its €50 dinner.
  assert.deepEqual(likePorto, [
    { eventId: 'lisbon', name: 'Trip lisbon', month: '2024-05', actual: 35000, topCategory: 'travel' },
    { eventId: 'azores', name: 'Trip azores', month: '2025-03', actual: 40000, topCategory: 'travel' },
    { eventId: 'porto', name: 'Trip porto', month: '2025-09', actual: 35000, topCategory: 'travel' }
  ]);
  assert.deepEqual(likeFlights, likePorto);
  assert.deepEqual(comparableCostEstimate(likePorto).estimate, 35000);
});

test('a new one-off planned cost without a like choice has nothing to compare with', () => {
  const { state, nextTrip } = pastTripsState();

  assert.deepEqual(comparableOccurrences(state, nextTrip, k_today), []);
  assert.deepEqual(comparableOccurrences(state, nextTrip, k_today, { eventId: 'madeira' }), []);
});

test('the top category is the one with the largest share after paybacks', () => {
  const hotelRefund = { id: 'porto-refund', type: 'reimbursement', linkedId: 'porto-hotel', amount: 28000, date: '2025-09-20', account: 'everyday', title: 'Refund' };
  const { state, nextTrip } = pastTripsState([hotelRefund]);

  const months = comparableOccurrences(state, nextTrip, k_today, { categoryId: 'travel' }).map(occurrence => occurrence.month);
  const groceryLike = comparableOccurrences(state, nextTrip, k_today, { categoryId: 'groceries' });

  // Porto is now €20 of hotel against €50 of groceries.
  assert.deepEqual(months, ['2024-05', '2025-03']);
  assert.deepEqual(groceryLike.map(occurrence => [occurrence.eventId, occurrence.actual]), [['porto', 7000]]);
});

test('a recurring planned cost compares with its own past years and with other costs in its top category', () => {
  const birthday = { id: 'birthday', name: 'Big birthday', year: 2025, month: 6, amount: 20000 };
  const { state } = yearlyCelebrations(30000, { 2023: 40000, 2024: 41000 });
  const withBirthday = {
    ...state,
    events: [...state.events, birthday],
    outlook: { completeMonths: [...state.outlook.completeMonths, '2025-06'] },
    transactions: [...state.transactions, linkedPayment({ id: 'party', date: '2025-06-10', amount: 26000, plannedCost: { eventId: 'birthday', month: '2025-06', singleOccurrence: true } })]
  };

  const comparable = comparableOccurrences(withBirthday, k_celebrations, k_today);

  assert.deepEqual(comparable.map(occurrence => [occurrence.eventId, occurrence.month]),
    [['celebrations', '2023-12'], ['celebrations', '2024-12'], ['birthday', '2025-06']]);
  assert.equal(comparableCostEstimate(comparable).estimate, 40000);
});

test('uncategorized expenses never match a category', () => {
  const uncategorized = { ...createTransaction({ id: 'misc', amount: 9000, date: '2025-03-06', plannedCost: { eventId: 'azores', month: '2025-03', singleOccurrence: true } }), category: '' };
  const { state, nextTrip } = pastTripsState([uncategorized]);
  const onlyUncategorized = { ...state, transactions: state.transactions.filter(transaction => !transaction.id.startsWith('azores-')) };

  assert.deepEqual(comparableOccurrences(onlyUncategorized, nextTrip, k_today, { eventId: 'azores' }), []);
  assert.deepEqual(comparableOccurrences(onlyUncategorized, nextTrip, k_today, { categoryId: 'travel' }).map(occurrence => occurrence.eventId), ['lisbon', 'porto']);
});

test('backtest: when the stored amount is consistently low, past occurrences predict better', () => {
  const results = backtest(yearlyCelebrations(30000, { 2021: 41000, 2022: 38000, 2023: 45000, 2024: 42000, 2025: 40000 }), [2024, 2025]);

  // Medians worked by hand: 2024 from 410/380/450 → 410; 2025 from 410/380/450/420 → 415.
  assert.deepEqual(results.map(result => result.estimate), [41000, 41500]);
  assert.deepEqual(results.map(result => result.estimateError), [1000, 1500]);
  assert.deepEqual(results.map(result => result.baselineError), [12000, 10000]);
});

test('backtest: when the stored amount is already accurate, past occurrences add noise', () => {
  const results = backtest(yearlyCelebrations(40000, { 2021: 36000, 2022: 44000, 2023: 39000, 2024: 41000, 2025: 40000 }), [2024, 2025]);

  // 2024 from 360/440/390 → 390; 2025 from 360/440/390/410 → 400.
  assert.deepEqual(results.map(result => result.estimateError), [2000, 0]);
  assert.deepEqual(results.map(result => result.baselineError), [1000, 0]);
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
  const { state, event } = yearlyCelebrations(30000, { 2022: 40000, 2023: 40000, 2024: 40001, 2025: 40001 });

  assert.equal(comparableCostEstimate(comparableOccurrences(state, event, k_today)).estimate, 40001);
});

test('an earlier evaluation date ignores payback tasks created after it', () => {
  const state = celebrationsState({
    transactions: [linkedPayment({ id: 'dinner', date: '2025-12-24', amount: 18000 })],
    paybackTasksVersion: 1,
    paybackTasks: [{ id: 'dinner-task', expenseId: 'dinner', expectedAmount: 6000, person: 'Marina', dueDate: '', note: '',
      createdAt: '2026-03-01T12:00:00.000Z', updatedAt: '2026-03-01T12:00:00.000Z', manuallyClosed: false, closureHistory: [] }]
  });

  assert.equal(plannedCostOccurrences(state, k_celebrations, '2026-02-01')[0].status, 'completed');
  assert.equal(plannedCostOccurrences(state, k_celebrations, k_today)[0].status, 'awaitingPayback');
});

function dinnerTask(overrides = {}) {
  return { id: 'dinner-task', expenseId: 'dinner', expectedAmount: 6000, person: 'Marina', dueDate: '', note: '',
    createdAt: '2025-12-24T12:00:00.000Z', updatedAt: '2025-12-24T12:00:00.000Z', manuallyClosed: false, closureHistory: [],
    ...overrides };
}

function share(id, amount, date) {
  return { id, type: 'reimbursement', linkedId: 'dinner', amount, date, account: 'everyday', title: 'Share' };
}

test('a partly received payback keeps the occurrence held back until the rest arrives', () => {
  const dinner = linkedPayment({ id: 'dinner', date: '2025-12-24', amount: 18000 });
  const partlyReceived = celebrationsState({ transactions: [dinner, share('first-share', 2000, '2026-01-05')],
    paybackTasksVersion: 1, paybackTasks: [dinnerTask()] });
  const fullyReceived = { ...partlyReceived, transactions: [...partlyReceived.transactions, share('second-share', 4000, '2026-02-05')] };

  assert.equal(plannedCostOccurrences(partlyReceived, k_celebrations, k_today)[0].status, 'awaitingPayback');
  assert.deepEqual(plannedCostOccurrences(fullyReceived, k_celebrations, k_today)[0],
    { month: '2025-12', status: 'completed', actual: 12000, paymentIds: ['dinner'] });
});

test('a refund that is not linked to a payment does not reduce the cost', () => {
  const state = celebrationsState({ transactions: [
    linkedPayment({ id: 'dinner', date: '2025-12-24', amount: 18000 }),
    { id: 'bank-refund', type: 'reimbursement', amount: 5000, date: '2025-12-28', account: 'everyday', title: 'Refund' },
    { id: 'salary', type: 'income', amount: 200000, date: '2025-12-28', account: 'everyday', category: 'salary', title: 'Salary' }
  ] });

  assert.equal(plannedCostOccurrences(state, k_celebrations, k_today)[0].actual, 18000);
});

test('an unconfirmed month stays unconfirmed even with a payback expected, and review comes first', () => {
  const unconfirmedWithTask = celebrationsState({ outlook: { completeMonths: [] },
    transactions: [linkedPayment({ id: 'dinner', date: '2025-12-24', amount: 18000 })], paybackTasksVersion: 1, paybackTasks: [dinnerTask()] });
  const movedCelebrations = { ...k_celebrations, month: 11 };
  const unconfirmedToReview = createFinancialState({ events: [movedCelebrations], outlook: { completeMonths: [] },
    transactions: [linkedPayment({ id: 'gifts', date: '2025-11-20', amount: 25000 })] });

  assert.equal(plannedCostOccurrences(unconfirmedWithTask, k_celebrations, k_today)[0].status, 'unconfirmed');
  assert.equal(plannedCostOccurrences(unconfirmedToReview, movedCelebrations, k_today)[0].status, 'needsReview');
});

test('a payment linked to another year of a recurring cost does not ask the next occurrence for review', () => {
  const movedCelebrations = { ...k_celebrations, month: 11 };
  const state = createFinancialState({ events: [movedCelebrations], outlook: { completeMonths: ['2024-11', '2025-11'] },
    transactions: [linkedPayment({ id: 'gifts-2024', date: '2024-12-10', amount: 25000, plannedCost: { eventId: 'celebrations', month: '2024-12' } })] });

  const statuses = plannedCostOccurrences(state, movedCelebrations, k_today).map(occurrence => [occurrence.month, occurrence.status]);

  assert.deepEqual(statuses, [['2024-11', 'needsReview'], ['2025-11', 'noPayments']]);
});

// Owner decision F14: a cancelled cost whose expenses were fully refunded is not evidence.
test('a fully refunded occurrence is excluded rather than counted as a €0 cost', () => {
  const state = celebrationsState({ transactions: [
    linkedPayment({ id: 'dinner', date: '2025-12-02', amount: 18000 }),
    share('full-refund', 18000, '2025-12-20')
  ] });

  assert.deepEqual(plannedCostOccurrences(state, k_celebrations, k_today)[0],
    { month: '2025-12', status: 'refunded', actual: 0, paymentIds: ['dinner'] });
});

// Owner decision F14: a payment matched through the older "Recorded expense
// for …" choice is not linked to an occurrence and is not evidence.
test('a payment matched only through the older recorded-expense choice is not counted', () => {
  const state = celebrationsState({
    outlook: { completeMonths: ['2025-12'], eventPayments: { celebrations: 'gifts' } },
    transactions: [createTransaction({ id: 'gifts', category: 'shopping', date: '2025-12-10', amount: 25000 })]
  });

  assert.equal(plannedCostOccurrences(state, k_celebrations, k_today)[0].status, 'noPayments');
});

// Owner decision F16 (a move applies from a chosen year) waits for a screen
// that moves planned costs; none exists. Until then a whole-cost move leaves
// earlier years waiting for review.
test('moving a recurring cost to an earlier month removes the earlier years from the evidence', () => {
  const { state } = yearlyCelebrations(30000, { 2023: 40000, 2024: 41000, 2025: 42000 });
  const movedCelebrations = { ...k_celebrations, month: 11 };
  const movedState = { ...state, events: [movedCelebrations] };

  assert.equal(comparableCostEstimate(comparableOccurrences(state, k_celebrations, k_today)).estimate, 41000);
  assert.deepEqual(plannedCostOccurrences(movedState, movedCelebrations, k_today).map(occurrence => occurrence.status),
    ['needsReview', 'needsReview', 'needsReview']);
  assert.equal(comparableCostEstimate(comparableOccurrences(movedState, movedCelebrations, k_today)).hasEnoughEvidence, false);
});

test('a like choice naming a removed planned cost compares with nothing else', () => {
  const { state, nextTrip } = pastTripsState();

  assert.deepEqual(comparableOccurrences(state, nextTrip, k_today, { eventId: 'removed-trip' }), []);
});

test('equal category shares choose the category whose ID sorts first', () => {
  const { state, nextTrip } = pastTripsState([tripExpense('azores', '2025-03', 'azores-groceries', 'groceries', 40000)]);

  // Azores is now €400 of groceries and €400 of travel; "groceries" sorts before "travel".
  assert.deepEqual(comparableOccurrences(state, nextTrip, k_today, { categoryId: 'groceries' }).map(occurrence => occurrence.eventId), ['azores']);
});

test('like choices list past planned costs with completed evidence and top-level spending categories', () => {
  const { state } = pastTripsState();

  const choices = comparableLikeChoices(state, k_today);

  assert.deepEqual(choices.plannedCosts, [
    { like: { eventId: 'azores' }, label: 'Trip azores · Mar 2025' },
    { like: { eventId: 'lisbon' }, label: 'Trip lisbon · May 2024' },
    { like: { eventId: 'porto' }, label: 'Trip porto · Sep 2025' }
  ]);
  assert.deepEqual(choices.categories.map(choice => choice.like.categoryId),
    ['groceries', 'rent', 'shopping', 'travel']);
  assert.equal(choices.categories.find(choice => choice.like.categoryId === 'travel').label, 'Travel');
});
