import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, driftAlerts } from '../src/planning.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';
import { installBrowserStorage } from './helpers/browserStorage.js';
import { writeState } from '../src/storage.web.js';

const k_today = '2026-11-19';
const k_novemberRevision = { year: 2026, fromMonth: 11, income: 100000, cushion: 0, window: 3, today: k_today };

function lineAmount(plan, month, lineId) {
  return plan.months[month].lines.find(line => line.id === lineId)?.amount;
}

test('a confirmed €0 month counts: €120 then €0 suggests €60 of variable spending', () => {
  const state = createFinancialState({
    transactions: [createTransaction({ date: '2026-09-10', amount: 12000 })],
    outlook: { completeMonths: ['2026-09', '2026-10'] }
  });

  const plan = buildPlan(state, k_novemberRevision);

  assert.equal(lineAmount(plan, '2026-11', 'groceries'), 6000);
  assert.deepEqual(plan.evidence, { months: ['2026-09', '2026-10'], partial: false });
});

test('without confirmed months, recorded months give a labelled partial estimate and gaps are skipped', () => {
  const state = createFinancialState({ transactions: [
    createTransaction({ id: 'august', date: '2026-08-10', amount: 9000 }),
    createTransaction({ id: 'october', date: '2026-10-10', amount: 3000 })
  ] });

  const plan = buildPlan(state, k_novemberRevision);

  assert.deepEqual(plan.evidence, { months: ['2026-08', '2026-10'], partial: true });
  assert.equal(lineAmount(plan, '2026-11', 'groceries'), 6000);
});

test('no usable history is reported and manual amounts still apply', () => {
  const plan = buildPlan(createFinancialState(), { ...k_novemberRevision, overrides: { groceries: 25000 } });

  assert.deepEqual(plan.evidence, { months: [], partial: false });
  assert.equal(lineAmount(plan, '2026-11', 'groceries'), 25000);
  assert.equal(lineAmount(plan, '2026-11', 'rent'), 0);
});

test('a future year only uses completed months before today, across the year boundary', () => {
  const state = createFinancialState({
    transactions: [
      createTransaction({ id: 'october', date: '2026-10-10', amount: 6000 }),
      createTransaction({ id: 'this-month', date: '2026-11-05', amount: 90000 }),
      createTransaction({ id: 'future', date: '2026-12-05', amount: 90000 })
    ],
    outlook: { completeMonths: ['2026-09', '2026-10', '2026-11'] }
  });

  const plan = buildPlan(state, { ...k_novemberRevision, year: 2027, fromMonth: 1 });

  assert.deepEqual(plan.evidence.months, ['2026-09', '2026-10']);
  assert.equal(lineAmount(plan, '2027-01', 'groceries'), 3000);
});

test('a late linked payback reduces its original month while a future payback does not', () => {
  const state = createFinancialState({
    transactions: [
      createTransaction({ id: 'dinner', date: '2026-10-10', amount: 10000 }),
      createTransaction({ id: 'late-payback', type: 'reimbursement', linkedId: 'dinner', amount: 4000, date: '2026-11-02' }),
      createTransaction({ id: 'expected-payback', type: 'reimbursement', linkedId: 'dinner', amount: 1000, date: '2026-11-30' })
    ],
    outlook: { completeMonths: ['2026-10'] }
  });

  assert.equal(lineAmount(buildPlan(state, k_novemberRevision), '2026-11', 'groceries'), 6000);
});

function bill(id, title, date, amount, extra = {}) {
  return createTransaction({ id, title, date, amount, category: 'rent', ...extra });
}

test('two bills in one category: cancelling one removes only it from its effective month', () => {
  const state = createFinancialState({
    transactions: [bill('rent-oct', 'Rent', '2026-10-01', 80000), bill('internet-oct', 'Internet', '2026-10-02', 3500)],
    outlook: { completeMonths: ['2026-10'] }
  });
  const internetKey = JSON.stringify(['everyday', 'rent', 'internet']);
  state.outlook.billCancellations = { [internetKey]: '2026-12' };

  const plan = buildPlan(state, k_novemberRevision);

  assert.deepEqual([lineAmount(plan, '2026-11', 'rent'), lineAmount(plan, '2026-12', 'rent')], [83500, 80000]);
});

test('a missed bill payment stays expected at its latest observed amount', () => {
  const state = createFinancialState({
    transactions: [bill('rent-may', 'Rent', '2026-05-01', 70000), bill('rent-jun', 'Rent', '2026-06-01', 75000)],
    outlook: { completeMonths: ['2026-09', '2026-10'] }
  });

  assert.equal(lineAmount(buildPlan(state, k_novemberRevision), '2026-11', 'rent'), 75000);
});

test('a renamed bill is a different observed bill until the old one is cancelled', () => {
  const state = createFinancialState({
    transactions: [bill('old-name', 'Flat rent', '2026-09-01', 80000), bill('new-name', 'Rent', '2026-10-01', 80000)],
    outlook: { completeMonths: ['2026-09', '2026-10'] }
  });
  assert.equal(lineAmount(buildPlan(state, k_novemberRevision), '2026-11', 'rent'), 160000);

  state.outlook.billCancellations = { [JSON.stringify(['everyday', 'rent', 'flat rent'])]: '2026-11' };
  assert.equal(lineAmount(buildPlan(state, k_novemberRevision), '2026-11', 'rent'), 80000);
});

test('the cushion suggestion averages net occasional spending and leaves out named-event payments', () => {
  const state = createFinancialState({
    transactions: [
      createTransaction({ id: 'shoes', category: 'shopping', date: '2026-09-10', amount: 9000 }),
      createTransaction({ id: 'trip-deposit', category: 'shopping', date: '2026-09-12', amount: 50000, plannedCost: { eventId: 'trip', month: '2026-10' } }),
      createTransaction({ id: 'gift', category: 'groceries', kind: 'Occasional', date: '2026-10-10', amount: 3000 })
    ],
    events: [{ id: 'trip', name: 'Trip', year: 2026, month: 10, amount: 60000 }],
    outlook: { completeMonths: ['2026-09', '2026-10'] }
  });

  const plan = buildPlan(state, k_novemberRevision);

  assert.equal(plan.suggestedCushion, 6000);
  assert.equal(lineAmount(plan, '2026-11', 'groceries'), 0);
});

test('loans, loan changes and transfers stay out of the estimated lines', () => {
  const state = createFinancialState({
    loans: [{ id: 'car', name: 'Car', account: 'everyday', start: '2026-01', end: '2027-12', payment: 18500, remaining: 0, original: 0 }],
    transactions: [
      createTransaction({ id: 'car-oct', category: 'loan', loanId: 'car', title: 'Car', date: '2026-10-06', amount: 18500 }),
      createTransaction({ id: 'move', type: 'transfer', category: null, toAccount: 'shared', date: '2026-10-07', amount: 50000 }),
      createTransaction({ id: 'food', date: '2026-10-08', amount: 4000 })
    ],
    outlook: { completeMonths: ['2026-10'] }
  });

  const plan = buildPlan(state, { ...k_novemberRevision, loanChanges: [{ loanId: 'car', since: '2026-12', amount: 15000 }] });

  assert.deepEqual([plan.months['2026-11'].loan, plan.months['2026-12'].loan], [18500, 15000]);
  assert.equal(plan.months['2026-11'].lines.some(line => line.category === 'loan'), false);
  assert.equal(lineAmount(plan, '2026-11', 'groceries'), 4000);
  assert.equal(plan.months['2026-11'].expense, 18500 + 4000);
});

test('a preview leaves the ledger and approved targets untouched', () => {
  const state = createFinancialState({
    transactions: [createTransaction({ date: '2026-10-10', amount: 4000 })],
    outlook: { completeMonths: ['2026-10'] }
  });
  state.plans = { 2026: [{ ...buildPlan(state, { ...k_novemberRevision, fromMonth: 1 }), id: 'plan-a' }] };
  const before = structuredClone(state);

  buildPlan(state, k_novemberRevision);

  assert.deepEqual(state, before);
});

test('drift measures the same bills as the plan line: a cancellation and a loan repayment are not drift', () => {
  const months = ['2026-09', '2026-10', '2026-11'];
  const internetKey = JSON.stringify(['everyday', 'rent', 'internet']);
  const state = createFinancialState({
    loans: [{ id: 'car', name: 'Car', account: 'everyday', start: '2026-01', end: '2027-12', payment: 20000, remaining: 0, original: 0 }],
    transactions: months.flatMap(month => [
      bill(`rent-${month}`, 'Rent', `${month}-01`, 80000),
      bill(`internet-${month}`, 'Internet', `${month}-02`, 3500),
      bill(`car-${month}`, 'Car', `${month}-03`, 20000, { loanId: 'car' })
    ]),
    outlook: { completeMonths: months, billCancellations: { [internetKey]: '2026-12' } }
  });
  const plan = buildPlan(state, { ...k_novemberRevision, fromMonth: 12, today: '2026-12-02' });
  state.plans = { 2026: [{ ...plan, id: 'plan-december' }] };

  assert.equal(lineAmount(plan, '2026-12', 'rent'), 80000);
  assert.deepEqual(driftAlerts(state, '2026-12', '2026-12-02'), []);
});

test('a payment linked to a moved event awaiting review stays out of the cushion and the variable estimate', () => {
  const state = createFinancialState({
    transactions: [
      createTransaction({ id: 'deposit', category: 'shopping', date: '2026-09-12', amount: 50000, plannedCost: { eventId: 'trip', month: '2026-10' } }),
      createTransaction({ id: 'snack', date: '2026-09-15', amount: 2000, plannedCost: { eventId: 'trip', month: '2026-10' } })
    ],
    events: [{ id: 'trip', name: 'Trip', year: 2026, month: 12, amount: 60000 }],
    outlook: { completeMonths: ['2026-09', '2026-10'] }
  });

  const plan = buildPlan(state, k_novemberRevision);

  assert.deepEqual([plan.suggestedCushion, lineAmount(plan, '2026-11', 'groceries'), plan.months['2026-12'].event], [0, 0, 60000]);
});

test('a recurring linked payback lowers the bill estimate so drift does not fire every month', () => {
  const months = ['2026-09', '2026-10'];
  const state = createFinancialState({
    transactions: months.flatMap(month => [
      bill(`rent-${month}`, 'Rent', `${month}-01`, 80000),
      createTransaction({ id: `share-${month}`, type: 'reimbursement', linkedId: `rent-${month}`, amount: 40000, date: `${month}-05`, category: 'rent' })
    ]),
    outlook: { completeMonths: months }
  });
  const plan = buildPlan(state, k_novemberRevision);
  state.plans = { 2026: [{ ...plan, id: 'plan-november' }] };

  assert.equal(lineAmount(plan, '2026-11', 'rent'), 40000);
  assert.deepEqual(driftAlerts(state, '2026-11', k_today), []);
});

test('a past one-off event without a line in the new plan counts as occasional history in its occurrence month', () => {
  const state = createFinancialState({
    transactions: [
      createTransaction({ id: 'early-deposit', category: 'shopping', date: '2025-10-20', amount: 48000, plannedCost: { eventId: 'lisbon', month: '2026-03' } }),
      createTransaction({ id: 'hotel', category: 'groceries', kind: 'Variable', date: '2026-03-05', amount: 24000, plannedCost: { eventId: 'lisbon', month: '2026-03' } }),
      createTransaction({ id: 'recurring-gifts', category: 'shopping', date: '2026-01-05', amount: 99999, plannedCost: { eventId: 'gifts', month: '2025-12' } })
    ],
    events: [
      { id: 'lisbon', name: 'Lisbon', year: 2026, month: 3, amount: 72000 },
      { id: 'gifts', name: 'Gifts', month: 12, amount: 100000 }
    ]
  });

  const plan = buildPlan(state, { ...k_novemberRevision, year: 2027, fromMonth: 1, window: 12 });

  assert.deepEqual(plan.evidence, { months: ['2025-12', '2026-03'], partial: true });
  assert.equal(plan.suggestedCushion, 36000);
  assert.equal(lineAmount(plan, '2027-01', 'groceries'), 0);
});

test('malformed draft evidence cannot be saved with a plan', async context => {
  installBrowserStorage(context);
  const state = createFinancialState();
  const plan = { ...buildPlan(state, k_novemberRevision), id: 'plan-a' };
  for (const invalid of [{ ...plan, evidence: { months: ['2026-13'], partial: false } }, { ...plan, suggestedCushion: 1.5 }]) {
    await assert.rejects(writeState({ ...state, plans: { 2026: [invalid] } }), SyntaxError);
  }
});
