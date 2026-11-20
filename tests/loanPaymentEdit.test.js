import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/planning.js';
import { mergeThreeWay } from '../src/engine.js';
import { prepareFullRestore } from '../src/fullRestore.js';
import { expectedSavings } from '../src/expectedSavings.js';
import { approvePlanRevision } from '../src/planArchive.js';
import { carriedPlanAssumptions } from '../src/planCarryForward.js';
import { validateState } from '../src/stateSchema.js';
import { editedLoan } from '../src/loanPaymentEdits.js';
import { createFinancialState } from './helpers/financialFixtures.js';

const k_planApprovedAt = '2026-03-01T10:00:00.000Z';
const k_editedAfterApproval = '2026-09-15T08:00:00.000Z';
const k_carLoan = { id: 'car', name: 'Car', account: 'everyday', start: '2026-01', end: '2029-12', payment: 18500, remaining: 0, original: 0 };

// A 2026 plan approved on 1 March that lowers the car payment to €150 from
// June and stops it from June 2027.
function ledgerWithApprovedPlan(loan = k_carLoan) {
  const state = createFinancialState({ loans: [loan] });
  const plan = buildPlan(state, {
    year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02',
    loanChanges: [{ loanId: 'car', since: '2026-06', amount: 15000 }, { loanId: 'car', since: '2027-06', amount: 0 }]
  });
  return approvePlanRevision(state, { ...plan, createdAt: k_planApprovedAt }, { id: 'plan-2026', fromMonth: 1, today: '2026-01-02' });
}

function withLoanPayment(state, payment, paymentEditedAt) {
  return { ...state, loans: state.loans.map(loan => ({ ...loan, payment, paymentEditedAt })) };
}

test('a loan payment edited after the plan was approved starts the next draft, and later plan changes still carry', () => {
  const state = withLoanPayment(ledgerWithApprovedPlan(), 16000, k_editedAfterApproval);

  const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });
  const plan = buildPlan(state, { year: 2027, fromMonth: 1, income: 200000, cushion: 0, loanChanges: carried.loanChanges, today: '2026-11-20' });

  assert.deepEqual(carried.loanChanges, [{ loanId: 'car', since: '2027-06', amount: 0 }]);
  // €160 entered on the loan in September, then the plan's June stop.
  assert.deepEqual(['2027-01', '2027-05', '2027-06'].map(month => plan.months[month].loan), [16000, 16000, 0]);
});

test('a legacy loan without an edit date keeps the carried change at the draft start', () => {
  const state = withLoanPayment(ledgerWithApprovedPlan(), 16000, undefined);

  const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });

  assert.deepEqual(carried.loanChanges, [{ loanId: 'car', since: '2027-01', amount: 15000 }, { loanId: 'car', since: '2027-06', amount: 0 }]);
});

test('a loan payment edited before the plan was approved does not override the plan', () => {
  const state = withLoanPayment(ledgerWithApprovedPlan(), 16000, '2026-02-28T23:59:59.999Z');

  const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });

  assert.equal(carried.loanChanges[0].amount, 15000);
});

test('a source plan without an approval time keeps the carried change', () => {
  const approved = ledgerWithApprovedPlan();
  const untimedPlan = { ...approved.plans[2026][0] };
  delete untimedPlan.createdAt;
  const state = withLoanPayment({ ...approved, plans: { 2026: [untimedPlan] } }, 16000, k_editedAfterApproval);

  const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });

  assert.equal(carried.loanChanges[0].amount, 15000);
});

test('a newer revision approved after the loan edit carries its own change again', () => {
  const edited = withLoanPayment(ledgerWithApprovedPlan(), 16000, k_editedAfterApproval);
  const revisionOptions = { year: 2026, fromMonth: 11, income: 200000, cushion: 0, today: '2026-11-20', loanChanges: [{ loanId: 'car', since: '2026-11', amount: 14000 }] };
  const revision = { ...buildPlan(edited, revisionOptions), createdAt: '2026-11-20T09:00:00.000Z' };
  const state = approvePlanRevision(edited, revision, { id: 'plan-2026-second', fromMonth: 11, today: '2026-11-20' });

  const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });

  assert.deepEqual(carried.loanChanges, [{ loanId: 'car', since: '2027-01', amount: 14000 }]);
});

test('a same-year revision after the edit starts from the loan payment and keeps earlier months and snapshots', () => {
  const approved = ledgerWithApprovedPlan();
  const firstSnapshot = structuredClone(approved.plans[2026][0]);
  const state = withLoanPayment(approved, 16000, k_editedAfterApproval);

  const carried = carriedPlanAssumptions(state, { year: 2026, fromMonth: 11 });
  const revision = buildPlan(state, { year: 2026, fromMonth: 11, income: 200000, cushion: 0, loanChanges: carried.loanChanges, today: '2026-11-20' });
  const revised = approvePlanRevision(state, revision, { id: 'plan-2026-second', fromMonth: 11, today: '2026-11-20' });
  const latest = revised.plans[2026].at(-1);

  assert.deepEqual(carried.loanChanges, [{ loanId: 'car', since: '2027-06', amount: 0 }]);
  assert.deepEqual(['2026-05', '2026-06', '2026-10', '2026-11', '2026-12'].map(month => latest.months[month].loan), [18500, 15000, 15000, 16000, 16000]);
  assert.deepEqual(revised.plans[2026][0], firstSnapshot);
});

test('a stored payment edit time must be an exact UTC instant; loans without one stay valid', () => {
  const ledgerWithEditTime = paymentEditedAt => createFinancialState({ loans: [{ ...k_carLoan, paymentEditedAt }] });

  assert.doesNotThrow(() => validateState(createFinancialState({ loans: [k_carLoan] })));
  assert.doesNotThrow(() => validateState(ledgerWithEditTime(k_editedAfterApproval)));
  for (const invalidTime of ['2026-09-15', '2026-09-15T10:00:00+02:00', 'yesterday', 1789466400000, null]) {
    assert.throws(() => validateState(ledgerWithEditTime(invalidTime)), /loan payment edit time/);
  }
});

test('only a changed monthly payment records when the payment was edited', () => {
  const savedAt = '2026-11-20T09:30:00.000Z';
  const editedBefore = { ...k_carLoan, paymentEditedAt: k_editedAfterApproval };

  assert.deepEqual(editedLoan(k_carLoan, { name: 'Family car', payment: 18500, end: '2030-06' }, savedAt), { ...k_carLoan, name: 'Family car', end: '2030-06' });
  assert.deepEqual(editedLoan(editedBefore, { name: 'Family car', payment: 18500 }, savedAt), { ...editedBefore, name: 'Family car' });
  assert.deepEqual(editedLoan(editedBefore, { payment: 16000 }, savedAt), { ...k_carLoan, payment: 16000, paymentEditedAt: savedAt });
});

test('a full restore keeps when a loan payment was edited', () => {
  const backup = createFinancialState({ loans: [{ ...k_carLoan, paymentEditedAt: k_editedAfterApproval }] });

  const { restoredState } = prepareFullRestore(JSON.stringify(backup));

  assert.equal(restoredState.loans[0].paymentEditedAt, k_editedAfterApproval);
});

test('a payment edit on one device merges cleanly with a rename on the other; two payment edits conflict for review', () => {
  const base = createFinancialState({ loans: [k_carLoan] });
  const paymentEditedHere = createFinancialState({ loans: [{ ...k_carLoan, payment: 16000, paymentEditedAt: k_editedAfterApproval }] });
  const renamedThere = createFinancialState({ loans: [{ ...k_carLoan, name: 'Family car' }] });
  const paymentEditedThere = createFinancialState({ loans: [{ ...k_carLoan, payment: 17000, paymentEditedAt: '2026-10-01T07:00:00.000Z' }] });

  const clean = mergeThreeWay(base, paymentEditedHere, renamedThere);
  const conflicting = mergeThreeWay(base, paymentEditedHere, paymentEditedThere);

  assert.deepEqual([clean.conflicts, clean.result.loans], [[], [{ ...k_carLoan, name: 'Family car', payment: 16000, paymentEditedAt: k_editedAfterApproval }]]);
  assert.deepEqual(conflicting.conflicts.map(conflict => [conflict.collection, conflict.field, conflict.local, conflict.remote]), [
    ['loans', 'payment', 16000, 17000],
    ['loans', 'paymentEditedAt', k_editedAfterApproval, '2026-10-01T07:00:00.000Z']
  ]);
});

test('after a loan payment edit, a target-only edit to the next draft leaves Expected savings unchanged', () => {
  const state = withLoanPayment(ledgerWithApprovedPlan(), 16000, k_editedAfterApproval);
  const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });
  const planOptions = { year: 2027, fromMonth: 1, income: 200000, cushion: 0, loanChanges: carried.loanChanges, today: '2026-11-20' };
  const approval = { id: 'plan-2027', fromMonth: 1, today: '2026-11-20' };
  const suggestedPlan = approvePlanRevision(state, buildPlan(state, planOptions), approval);
  const editedTargetPlan = approvePlanRevision(state, buildPlan(state, { ...planOptions, cushion: 40000, overrides: { groceries: 5000 } }), approval);

  const march = candidate => expectedSavings(candidate, '2027-03', '2026-11-20');

  assert.equal(suggestedPlan.plans[2027][0].months['2027-03'].loan, 16000);
  assert.deepEqual(march(editedTargetPlan), march(suggestedPlan));
  assert.deepEqual(march(editedTargetPlan), march(state));
});

test('a source plan whose approval time is not an exact UTC instant keeps the carried change on every platform', () => {
  const approved = ledgerWithApprovedPlan();
  for (const looseApprovalTime of ['2026-03-01 10:00', '1 March 2026', '2026-03-01']) {
    const plans = { 2026: [{ ...approved.plans[2026][0], createdAt: looseApprovalTime }] };
    const state = withLoanPayment({ ...approved, plans }, 16000, k_editedAfterApproval);

    const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });

    assert.equal(carried.loanChanges[0].amount, 15000, looseApprovalTime);
  }
});
