import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/planning.js';
import { approvePlanRevision } from '../src/planArchive.js';
import { carriedPlanAssumptions } from '../src/planCarryForward.js';
import { createFinancialState } from './helpers/financialFixtures.js';

const k_today = '2026-11-19';
const k_carLoan = { id: 'car', name: 'Car', account: 'everyday', start: '2026-01', end: '2029-12', payment: 18500, remaining: 0, original: 0 };

function ledgerWithApprovedPlan(planOptions, stateOverrides = {}) {
  const state = createFinancialState({ loans: [k_carLoan], ...stateOverrides });
  const plan = buildPlan(state, { year: 2026, fromMonth: 1, cushion: 0, today: '2026-01-02', ...planOptions });
  return approvePlanRevision(state, { ...plan, tolerance: 500, drift: 0.2 }, { id: 'plan-2026', fromMonth: 1, today: '2026-01-02' });
}

test('a new year starts from the earlier plan, using amounts effective in January and carrying later changes once', () => {
  // Loan payments come from the loan's own history (P09), not from the plan.
  const carWithHistory = { ...k_carLoan, paymentChanges: [{ since: '2026-10', amount: 15000 }, { since: '2027-06', amount: 0 }] };
  const state = ledgerWithApprovedPlan({
    income: 200000,
    window: 3,
    incomeChanges: [{ since: '2026-07', amount: 250000 }, { since: '2027-03', amount: 260000 }],
    overrides: { groceries: 0 }
  }, { loans: [carWithHistory] });

  const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });

  assert.deepEqual(carried.source, { year: 2026, revision: 1 });
  assert.equal(carried.income, 250000);
  assert.deepEqual(carried.incomeChanges, [{ since: '2027-03', amount: 260000 }]);
  assert.deepEqual(carried.loanChanges, [{ loanId: 'car', since: '2027-01', amount: 15000 }, { loanId: 'car', since: '2027-06', amount: 0 }]);
  assert.deepEqual([carried.window, carried.tolerance, carried.drift], [3, 500, 0.2]);
  assert.deepEqual(carried.overrides.map(override => [override.lineId, override.amount, override.keep, override.stale]), [['groceries', 0, false, false]]);
});

test('without any earlier plan nothing is carried', () => {
  const carried = carriedPlanAssumptions(createFinancialState(), { year: 2027, fromMonth: 1 });

  assert.deepEqual(carried, { source: null, income: null, incomeChanges: [], loanChanges: [], staleLoanChanges: [], overrides: [], window: null, tolerance: null, drift: null, cushion: null });
});

test('deliberately entered zeros are carried as zeros', () => {
  const state = ledgerWithApprovedPlan({ income: 0, cushion: 0 });

  const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });

  assert.deepEqual([carried.income, carried.cushion], [0, 0]);
});

test('a same-year revision starts from that year\'s current figures and keeps its overrides', () => {
  const state = ledgerWithApprovedPlan({ income: 200000, cushion: 7000, overrides: { groceries: 30000 }, incomeChanges: [{ since: '2026-12', amount: 210000 }] });

  const carried = carriedPlanAssumptions(state, { year: 2026, fromMonth: 11 });

  assert.deepEqual([carried.income, carried.cushion], [200000, 7000]);
  assert.deepEqual(carried.incomeChanges, [{ since: '2026-12', amount: 210000 }]);
  assert.deepEqual(carried.overrides.map(override => [override.lineId, override.amount, override.keep]), [['groceries', 30000, true]]);
});

test('assumptions for a removed category or a closed loan are shown but not applied', () => {
  const state = ledgerWithApprovedPlan({
    overrides: { hobbies: 5000, groceries: 1000 },
    loanChanges: [{ loanId: 'car', since: '2026-06', amount: 15000 }]
  }, { categories: [...createFinancialState().categories, { id: 'hobbies', name: 'Hobbies', kind: 'Variable' }] });
  const laterState = {
    ...state,
    categories: state.categories.filter(category => category.id !== 'hobbies'),
    loans: [{ ...k_carLoan, end: '2026-12' }]
  };

  const carried = carriedPlanAssumptions(laterState, { year: 2027, fromMonth: 1 });

  assert.deepEqual(carried.overrides.map(override => [override.lineId, override.stale, override.keep]), [['groceries', false, false], ['hobbies', true, false]]);
  assert.deepEqual(carried.loanChanges, []);
  assert.deepEqual(carried.staleLoanChanges, [{ loanId: 'car', since: '2026-06', amount: 15000 }]);
});

test('carried changes apply once in the new plan, and a one-off trip stays in its own year while a recurring event repeats', () => {
  const state = ledgerWithApprovedPlan({
    income: 200000,
    incomeChanges: [{ since: '2026-07', amount: 250000 }, { since: '2027-03', amount: 260000 }]
  }, { events: [
    { id: 'trip', name: 'Trip', year: 2026, month: 8, amount: 90000 },
    { id: 'gifts', name: 'Gifts', month: 12, amount: 30000 }
  ] });
  const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });

  const plan = buildPlan(state, { year: 2027, fromMonth: 1, income: carried.income, incomeChanges: carried.incomeChanges, loanChanges: carried.loanChanges, cushion: 0, today: k_today });

  assert.deepEqual(['2027-01', '2027-02', '2027-03', '2027-12'].map(month => plan.months[month].income), [250000, 250000, 260000, 260000]);
  assert.deepEqual([plan.months['2027-08'].event, plan.months['2027-12'].event], [0, 30000]);
});
