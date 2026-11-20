import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/planning.js';
import { approvePlanRevision } from '../src/planArchive.js';
import { carriedPlanAssumptions } from '../src/planCarryForward.js';
import { expectedSavings } from '../src/expectedSavings.js';
import { createFinancialState } from './helpers/financialFixtures.js';
import { loanChangesFromHistory, loanPaymentInMonth, loanPaymentHistory, withLoanPaymentFrom, withNormalizedPayments, withoutLoanPaymentChange } from '../src/loanPaymentHistory.js';

// A €1,200 loan from January 2026 to December 2030 (P09's example).
const k_homeLoan = { id: 'home', name: 'Home', account: 'everyday', start: '2026-01', end: '2030-12', payment: 120000, paymentChanges: [], remaining: 9000000, original: 9000000 };

function paymentsIn(loan, months) {
  return months.map(month => loanPaymentInMonth(loan, month));
}

test('a payment lowered from a future month applies from that month on and leaves earlier months alone', () => {
  const lowered = withLoanPaymentFrom(k_homeLoan, { since: '2027-03', amount: 105000 });

  assert.deepEqual(paymentsIn(lowered, ['2026-01', '2027-02', '2027-03', '2030-12']), [120000, 120000, 105000, 105000]);
  assert.deepEqual(loanPaymentHistory(lowered), [{ since: '2026-01', amount: 120000 }, { since: '2027-03', amount: 105000 }]);
});

test('a payment raised from a past month applies from that month, and a later scheduled change no longer applies', () => {
  const scheduled = withLoanPaymentFrom(k_homeLoan, { since: '2027-03', amount: 105000 });

  const raised = withLoanPaymentFrom(scheduled, { since: '2026-09', amount: 130000 });

  assert.deepEqual(paymentsIn(raised, ['2026-08', '2026-09', '2027-03', '2028-01']), [120000, 130000, 130000, 130000]);
  assert.deepEqual(loanPaymentHistory(raised), [{ since: '2026-01', amount: 120000 }, { since: '2026-09', amount: 130000 }]);
});

test('a payment from the loan start or earlier replaces the starting payment and every change', () => {
  const scheduled = withLoanPaymentFrom(k_homeLoan, { since: '2027-03', amount: 105000 });

  const restated = withLoanPaymentFrom(scheduled, { since: '2025-06', amount: 110000 });

  assert.deepEqual(loanPaymentHistory(restated), [{ since: '2026-01', amount: 110000 }]);
  assert.equal(restated.payment, 110000);
});

test('entering the amount already in effect still replaces later changes without adding an entry', () => {
  const twoChanges = withLoanPaymentFrom(withLoanPaymentFrom(k_homeLoan, { since: '2026-09', amount: 105000 }), { since: '2027-06', amount: 90000 });

  const unchanged = withLoanPaymentFrom(twoChanges, { since: '2027-01', amount: 105000 });

  assert.deepEqual(loanPaymentHistory(unchanged), [{ since: '2026-01', amount: 120000 }, { since: '2026-09', amount: 105000 }]);
});

test('a mistaken entry can be removed without touching the others', () => {
  const twoChanges = withLoanPaymentFrom(withLoanPaymentFrom(k_homeLoan, { since: '2026-09', amount: 105000 }), { since: '2027-06', amount: 90000 });

  const corrected = withoutLoanPaymentChange(twoChanges, '2026-09');

  assert.deepEqual(loanPaymentHistory(corrected), [{ since: '2026-01', amount: 120000 }, { since: '2027-06', amount: 90000 }]);
  assert.deepEqual(paymentsIn(corrected, ['2026-12', '2027-06']), [120000, 90000]);
});

test('a loan without stored changes pays its own payment every month', () => {
  const { paymentChanges, ...legacyShapedLoan } = k_homeLoan;

  assert.deepEqual(paymentChanges, []);
  assert.deepEqual(paymentsIn(legacyShapedLoan, ['2026-01', '2029-05']), [120000, 120000]);
  assert.deepEqual(loanPaymentHistory(legacyShapedLoan), [{ since: '2026-01', amount: 120000 }]);
});

// A 2026 plan approved in January, before the loan kept a history, that
// scheduled its own car payment changes (€150 from June, €0 from June 2027).
function ledgerWithPlanScheduledChanges(loan) {
  const state = createFinancialState({ loans: [loan] });
  const plan = buildPlan(state, {
    year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02',
    loanChanges: [{ loanId: loan.id, since: '2026-06', amount: 15000 }, { loanId: loan.id, since: '2027-06', amount: 0 }]
  });
  return approvePlanRevision(state, plan, { id: 'plan-2026', fromMonth: 1, today: '2026-01-02' });
}

const k_carLoan = { id: 'car', name: 'Car', account: 'everyday', start: '2026-01', end: '2029-12', payment: 18500, paymentChanges: [], remaining: 0, original: 0 };

test('a new year\'s draft takes each loan\'s payments from its history, not from the earlier plan\'s changes', () => {
  const carWithHistory = withLoanPaymentFrom(withLoanPaymentFrom(k_carLoan, { since: '2026-09', amount: 16000 }), { since: '2027-04', amount: 14000 });
  const state = ledgerWithPlanScheduledChanges(carWithHistory);

  const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });
  const draft = buildPlan(state, { year: 2027, fromMonth: 1, income: 200000, cushion: 0, loanChanges: carried.loanChanges, today: '2026-11-20' });

  assert.deepEqual(carried.loanChanges, [{ loanId: 'car', since: '2027-01', amount: 16000 }, { loanId: 'car', since: '2027-04', amount: 14000 }]);
  assert.deepEqual(['2027-01', '2027-03', '2027-04', '2027-06', '2027-12'].map(month => draft.months[month].loan), [16000, 16000, 14000, 14000, 14000]);
});

test('a draft with no earlier plan still follows the loan\'s history, and a plan built without explicit changes does too', () => {
  const carWithHistory = withLoanPaymentFrom(k_carLoan, { since: '2027-04', amount: 14000 });
  const state = createFinancialState({ loans: [carWithHistory] });

  const carried = carriedPlanAssumptions(state, { year: 2027, fromMonth: 1 });
  const defaultDraft = buildPlan(state, { year: 2027, fromMonth: 1, income: 200000, cushion: 0, today: '2026-11-20' });

  assert.deepEqual(carried.loanChanges, [{ loanId: 'car', since: '2027-04', amount: 14000 }]);
  assert.deepEqual(['2027-03', '2027-04'].map(month => defaultDraft.months[month].loan), [18500, 14000]);
});

test('Expected savings follows the loan\'s history, a Prediction-assumptions amount still wins from its month, and a target-only edit leaves it unchanged', () => {
  const carWithHistory = withLoanPaymentFrom(withLoanPaymentFrom(k_carLoan, { since: '2027-01', amount: 16000 }), { since: '2027-04', amount: 14000 });
  const state = createFinancialState({ loans: [carWithHistory], outlook: { loanChanges: [{ loanId: 'car', since: '2027-03', amount: 15000 }] } });
  const planOptions = { year: 2027, fromMonth: 1, income: 200000, cushion: 0, today: '2026-11-20' };
  const approval = { id: 'plan-2027', fromMonth: 1, today: '2026-11-20' };
  const suggestedPlan = approvePlanRevision(state, buildPlan(state, planOptions), approval);
  const editedTargetPlan = approvePlanRevision(state, buildPlan(state, { ...planOptions, cushion: 40000, overrides: { groceries: 5000 } }), approval);

  const expectedLoan = (candidate, month) => expectedSavings(candidate, month, '2026-11-20').loan;

  assert.deepEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04'].map(month => expectedLoan(state, month)), [18500, 16000, 16000, 15000, 15000]);
  assert.deepEqual(['2027-02', '2027-04'].map(month => suggestedPlan.plans[2027][0].months[month].loan), [16000, 14000]);
  assert.deepEqual(expectedSavings(editedTargetPlan, '2027-04', '2026-11-20'), expectedSavings(suggestedPlan, '2027-04', '2026-11-20'));
});

// Owner decision P10 (until month): a temporary change returns to the payment
// that applied before it; a forever change replaces later changes.
test('a temporary change from January until May returns to the earlier payment in June', () => {
  const temporary = withLoanPaymentFrom(k_homeLoan, { since: '2027-01', until: '2027-05', amount: 90000 });

  assert.deepEqual(paymentsIn(temporary, ['2026-12', '2027-01', '2027-05', '2027-06']), [120000, 90000, 90000, 120000]);
  assert.deepEqual(loanPaymentHistory(temporary), [{ since: '2026-01', amount: 120000 }, { since: '2027-01', until: '2027-05', amount: 90000 }]);
});

test('one-month changes in consecutive months each apply to their month only', () => {
  const extraInMarch = withLoanPaymentFrom(k_homeLoan, { since: '2027-03', until: '2027-03', amount: 150000 });
  const lowerInApril = withLoanPaymentFrom(extraInMarch, { since: '2027-04', until: '2027-04', amount: 100000 });

  assert.deepEqual(paymentsIn(lowerInApril, ['2027-02', '2027-03', '2027-04', '2027-05']), [120000, 150000, 100000, 120000]);
});

test('a temporary change leaves later changes untouched, whichever is entered first', () => {
  const forever = { since: '2027-03', amount: 100000 };
  const temporary = { since: '2027-01', until: '2027-05', amount: 90000 };
  const foreverFirst = withLoanPaymentFrom(withLoanPaymentFrom(k_homeLoan, forever), temporary);
  const temporaryFirst = withLoanPaymentFrom(withLoanPaymentFrom(k_homeLoan, temporary), forever);
  const months = ['2026-12', '2027-01', '2027-03', '2027-05', '2027-06'];

  assert.deepEqual(paymentsIn(foreverFirst, months), [120000, 90000, 90000, 90000, 100000]);
  // A forever change entered later still replaces every payment from its month on.
  assert.deepEqual(paymentsIn(temporaryFirst, months), [120000, 90000, 100000, 100000, 100000]);
  assert.deepEqual(loanPaymentHistory(temporaryFirst), [{ since: '2026-01', amount: 120000 }, { since: '2027-01', until: '2027-02', amount: 90000 }, { since: '2027-03', amount: 100000 }]);
});

test('a forever change from the loan start replaces temporary changes too', () => {
  const temporary = withLoanPaymentFrom(k_homeLoan, { since: '2027-01', until: '2027-05', amount: 90000 });

  assert.deepEqual(loanPaymentHistory(withLoanPaymentFrom(temporary, { since: '2026-01', amount: 110000 })), [{ since: '2026-01', amount: 110000 }]);
});

test('a draft turns temporary changes into the months they start and end', () => {
  const carWithHistory = withLoanPaymentFrom(withLoanPaymentFrom(k_carLoan, { since: '2026-12', until: '2027-02', amount: 9000 }), { since: '2027-06', until: '2027-06', amount: 30000 });
  const state = createFinancialState({ loans: [carWithHistory] });

  const draft = buildPlan(state, { year: 2027, fromMonth: 1, income: 200000, cushion: 0, today: '2026-11-20' });

  assert.deepEqual(loanChangesFromHistory(state.loans, '2027-01'), [
    { loanId: 'car', since: '2027-01', amount: 9000 }, { loanId: 'car', since: '2027-03', amount: 18500 },
    { loanId: 'car', since: '2027-06', amount: 30000 }, { loanId: 'car', since: '2027-07', amount: 18500 }
  ]);
  assert.deepEqual(['2027-02', '2027-03', '2027-06', '2027-07'].map(month => draft.months[month].loan), [9000, 18500, 30000, 18500]);
});

test('moving a loan\'s start later folds the changes it passes into the starting payment', () => {
  const history = [{ since: '2026-06', amount: 15000 }, { since: '2026-07', until: '2026-08', amount: 1000 }, { since: '2026-10', until: '2026-12', amount: 2000 }, { since: '2027-02', amount: 14000 }];
  const movedStart = withNormalizedPayments({ ...k_carLoan, start: '2026-11', paymentChanges: history });

  assert.deepEqual(loanPaymentHistory(movedStart), [{ since: '2026-11', amount: 15000 }, { since: '2026-11', until: '2026-12', amount: 2000 }, { since: '2027-02', amount: 14000 }]);
  assert.deepEqual(paymentsIn(movedStart, ['2026-11', '2027-01', '2027-02']), [2000, 15000, 14000]);
});

test('a temporary payment that ended before the loan starts changes nothing', () => {
  const lateLoan = { ...k_carLoan, start: '2027-01' };

  assert.deepEqual(loanPaymentHistory(withLoanPaymentFrom(lateLoan, { since: '2026-05', until: '2026-08', amount: 100 })), [{ since: '2027-01', amount: 18500 }]);
});
