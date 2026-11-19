import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, mergeThreeWay } from '../src/engine.js';
import { approvePlanRevision } from '../src/planArchive.js';
import { expectedSavings } from '../src/expectedSavings.js';
import { yearOutlook } from '../src/yearOutlook.js';
import { prepareFullRestore } from '../src/fullRestore.js';
import { validateState } from '../src/stateSchema.js';
import { plannedCostAmount, plannedCostOptions, plannedCostsInYear } from '../src/plannedCosts.js';
import { plannedCostOccurrences } from '../src/comparableCosts.js';
import { k_moveErrors, movePlannedCost, plannedCostMoveYears } from '../src/plannedCostMoves.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

// Owner decision P04: a recurring planned cost added in a year's draft counts
// from that year onwards. Costs without a start year apply to every year.
const k_today = '2026-11-19';
const k_ski = { id: 'ski', name: 'Ski week', month: 2, amount: 90000, fromYear: 2027 };

function planEventTotals(plan) {
  return Object.fromEntries(Object.entries(plan.months).filter(([, month]) => month.event).map(([month, plannedMonth]) => [month, plannedMonth.event]));
}

test('a recurring planned cost starting in 2027 is left out of 2026 plans and included from 2027', () => {
  const state = createFinancialState({ events: [k_ski] });
  const planOptions = { fromMonth: 1, income: 200000, cushion: 0, today: k_today };

  const plan2026 = buildPlan(state, { ...planOptions, year: 2026 });
  const plan2027 = buildPlan(state, { ...planOptions, year: 2027 });
  const plan2029 = buildPlan(state, { ...planOptions, year: 2029 });

  assert.deepEqual(planEventTotals(plan2026), {});
  assert.deepEqual(planEventTotals(plan2027), { '2027-02': 90000 });
  assert.deepEqual(planEventTotals(plan2029), { '2029-02': 90000 });
});

test('a stored start year must be a four-digit year on a recurring planned cost', () => {
  const valid = createFinancialState({ events: [k_ski] });
  const invalidEvents = [
    { ...k_ski, fromYear: '2027' },
    { ...k_ski, fromYear: 2027.5 },
    { ...k_ski, fromYear: 27 },
    { ...k_ski, fromYear: null },
    { ...k_ski, year: 2027 }
  ];

  assert.equal(validateState(valid), valid);
  for (const event of invalidEvents) {
    assert.throws(() => validateState(createFinancialState({ events: [event] })), /event start year/);
  }
});

test('the planned-cost picker offers a recurring cost only from its start year', () => {
  const labels = plannedCostOptions([k_ski], '2026-11-19', undefined).map(option => option.label);

  assert.deepEqual(labels, ['Ski week · February 2027']);
});

test('a link saved to a year before the start stays selectable in the picker', () => {
  const savedLink = { eventId: 'ski', month: '2026-02' };

  const labels = plannedCostOptions([k_ski], '2026-11-19', savedLink).map(option => option.label);

  assert.deepEqual(labels, ['Ski week · original month 2026-02', 'Ski week · February 2027']);
});

test('comparable-cost evidence counts a recurring cost only from its start year', () => {
  const startedIn2025 = { ...k_ski, fromYear: 2025 };
  const skiPayment = (id, date, month) => createTransaction({ id, date, amount: 85000, category: 'shopping', plannedCost: { eventId: 'ski', month } });
  const state = createFinancialState({
    events: [startedIn2025],
    outlook: { completeMonths: ['2024-02', '2025-02', '2026-02'] },
    transactions: [
      createTransaction({ id: 'groceries-2024', date: '2024-01-10' }),
      skiPayment('ski-2025', '2025-02-10', '2025-02'),
      skiPayment('ski-2026', '2026-02-10', '2026-02')
    ]
  });

  const months = plannedCostOccurrences(state, startedIn2025, k_today).map(occurrence => occurrence.month);

  assert.deepEqual(months, ['2025-02', '2026-02']);
});

test('a payment for a recurring cost with no line in the drafted year counts as occasional history', () => {
  const startsIn2028 = { ...k_ski, fromYear: 2028 };
  const state = createFinancialState({
    events: [startsIn2028],
    outlook: { completeMonths: ['2026-02'] },
    transactions: [createTransaction({ id: 'ski-deposit', category: 'shopping', date: '2026-02-05', amount: 24000, plannedCost: { eventId: 'ski', month: '2026-02' } })]
  });

  const plan = buildPlan(state, { year: 2027, fromMonth: 1, income: 200000, cushion: 0, window: 12, today: k_today });

  assert.deepEqual([plan.evidence.months, plan.suggestedCushion, plan.months['2027-02'].event], [['2026-02'], 24000, 0]);
});

test('a recurring cost that starts in a later year can only move from its start year', () => {
  const state = createFinancialState({ events: [{ ...k_ski, fromYear: 2028 }] });

  const moveYears = plannedCostMoveYears(k_today, state.events[0]);
  const moveBeforeStart = () => movePlannedCost(state, { eventId: 'ski', fromYear: 2027, month: 3, today: k_today });
  const movedFromStart = movePlannedCost(state, { eventId: 'ski', fromYear: 2028, month: 3, today: k_today });

  assert.deepEqual(moveYears, [2028, 2029, 2030, 2031, 2032, 2033]);
  assert.throws(moveBeforeStart, { message: k_moveErrors.beforeStart });
  assert.deepEqual(movedFromStart.events[0], { ...k_ski, fromYear: 2028, monthFromYear: { 2028: 3 } });
});

test('adding a cost that repeats from 2027 leaves the rest of 2026 Expected savings unchanged and adds it from 2027', () => {
  const history = [
    createTransaction({ id: 'salary-october', type: 'income', category: 'salary', date: '2026-10-25', amount: 200000 }),
    createTransaction({ id: 'groceries-october', date: '2026-10-12', amount: 30000 })
  ];
  const before = createFinancialState({ transactions: history });
  const after = createFinancialState({ transactions: history, events: [k_ski] });
  const months = ['2026-11', '2026-12', '2027-02', '2028-02'];

  const expensesBefore = months.map(month => expectedSavings(before, month, k_today).expense);
  const expensesAfter = months.map(month => expectedSavings(after, month, k_today).expense);

  assert.deepEqual(expensesAfter.slice(0, 2), expensesBefore.slice(0, 2));
  assert.deepEqual([expensesAfter[2] - expensesBefore[2], expensesAfter[3] - expensesBefore[3]], [90000, 90000]);
});

test('Year ahead lists a cost that repeats from 2027 in 2027 and later years only', () => {
  const state = createFinancialState({ events: [k_ski] });

  const namedCostIds = year => yearOutlook(state, year, k_today).drivers.namedCosts.map(cost => cost.id);

  assert.deepEqual([namedCostIds(2026), namedCostIds(2027), namedCostIds(2028)], [[], ['ski'], ['ski']]);
});

test('a recurring cost without a start year still applies to every year', () => {
  const legacyGifts = { id: 'gifts', name: 'Gifts', month: 12, amount: 30000 };

  const listed = year => plannedCostsInYear([legacyGifts, k_ski], year).map(cost => cost.event.id);
  const pickerLabels = plannedCostOptions([legacyGifts], '2026-11-19', undefined).map(option => option.label);

  assert.deepEqual([listed(2025), listed(2026), listed(2027)], [['gifts'], ['gifts'], ['ski', 'gifts']]);
  assert.deepEqual(pickerLabels, ['Gifts · December 2025', 'Gifts · December 2026', 'Gifts · December 2027']);
});

test('a year amount for the start year applies with the start year in plans', () => {
  const withYearAmount = { ...k_ski, yearAmounts: { 2027: 110000 } };
  const state = createFinancialState({ events: [withYearAmount] });
  const planOptions = { fromMonth: 1, income: 200000, cushion: 0, today: k_today };

  const totals = [2026, 2027, 2028].map(year => planEventTotals(buildPlan(state, { ...planOptions, year })));

  assert.deepEqual(totals, [{}, { '2027-02': 110000 }, { '2028-02': 90000 }]);
  assert.equal(plannedCostAmount(withYearAmount, 2028), 90000);
});

test("saving a revision of this year's plan after adding a cost that repeats from 2027 keeps it out and keeps earlier snapshots", () => {
  const planOptions = { fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-05' };
  const legacyState = createFinancialState();
  const firstRevision = buildPlan(legacyState, { ...planOptions, year: 2026 });
  const frozenState = approvePlanRevision(legacyState, firstRevision, { id: 'plan-2026-first', fromMonth: 1, today: '2026-01-05' });
  const plan2027 = buildPlan({ ...frozenState, events: [k_ski] }, { ...planOptions, year: 2027 });
  const withNextYear = approvePlanRevision({ ...frozenState, events: [k_ski] }, plan2027, { id: 'plan-2027-first', fromMonth: 1, today: '2026-01-05' });
  const frozenFirstRevision = structuredClone(withNextYear.plans[2026][0]);

  const revision2026 = buildPlan(withNextYear, { ...planOptions, year: 2026, fromMonth: 11, today: k_today });
  const revised = approvePlanRevision(withNextYear, revision2026, { id: 'plan-2026-second', fromMonth: 11, today: k_today });

  assert.deepEqual(planEventTotals(revised.plans[2026].at(-1)), {});
  assert.deepEqual(revised.plans[2026][0], frozenFirstRevision);
  assert.deepEqual(planEventTotals(revised.plans[2027][0]), { '2027-02': 90000 });
});

test('a full restore keeps the start year of a recurring cost', () => {
  const backup = createFinancialState({ events: [k_ski] });

  const { restoredState } = prepareFullRestore(JSON.stringify(backup));

  assert.equal(restoredState.events[0].fromYear, 2027);
});

test('a start year added on one device merges cleanly and two different start years conflict for review', () => {
  const unstarted = { ...k_ski };
  delete unstarted.fromYear;
  const base = createFinancialState({ events: [unstarted] });
  const local = createFinancialState({ events: [k_ski] });
  const remote = createFinancialState({ events: [{ ...k_ski, fromYear: 2028 }] });

  const clean = mergeThreeWay(base, local, base);
  const conflicting = mergeThreeWay(base, local, remote);

  assert.deepEqual([clean.conflicts, clean.result.events[0].fromYear], [[], 2027]);
  assert.deepEqual(conflicting.conflicts.map(conflict => [conflict.collection, conflict.field]), [['events', 'fromYear']]);
});
