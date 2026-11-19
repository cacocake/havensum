import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, mergeThreeWay } from '../src/engine.js';
import { validateState } from '../src/stateSchema.js';
import { prepareFullRestore } from '../src/fullRestore.js';
import { expectedOccasionalEvents } from '../src/expectedOccasionalSpending.js';
import { monthStats } from '../src/ledger.js';
import { plannedCostOccurrences } from '../src/comparableCosts.js';
import { plannedCostOptions } from '../src/plannedCosts.js';
import { yearOutlook } from '../src/yearOutlook.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

// Owner decisions F16/F17: moving a recurring planned cost applies from a chosen
// year onwards; earlier years keep their original month.
const k_today = '2026-11-19';
const k_celebrations = { id: 'celebrations', name: 'December celebrations', month: 12, amount: 30000 };
const k_movedFrom2027 = { ...k_celebrations, monthFromYear: { 2027: 11 } };

function planEventTotals(plan) {
  return Object.fromEntries(Object.entries(plan.months).filter(([, month]) => month.event).map(([month, plannedMonth]) => [month, plannedMonth.event]));
}

test('a recurring planned cost moved from 2027 keeps its original month in earlier years in plans', () => {
  const state = createFinancialState({ events: [k_movedFrom2027] });
  const planOptions = { fromMonth: 1, income: 200000, cushion: 0, today: k_today };

  const plan2026 = buildPlan(state, { ...planOptions, year: 2026 });
  const plan2027 = buildPlan(state, { ...planOptions, year: 2027 });
  const plan2028 = buildPlan(state, { ...planOptions, year: 2028 });

  assert.deepEqual(planEventTotals(plan2026), { '2026-12': 30000 });
  assert.deepEqual(planEventTotals(plan2027), { '2027-11': 30000 });
  assert.deepEqual(planEventTotals(plan2028), { '2028-11': 30000 });
});

test('the forecast expects a moved planned cost in its original month before the move and its new month from then on', () => {
  const state = createFinancialState({ events: [k_movedFrom2027] });
  const expectedIn = month => expectedOccasionalEvents(state, month, monthStats(state, month), k_today).map(event => event.id);

  assert.deepEqual(['2026-11', '2026-12', '2027-11', '2027-12'].map(expectedIn), [[], ['celebrations'], ['celebrations'], []]);
});

function celebrationsPayment(id, date, amount, month) {
  return createTransaction({ id, date, amount, category: 'shopping', plannedCost: { eventId: 'celebrations', month } });
}

test('expenses linked to earlier years stay completed evidence after a move, and an old-month link in a moved year needs review', () => {
  const movedFrom2026 = { ...k_celebrations, monthFromYear: { 2026: 11 } };
  const state = createFinancialState({
    events: [movedFrom2026],
    outlook: { completeMonths: ['2024-12', '2025-12', '2026-10'] },
    transactions: [
      celebrationsPayment('gifts-2024', '2024-12-20', 28000, '2024-12'),
      celebrationsPayment('gifts-2025', '2025-12-20', 31000, '2025-12'),
      celebrationsPayment('early-deposit-2026', '2026-10-15', 9000, '2026-12')
    ]
  });

  const occurrences = plannedCostOccurrences(state, movedFrom2026, '2026-12-01');

  assert.deepEqual(occurrences.map(occurrence => [occurrence.month, occurrence.status, occurrence.actual]), [
    ['2024-12', 'completed', 28000],
    ['2025-12', 'completed', 31000],
    ['2026-11', 'needsReview', 0]
  ]);
});

test('the planned-cost picker offers the original month before the move and the new month from the moved year', () => {
  const state = createFinancialState({ events: [k_movedFrom2027] });

  const labels = plannedCostOptions(state.events, '2026-11-19', undefined).map(option => option.label);

  assert.deepEqual(labels, ['December celebrations · December 2025', 'December celebrations · December 2026', 'December celebrations · November 2027']);
});

test('Year ahead lists a moved planned cost in its month for that year', () => {
  const state = createFinancialState({ events: [k_movedFrom2027] });

  const months = year => yearOutlook(state, year, k_today).drivers.namedCosts.map(cost => cost.month);

  assert.deepEqual([months(2026), months(2027)], [['2026-12'], ['2027-11']]);
});

test('Expected costs asks to review an old-month expense only in a moved year', () => {
  const state = createFinancialState({
    events: [k_movedFrom2027],
    transactions: [
      celebrationsPayment('gifts-2026', '2026-11-10', 12000, '2026-12'),
      celebrationsPayment('early-booking-2027', '2026-11-12', 8000, '2027-12')
    ]
  });
  const expected = month => expectedOccasionalEvents(state, month, monthStats(state, month), k_today)[0];

  const december2026 = expected('2026-12');
  const november2027 = expected('2027-11');

  assert.deepEqual([december2026.paid, december2026.paymentsToReview.map(payment => payment.id)], [12000, []]);
  assert.deepEqual(november2027.paymentsToReview.map(payment => payment.id), ['early-booking-2027']);
});

test('stored month moves must map four-digit years to months on a recurring planned cost', () => {
  const valid = createFinancialState({ events: [k_movedFrom2027] });
  const invalidEvents = [
    { ...k_celebrations, monthFromYear: { 2027: 13 } },
    { ...k_celebrations, monthFromYear: { 2027: 0 } },
    { ...k_celebrations, monthFromYear: { 2027: 10.5 } },
    { ...k_celebrations, monthFromYear: { '27': 11 } },
    { ...k_celebrations, monthFromYear: [11] },
    { ...k_celebrations, monthFromYear: null },
    { ...k_movedFrom2027, year: 2027 }
  ];

  assert.equal(validateState(valid), valid);
  for (const event of invalidEvents) {
    assert.throws(() => validateState(createFinancialState({ events: [event] })), /event month moves/);
  }
});

test('two devices moving one planned cost differently produce a conflict to review', () => {
  const base = createFinancialState({ events: [k_celebrations] });
  const local = createFinancialState({ events: [k_movedFrom2027] });
  const remote = createFinancialState({ events: [{ ...k_celebrations, monthFromYear: { 2027: 10 } }] });

  const { conflicts } = mergeThreeWay(base, local, remote);

  assert.deepEqual(conflicts.map(conflict => [conflict.collection, conflict.field]), [['events', 'monthFromYear']]);
});

test('a move made on one device merges cleanly when the other device left the planned cost alone', () => {
  const base = createFinancialState({ events: [k_celebrations] });
  const local = createFinancialState({ events: [k_movedFrom2027] });

  const { result, conflicts } = mergeThreeWay(base, local, base);

  assert.deepEqual([conflicts, result.events[0].monthFromYear], [[], { 2027: 11 }]);
});

test('a full restore keeps month moves', () => {
  const backup = createFinancialState({ events: [k_movedFrom2027] });

  const { restoredState } = prepareFullRestore(JSON.stringify(backup));

  assert.deepEqual(restoredState.events[0].monthFromYear, { 2027: 11 });
});
