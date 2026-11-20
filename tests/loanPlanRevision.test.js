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
function ledgerWithPlan(loan = k_carLoan) {
  const state = createFinancialState({ loans: [loan] });
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

test('a change later this year is offered from its month, with no passed months', () => {
  assert.deepEqual(loanRevisionOffer(ledgerWithPlan(), '2026-12', k_today), { year: 2026, reviseFrom: '2026-12', interviewFromMonth: 12, passedFrom: null });
});

test('a change in a passed month of this year is offered from that month; the interview starts this month (P09)', () => {
  assert.deepEqual(loanRevisionOffer(ledgerWithPlan(), '2026-03', k_today), { year: 2026, reviseFrom: '2026-03', interviewFromMonth: 11, passedFrom: '2026-03' });
});

test('a change from a past year is offered for this year from January; past years stay read-only', () => {
  assert.deepEqual(loanRevisionOffer(ledgerWithPlan(), '2025-08', k_today), { year: 2026, reviseFrom: '2026-01', interviewFromMonth: 11, passedFrom: '2026-01' });
});

test('a change in a year with a plan ahead is offered for that year, and none is offered without a plan', () => {
  const state = ledgerWithPlan();
  const plan2027 = buildPlan(state, { year: 2027, fromMonth: 1, income: 200000, cushion: 0, today: k_today });
  const withNextYear = approvePlanRevision(state, plan2027, { id: 'plan-2027', fromMonth: 1, today: k_today });

  assert.deepEqual(loanRevisionOffer(withNextYear, '2027-05', k_today), { year: 2027, reviseFrom: '2027-05', interviewFromMonth: 5, passedFrom: null });
  assert.equal(loanRevisionOffer(state, '2027-05', k_today), null);
  assert.equal(loanRevisionOffer(createFinancialState({ loans: [k_carLoan] }), '2026-12', k_today), null);
});

test('a revision restates only the loan line of passed months, keeps earlier months and the earlier revision (P22)', () => {
  const planned = ledgerWithPlan();
  const firstRevisionBytes = JSON.stringify(planned.plans[2026][0]);
  const state = { ...planned, loans: [withLoanPaymentFrom(k_carLoan, { since: '2026-03', amount: 16000 })] };
  const offer = loanRevisionOffer(state, '2026-03', k_today);

  const interviewPlan = buildPlan(state, { year: 2026, fromMonth: offer.interviewFromMonth, income: 210000, cushion: 10000, today: k_today });
  const revision = revisionWithRestatedLoanLines(interviewPlan, state, offer);
  const revised = approvePlanRevision(state, revision, { id: 'plan-2026-loan', fromMonth: 3, today: k_today });
  const [earlier, latest] = revised.plans[2026];

  assert.equal(JSON.stringify(earlier), firstRevisionBytes);
  assert.deepEqual(latest.months['2026-02'], earlier.months['2026-02']);
  const [frozenMarch, revisedMarch] = [earlier.months['2026-03'], latest.months['2026-03']];
  assert.deepEqual([revisedMarch.loan, revisedMarch.expense, revisedMarch.balance], [16000, frozenMarch.expense - 2500, frozenMarch.balance + 2500]);
  assert.deepEqual({ ...revisedMarch, loan: 0, expense: 0, balance: 0 }, { ...frozenMarch, loan: 0, expense: 0, balance: 0 });
  assert.deepEqual([latest.months['2026-11'].loan, latest.months['2026-11'].income], [16000, 210000]);
  assert.equal(latest.loanRestatedFrom, '2026-03');
});

test('a target-only edit in the revision leaves Expected savings unchanged', () => {
  const state = { ...ledgerWithPlan(), loans: [withLoanPaymentFrom(k_carLoan, { since: '2026-03', amount: 16000 })] };
  const offer = loanRevisionOffer(state, '2026-03', k_today);
  const approve = options => approvePlanRevision(state, revisionWithRestatedLoanLines(buildPlan(state, { year: 2026, fromMonth: 11, income: 200000, today: k_today, ...options }), state, offer), { id: 'plan-2026-loan', fromMonth: 3, today: k_today });

  const suggested = approve({ cushion: 10000 });
  const editedTarget = approve({ cushion: 50000, overrides: { groceries: 1234 } });

  assert.deepEqual(expectedSavings(editedTarget, '2026-12', k_today), expectedSavings(suggested, '2026-12', k_today));
});

test('a stored revision may record where its loan restatement starts, as a month', () => {
  const state = ledgerWithPlan();
  const withMark = mark => ({ ...state, plans: { 2026: [{ ...state.plans[2026][0], loanRestatedFrom: mark }] } });

  assert.doesNotThrow(() => validateState(withMark('2026-03')));
  for (const invalidMark of ['March', '2026-13', 202603, null]) {
    assert.throws(() => validateState(withMark(invalidMark)), /loan restatement month/);
  }
});

test('a revision without passed months is left as drafted, and months the plan never held stay absent', () => {
  const plan = { year: 2026, months: { '2026-12': { income: 1, expense: 1, balance: 0, cushion: 0, loan: 1, event: 0, lines: [] } } };
  const state = { loans: [k_carLoan] };

  assert.equal(revisionWithRestatedLoanLines(plan, state, { year: 2026, interviewFromMonth: 12, passedFrom: null }), plan);
  const restated = revisionWithRestatedLoanLines(plan, state, { year: 2026, interviewFromMonth: 12, passedFrom: '2026-10' });
  assert.deepEqual([Object.keys(restated.months), restated.loanRestatedFrom], [['2026-12'], '2026-10']);
});
