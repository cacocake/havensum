import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, driftAlerts } from '../src/engine.js';
import { createFinancialState, createTransaction, planArchiveOf } from './helpers/financialFixtures.js';

const k_planOptions = { year: 2026, fromMonth: 11, income: 100000, cushion: 0, window: 6 };

test('a transfer in an otherwise missing month cannot lower spending averages', () => {
  const state = createFinancialState({ transactions: [createTransaction({ amount: 6000, date: '2026-10-10' })] });
  const originalPlan = buildPlan(state, k_planOptions);
  state.transactions.push(createTransaction({ id: 'transfer-only-month', type: 'transfer', amount: 10000, date: '2026-09-01', toAccount: 'shared' }));

  assert.deepEqual(buildPlan(state, k_planOptions).months, originalPlan.months);
});

test('a zero manual override wins over observed spending and remains marked', () => {
  const state = createFinancialState({ transactions: [createTransaction({ date: '2026-10-01', amount: 10000 })] });
  const plan = buildPlan(state, { ...k_planOptions, overrides: { groceries: 0 } });
  const groceryLine = plan.months['2026-11'].lines.find(line => line.category === 'groceries');

  assert.deepEqual({ amount: groceryLine.amount, override: groceryLine.override }, { amount: 0, override: true });
});

test('January averages cross the year boundary and round once to integer cents', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'november', date: '2025-11-01', amount: 100 }),
    createTransaction({ id: 'december', date: '2025-12-01', amount: 101 }),
    createTransaction({ id: 'too-old', date: '2025-10-31', amount: 99999 }),
    createTransaction({ id: 'current', date: '2026-01-01', amount: 99999 })
  ] });
  const plan = buildPlan(state, { ...k_planOptions, fromMonth: 1, window: 2 });

  assert.equal(plan.months['2026-01'].expense, 101);
});

test('loan forecasts respect inclusive start/end months without counting recorded payments twice', () => {
  const state = createFinancialState({
    loans: [{ id: 'car', start: '2026-11', end: '2026-11', payment: 18500 }],
    transactions: [createTransaction({ category: 'loan', date: '2026-10-01', amount: 18500 })]
  });
  const plan = buildPlan(state, k_planOptions);

  assert.deepEqual([plan.months['2026-11'].expense, plan.months['2026-12'].expense], [18500, 0]);
});

test('scheduled changes use the latest applicable date regardless of input order', () => {
  const plan = buildPlan(createFinancialState(), {
    ...k_planOptions,
    incomeChanges: [{ since: '2026-12', amount: 300000 }, { since: '2026-10', amount: 200000 }]
  });

  assert.deepEqual([plan.months['2026-11'].income, plan.months['2026-12'].income], [200000, 300000]);
});

test('events for a different year never enter the frozen snapshot', () => {
  const state = createFinancialState({ events: [
    { id: 'this-year', year: 2026, month: 11, amount: 10000 },
    { id: 'other-year', year: 2027, month: 11, amount: 99999 },
    { id: 'annual', month: 11, amount: 5000 }
  ] });

  assert.equal(buildPlan(state, k_planOptions).months['2026-11'].expense, 15000);
});

function createDriftState(behavior, amounts, overrides = {}) {
  return createFinancialState({
    transactions: amounts.map((amount, index) => createTransaction({
      id: `completed-month-${index}`, amount, kind: behavior,
      date: index === 0 ? '2026-12-01' : '2026-11-01'
    })),
    plans: planArchiveOf({
      tolerance: 200,
      drift: 0.3,
      months: { '2027-01': { lines: [{ category: 'groceries', name: 'Groceries', kind: behavior, amount: 10000 }] } },
      ...overrides
    })
  });
}

test('fixed drift tolerates the exact boundary and alerts one cent beyond it', () => {
  assert.equal(driftAlerts(createDriftState('Fixed', [10200]), '2027-01').length, 0);
  assert.equal(driftAlerts(createDriftState('Fixed', [10201]), '2027-01').length, 1);
});

test('variable drift needs two completed months beyond the configured boundary', () => {
  assert.equal(driftAlerts(createDriftState('Variable', [13000, 13000]), '2027-01').length, 0);
  assert.equal(driftAlerts(createDriftState('Variable', [13001, 10000]), '2027-01').length, 0);
  assert.equal(driftAlerts(createDriftState('Variable', [13001, 13001]), '2027-01').length, 1);
});

test('drift uses original-month net spending and never mutates the frozen plan', () => {
  const state = createDriftState('Fixed', [15000]);
  state.transactions.push(createTransaction({
    id: 'late-payback', type: 'reimbursement', date: '2027-01-01', amount: 5000, linkedId: 'completed-month-0'
  }));
  const originalState = structuredClone(state);

  assert.deepEqual(driftAlerts(state, '2027-01'), []);
  assert.deepEqual(state, originalState);
  assert.deepEqual(driftAlerts(state, '2028-01'), []);
});

test('current-month activity cannot itself trigger a completed-month drift alert', () => {
  const state = createDriftState('Variable', [10000, 10000]);
  state.transactions.push(createTransaction({ id: 'current-month', date: '2027-01-01', amount: 999999 }));

  assert.deepEqual(driftAlerts(state, '2027-01'), []);
});

test('editing one month of a returned plan cannot rewrite another month of that snapshot', () => {
  const plan = buildPlan(createFinancialState(), { ...k_planOptions, fromMonth: 1 });
  const originalDecember = structuredClone(plan.months['2026-12']);
  plan.months['2026-01'].lines[0].amount = 99999;
  plan.months['2026-01'].lines.push({ id: 'january-only', amount: 1234 });

  assert.deepEqual(plan.months['2026-12'], originalDecember);
});

test('a returned revision cannot mutate the earlier plan through carried historical months', () => {
  const state = createFinancialState();
  const frozenPlan = buildPlan(state, { ...k_planOptions, fromMonth: 1 });
  const originalJanuary = structuredClone(frozenPlan.months['2026-01']);
  const revisedPlan = buildPlan({ ...state, plans: planArchiveOf(frozenPlan) }, { ...k_planOptions, fromMonth: 6 });
  revisedPlan.months['2026-01'].lines[0].amount = 99999;
  revisedPlan.months['2026-01'].lines.push({ id: 'revision-only', amount: 1234 });

  assert.deepEqual(frozenPlan.months['2026-01'], originalJanuary);
});
