import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/planning.js';
import { approvePlanRevision } from '../src/planArchive.js';
import { expectedSavings } from '../src/expectedSavings.js';
import { withLoanPaymentFrom } from '../src/loanPaymentHistory.js';
import { firstChangedPaymentMonth, loanRevisionOffer, revisionWithRestatedLoanLines } from '../src/loanPlanRevision.js';
import { validateState } from '../src/stateSchema.js';
import { createFinancialState } from './helpers/financialFixtures.js';

const k_today = '2026-11-20';
const k_carLoan = { id: 'car', name: 'Car', account: 'everyday', start: '2026-01', end: '2029-12', payment: 18500, paymentChanges: [], remaining: 400000, original: 500000 };

// A 2026 plan approved in January from the €185 car payment, and an empty 2027.
function ledgerWithPlan(loan = k_carLoan, otherLoans = []) {
  const state = createFinancialState({ loans: [loan, ...otherLoans] });
  const plan = buildPlan(state, { year: 2026, fromMonth: 1, income: 200000, cushion: 10000, today: '2026-01-02' });
  return approvePlanRevision(state, plan, { id: 'plan-2026', fromMonth: 1, today: '2026-01-02' });
}

test('the first changed month is where the payment first differs; a balance-only edit changes none (P15)', () => {
  const lowerFromMarch = withLoanPaymentFrom(k_carLoan, { since: '2027-03', amount: 16000 });
  const oneMonthInJune = withLoanPaymentFrom(k_carLoan, { since: '2026-06', until: '2026-06', amount: 30000 });

  assert.equal(firstChangedPaymentMonth(k_carLoan, lowerFromMarch), '2027-03');
  assert.equal(firstChangedPaymentMonth(lowerFromMarch, k_carLoan), '2027-03');
  assert.equal(firstChangedPaymentMonth(k_carLoan, oneMonthInJune), '2026-06');
  assert.equal(firstChangedPaymentMonth(k_carLoan, { ...k_carLoan, remaining: 1000, name: 'Family car' }), null);
});

const lowerFrom = since => withLoanPaymentFrom(k_carLoan, { since, amount: 16000 });

test('a change later this year is offered from its month, with no passed months', () => {
  assert.deepEqual(loanRevisionOffer(ledgerWithPlan(), k_carLoan, lowerFrom('2026-12'), k_today), { year: 2026, loanId: 'car', reviseFrom: '2026-12', interviewFromMonth: 12, passedFrom: null });
});

test('a change in a passed month of this year is offered from that month; the interview starts this month (P09)', () => {
  assert.deepEqual(loanRevisionOffer(ledgerWithPlan(), k_carLoan, lowerFrom('2026-03'), k_today), { year: 2026, loanId: 'car', reviseFrom: '2026-03', interviewFromMonth: 11, passedFrom: '2026-03' });
});

test('a lasting change from a past year is offered for this year from January; one confined to a past year is not offered', () => {
  const olderLoan = { ...k_carLoan, start: '2024-01' };
  const state = { ...ledgerWithPlan(olderLoan) };

  assert.deepEqual(loanRevisionOffer(state, olderLoan, withLoanPaymentFrom(olderLoan, { since: '2025-08', amount: 16000 }), k_today), { year: 2026, loanId: 'car', reviseFrom: '2026-01', interviewFromMonth: 11, passedFrom: '2026-01' });
  assert.equal(loanRevisionOffer(state, olderLoan, withLoanPaymentFrom(olderLoan, { since: '2025-03', until: '2025-05', amount: 0 }), k_today), null);
  assert.equal(loanRevisionOffer(state, olderLoan, { ...olderLoan, start: '2025-06' }, k_today), null);
});

test('the offer goes to the first planned year the change affects, and none without a plan (P24)', () => {
  const state = createFinancialState({ loans: [k_carLoan] });
  const plan2027 = buildPlan(state, { year: 2027, fromMonth: 1, income: 200000, cushion: 0, today: k_today });
  const onlyNextYear = approvePlanRevision(state, plan2027, { id: 'plan-2027', fromMonth: 1, today: k_today });

  assert.deepEqual(loanRevisionOffer(onlyNextYear, k_carLoan, lowerFrom('2026-03'), k_today), { year: 2027, loanId: 'car', reviseFrom: '2027-01', interviewFromMonth: 1, passedFrom: null });
  assert.deepEqual(loanRevisionOffer(onlyNextYear, k_carLoan, lowerFrom('2027-05'), k_today).reviseFrom, '2027-05');
  assert.equal(loanRevisionOffer(state, k_carLoan, lowerFrom('2026-12'), k_today), null);
});

test('a revision restates only the changed loan in passed months, keeps earlier months and the earlier revision (P22, P23)', () => {
  const bike = { ...k_carLoan, id: 'bike', name: 'Bike', payment: 5000 };
  const planned = ledgerWithPlan(k_carLoan, [bike]);
  const firstRevisionBytes = JSON.stringify(planned.plans[2026][0]);
  // The bike was raised to €90 earlier and the owner kept the plan.
  const raisedBike = withLoanPaymentFrom(bike, { since: '2026-02', amount: 9000 });
  const loweredCar = lowerFrom('2026-06');
  const state = { ...planned, loans: [loweredCar, raisedBike] };
  const offer = loanRevisionOffer(state, k_carLoan, loweredCar, k_today);

  const interviewPlan = buildPlan(state, { year: 2026, fromMonth: offer.interviewFromMonth, income: 210000, cushion: 10000, today: k_today });
  const revision = revisionWithRestatedLoanLines(interviewPlan, state, offer, k_carLoan);
  const revised = approvePlanRevision(state, revision, { id: 'plan-2026-loan', fromMonth: 6, today: k_today });
  const [earlier, latest] = revised.plans[2026];

  assert.equal(JSON.stringify(earlier), firstRevisionBytes);
  assert.deepEqual(latest.months['2026-05'], earlier.months['2026-05']);
  const [frozenJune, revisedJune] = [earlier.months['2026-06'], latest.months['2026-06']];
  assert.equal(frozenJune.loan, 23500);
  assert.deepEqual([revisedJune.loan, revisedJune.expense, revisedJune.balance], [21000, frozenJune.expense - 2500, frozenJune.balance + 2500]);
  assert.deepEqual({ ...revisedJune, loan: 0, expense: 0, balance: 0 }, { ...frozenJune, loan: 0, expense: 0, balance: 0 });
  assert.deepEqual([latest.months['2026-11'].loan, latest.months['2026-11'].income], [25000, 210000]);
  assert.equal(latest.loanRestatedFrom, '2026-06');
});

test('a target-only edit in the revision changes the frozen target but leaves Expected savings unchanged', () => {
  const state = { ...ledgerWithPlan(), loans: [lowerFrom('2026-03')] };
  const offer = loanRevisionOffer(state, k_carLoan, state.loans[0], k_today);
  const approve = options => approvePlanRevision(state, revisionWithRestatedLoanLines(buildPlan(state, { year: 2026, fromMonth: 11, income: 200000, today: k_today, ...options }), state, offer, k_carLoan), { id: 'plan-2026-loan', fromMonth: 3, today: k_today });

  const suggested = approve({ cushion: 10000 });
  const editedTarget = approve({ cushion: 50000, overrides: { groceries: 1234 } });

  assert.notEqual(editedTarget.plans[2026][1].months['2026-12'].expense, suggested.plans[2026][1].months['2026-12'].expense);
  assert.deepEqual(expectedSavings(editedTarget, '2026-12', k_today), expectedSavings(suggested, '2026-12', k_today));
});

test('a stored revision may record where its loan restatement starts, as a month', () => {
  const state = ledgerWithPlan();
  const withMark = mark => ({ ...state, plans: { 2026: [{ ...state.plans[2026][0], loanRestatedFrom: mark }] } });

  assert.doesNotThrow(() => validateState(withMark('2026-03')));
  for (const invalidMark of ['March', '2026-13', 202603, null, '2025-03']) {
    assert.throws(() => validateState(withMark(invalidMark)), /loan restatement month/);
  }
});

test('a revision without passed months is left as drafted, and months the plan never held stay absent', () => {
  const plan = { year: 2026, months: { '2026-12': { income: 1, expense: 1, balance: 0, cushion: 0, loan: 1, event: 0, lines: [] } } };
  const state = { loans: [k_carLoan] };

  assert.equal(revisionWithRestatedLoanLines(plan, state, { year: 2026, loanId: 'car', interviewFromMonth: 12, passedFrom: null }, k_carLoan), plan);
  const restated = revisionWithRestatedLoanLines(plan, state, { year: 2026, loanId: 'car', interviewFromMonth: 12, passedFrom: '2026-10' }, k_carLoan);
  assert.deepEqual([Object.keys(restated.months), restated.loanRestatedFrom], [['2026-12'], '2026-10']);
});
