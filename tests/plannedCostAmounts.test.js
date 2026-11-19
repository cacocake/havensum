import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, mergeThreeWay } from '../src/engine.js';
import { expectedOccasionalEvents } from '../src/expectedOccasionalSpending.js';
import { monthStats } from '../src/ledger.js';
import { validateState } from '../src/stateSchema.js';
import { approvePlanRevision } from '../src/planArchive.js';
import { yearOutlook } from '../src/yearOutlook.js';
import { prepareFullRestore } from '../src/fullRestore.js';
import { createFinancialState } from './helpers/financialFixtures.js';

// Owner decision F16: accepting a suggestion for a recurring planned cost sets
// that year's amount only.
const k_celebrations = { id: 'celebrations', name: 'December celebrations', month: 12, amount: 30000, yearAmounts: { 2027: 42000 } };

test('a recurring planned cost uses its amount for a year where one is set and its usual amount elsewhere', () => {
  const state = createFinancialState({ events: [k_celebrations] });
  const planOptions = { fromMonth: 1, income: 200000, cushion: 0, today: '2026-11-19' };

  const plan2026 = buildPlan(state, { ...planOptions, year: 2026, fromMonth: 12 });
  const plan2027 = buildPlan(state, { ...planOptions, year: 2027 });

  assert.equal(plan2026.months['2026-12'].event, 30000);
  assert.equal(plan2027.months['2027-12'].event, 42000);
});

test('the forecast of a planned cost uses the amount set for that year', () => {
  const state = createFinancialState({ events: [k_celebrations] });
  const noRecords = monthStats(state, '2027-12');

  const [december2027] = expectedOccasionalEvents(state, '2027-12', noRecords, '2026-11-19');
  const [december2026] = expectedOccasionalEvents(state, '2026-12', monthStats(state, '2026-12'), '2026-11-19');

  assert.deepEqual([december2027.amount, december2027.remaining], [42000, 42000]);
  assert.deepEqual([december2026.amount, december2026.remaining], [30000, 30000]);
});

test('stored year amounts must be whole cents for four-digit years on a recurring planned cost', () => {
  const valid = createFinancialState({ events: [k_celebrations] });
  const invalidEvents = [
    { ...k_celebrations, yearAmounts: { 2027: 420.5 } },
    { ...k_celebrations, yearAmounts: { 2027: -1 } },
    { ...k_celebrations, yearAmounts: { '27': 42000 } },
    { ...k_celebrations, yearAmounts: [42000] },
    { ...k_celebrations, year: 2027 }
  ];

  assert.equal(validateState(valid), valid);
  for (const event of invalidEvents) {
    assert.throws(() => validateState(createFinancialState({ events: [event] })), /year amounts/);
  }
});

test('two devices setting different year amounts for one planned cost produce a conflict to review', () => {
  const base = createFinancialState({ events: [{ ...k_celebrations, yearAmounts: undefined }] });
  const local = createFinancialState({ events: [{ ...k_celebrations, yearAmounts: { 2027: 42000 } }] });
  const remote = createFinancialState({ events: [{ ...k_celebrations, yearAmounts: { 2028: 45000 } }] });

  const { conflicts } = mergeThreeWay(base, local, remote);

  assert.deepEqual(conflicts.map(conflict => [conflict.collection, conflict.field]), [['events', 'yearAmounts']]);
});

test('a year amount accepted in a mid-year revision leaves earlier months and the earlier revision unchanged', () => {
  const springFair = { id: 'spring-fair', name: 'Spring fair', month: 3, amount: 10000 };
  const usualCosts = [springFair, { ...k_celebrations, yearAmounts: undefined }];
  const original = createFinancialState({ events: usualCosts });
  const january = buildPlan(original, { year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02' });
  const planned = approvePlanRevision(original, january, { id: 'plan-2026-r1', fromMonth: 1, today: '2026-01-02' });
  const withYearAmounts = { ...planned, events: [{ ...springFair, yearAmounts: { 2026: 99000 } }, { ...k_celebrations, yearAmounts: { 2026: 42000 } }] };

  const november = buildPlan(withYearAmounts, { year: 2026, fromMonth: 11, income: 200000, cushion: 0, today: '2026-11-19' });
  const revised = approvePlanRevision(withYearAmounts, november, { id: 'plan-2026-r2', fromMonth: 11, today: '2026-11-19' });

  const [firstRevision, secondRevision] = revised.plans['2026'];
  assert.deepEqual(firstRevision, planned.plans['2026'][0]);
  assert.deepEqual([firstRevision.months['2026-03'].event, firstRevision.months['2026-12'].event], [10000, 30000]);
  assert.deepEqual([secondRevision.months['2026-03'].event, secondRevision.months['2026-12'].event], [10000, 42000]);
});

test('Year ahead lists a planned cost at the amount set for that year', () => {
  const state = createFinancialState({ events: [k_celebrations] });

  const { drivers } = yearOutlook(state, 2027, '2026-11-19');

  assert.deepEqual(drivers.namedCosts.map(cost => [cost.month, cost.amount]), [['2027-12', 42000]]);
});

test('a full restore keeps year amounts', () => {
  const backup = createFinancialState({ events: [k_celebrations] });

  const { restoredState } = prepareFullRestore(JSON.stringify(backup));

  assert.deepEqual(restoredState.events[0].yearAmounts, { 2027: 42000 });
});
