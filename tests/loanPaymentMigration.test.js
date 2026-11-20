import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/planning.js';
import { mergeThreeWay } from '../src/engine.js';
import { prepareFullRestore } from '../src/fullRestore.js';
import { approvePlanRevision } from '../src/planArchive.js';
import { carriedPlanAssumptions } from '../src/planCarryForward.js';
import { migrateState, validateState } from '../src/stateSchema.js';
import { readState } from '../src/storage.web.js';
import { paymentChangeConflictLines, paymentHistoryText } from '../src/loanPaymentLabels.js';
import { installBrowserStorage } from './helpers/browserStorage.js';
import { createFinancialState } from './helpers/financialFixtures.js';

// Version 4 is the last schema before loans kept a payment history (LOAN-1a).
const k_versionBeforeHistory = 4;
const k_planApprovedAt = '2026-03-01T10:00:00.000Z';
const k_editedAfterApproval = '2026-09-15T08:00:00.000Z';
const k_legacyCarLoan = { id: 'car', name: 'Car', account: 'everyday', start: '2026-01', end: '2029-12', payment: 18500, remaining: 0, original: 0 };

function legacyLedger(overrides = {}) {
  return createFinancialState({ version: k_versionBeforeHistory, loans: [k_legacyCarLoan], ...overrides });
}

// A 2026 plan approved on 1 March that lowers the car payment to €150 from
// June and stops it from June 2027, as the interview stored plan-only changes.
function legacyLedgerWithApprovedPlan(loan = k_legacyCarLoan) {
  const state = legacyLedger({ loans: [loan] });
  const plan = buildPlan(state, {
    year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02',
    loanChanges: [{ loanId: 'car', since: '2026-06', amount: 15000 }, { loanId: 'car', since: '2027-06', amount: 0 }]
  });
  return approvePlanRevision(state, { ...plan, createdAt: k_planApprovedAt }, { id: 'plan-2026', fromMonth: 1, today: '2026-01-02' });
}

test('a legacy loan without plan changes migrates to an empty history and nothing else changes', () => {
  const legacy = legacyLedger();

  const migrated = migrateState(legacy);

  assert.deepEqual(migrated, { ...legacy, version: 5, loans: [{ ...k_legacyCarLoan, paymentChanges: [] }] });
});

test('a never-edited loan takes the latest plan\'s scheduled changes into its history and the frozen plan stays identical', () => {
  const legacy = legacyLedgerWithApprovedPlan();
  const frozenPlanBytes = JSON.stringify(legacy.plans);

  const migrated = migrateState(legacy);
  const carried = carriedPlanAssumptions(migrated, { year: 2027, fromMonth: 1 });

  assert.deepEqual(migrated.loans[0].paymentChanges, [{ since: '2026-06', amount: 15000 }, { since: '2027-06', amount: 0 }]);
  assert.equal(JSON.stringify(migrated.plans), frozenPlanBytes);
  assert.deepEqual(carried.loanChanges, [{ loanId: 'car', since: '2027-01', amount: 15000 }, { loanId: 'car', since: '2027-06', amount: 0 }]);
});

test('a payment edited on the loan after the plan was approved replaces the plan\'s earlier changes, and its later change stays', () => {
  const legacy = legacyLedgerWithApprovedPlan({ ...k_legacyCarLoan, payment: 16000, paymentEditedAt: k_editedAfterApproval });

  const migrated = migrateState(legacy);
  const carried = carriedPlanAssumptions(migrated, { year: 2027, fromMonth: 1 });
  const draft = buildPlan(migrated, { year: 2027, fromMonth: 1, income: 200000, cushion: 0, loanChanges: carried.loanChanges, today: '2026-11-20' });

  assert.deepEqual(migrated.loans[0].paymentChanges, [{ since: '2027-06', amount: 0 }]);
  assert.equal(migrated.loans[0].paymentEditedAt, k_editedAfterApproval);
  // €160 entered on the loan in September, then the plan's June stop.
  assert.deepEqual(['2027-01', '2027-05', '2027-06'].map(month => draft.months[month].loan), [16000, 16000, 0]);
});

test('a payment edited before the plan was approved, or a plan without an exact approval time, keeps the plan\'s changes', () => {
  const editedBefore = legacyLedgerWithApprovedPlan({ ...k_legacyCarLoan, payment: 16000, paymentEditedAt: '2026-02-28T23:59:59.999Z' });
  const approved = legacyLedgerWithApprovedPlan({ ...k_legacyCarLoan, payment: 16000, paymentEditedAt: k_editedAfterApproval });
  const untimedPlans = { 2026: [{ ...approved.plans[2026][0], createdAt: '2026-03-01 10:00' }] };

  const expectedChanges = [{ since: '2026-06', amount: 15000 }, { since: '2027-06', amount: 0 }];

  assert.deepEqual(migrateState(editedBefore).loans[0].paymentChanges, expectedChanges);
  assert.deepEqual(migrateState({ ...approved, plans: untimedPlans }).loans[0].paymentChanges, expectedChanges);
});

test('a later year\'s plan decides its own months, so a change it dropped is not brought back and repeats add nothing', () => {
  const legacy = legacyLedgerWithApprovedPlan();
  // The 2027 draft removed the carried June stop and lowered the payment from September.
  const plan2027 = buildPlan(legacy, {
    year: 2027, fromMonth: 1, income: 200000, cushion: 0, today: '2026-11-20',
    loanChanges: [{ loanId: 'car', since: '2027-01', amount: 15000 }, { loanId: 'car', since: '2027-09', amount: 12000 }]
  });
  const withNextYear = approvePlanRevision(legacy, plan2027, { id: 'plan-2027', fromMonth: 1, today: '2026-11-20' });

  const migrated = migrateState(withNextYear);

  assert.deepEqual(migrated.loans[0].paymentChanges, [{ since: '2026-06', amount: 15000 }, { since: '2027-09', amount: 12000 }]);
});

test('a single-plan legacy ledger migrates its plan changes into the history as well', () => {
  const legacy = createFinancialState({ version: 1, loans: [k_legacyCarLoan] });
  legacy.plan = buildPlan(legacy, { year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02', loanChanges: [{ loanId: 'car', since: '2026-10', amount: 17000 }] });

  const migrated = migrateState(legacy);

  assert.deepEqual(migrated.loans[0].paymentChanges, [{ since: '2026-10', amount: 17000 }]);
});

test('reading a version 4 ledger keeps its exact bytes as a recovery copy before saving the history', async context => {
  const storage = installBrowserStorage(context);
  const originalBytes = JSON.stringify(legacyLedgerWithApprovedPlan(), null, 2);
  storage.setItem('melo-state-v1', originalBytes);

  const migrated = await readState();

  assert.equal(migrated.version, 5);
  assert.deepEqual(migrated.loans[0].paymentChanges, [{ since: '2026-06', amount: 15000 }, { since: '2027-06', amount: 0 }]);
  assert.equal(storage.getItem('melo-state-v1:recovery:v4'), originalBytes);
});

test('a full restore of a version 4 backup brings each loan\'s history', () => {
  const backup = legacyLedgerWithApprovedPlan({ ...k_legacyCarLoan, paymentEditedAt: k_editedAfterApproval, payment: 16000 });

  const { restoredState } = prepareFullRestore(JSON.stringify(backup));

  assert.deepEqual(restoredState.loans[0].paymentChanges, [{ since: '2027-06', amount: 0 }]);
  assert.equal(restoredState.loans[0].paymentEditedAt, k_editedAfterApproval);
});

test('a history change on one device merges with a rename on the other; two history changes conflict for the owner', () => {
  const car = { ...k_legacyCarLoan, paymentChanges: [] };
  const base = createFinancialState({ loans: [car] });
  const loweredHere = createFinancialState({ loans: [{ ...car, paymentChanges: [{ since: '2027-03', amount: 15000 }] }] });
  const renamedThere = createFinancialState({ loans: [{ ...car, name: 'Family car' }] });
  const raisedThere = createFinancialState({ loans: [{ ...car, paymentChanges: [{ since: '2027-01', amount: 20000 }] }] });

  const clean = mergeThreeWay(base, loweredHere, renamedThere);
  const conflicting = mergeThreeWay(base, loweredHere, raisedThere);

  assert.deepEqual([clean.conflicts, clean.result.loans], [[], [{ ...car, name: 'Family car', paymentChanges: [{ since: '2027-03', amount: 15000 }] }]]);
  assert.deepEqual(conflicting.conflicts.map(conflict => [conflict.collection, conflict.field, conflict.local, conflict.remote]), [
    ['loans', 'paymentChanges', [{ since: '2027-03', amount: 15000 }], [{ since: '2027-01', amount: 20000 }]]
  ]);
});

test('a current ledger needs a valid payment history on every loan; the legacy edit time stays readable', () => {
  const ledgerWithLoan = loan => createFinancialState({ loans: [{ ...k_legacyCarLoan, paymentChanges: [], ...loan }] });
  const { paymentChanges, ...loanWithoutHistory } = ledgerWithLoan({}).loans[0];

  assert.deepEqual(paymentChanges, []);
  assert.doesNotThrow(() => validateState(ledgerWithLoan({ paymentChanges: [{ since: '2026-06', amount: 0 }, { since: '2027-01', amount: 15000 }, { since: '2027-03', until: '2027-03', amount: 9000 }] })));
  assert.doesNotThrow(() => validateState(ledgerWithLoan({ paymentEditedAt: k_editedAfterApproval })));
  assert.throws(() => validateState(createFinancialState({ loans: [loanWithoutHistory] })), /loan payment history/);
  for (const invalidChanges of [null, {}, [{ since: '2026-13', amount: 100 }], [{ since: '2026-06', amount: 12.5 }], [{ since: '2026-06', amount: -1 }], [{ since: '2026-06', amount: 100 }, { since: '2026-06', amount: 200 }], [{ since: '2026-06', until: '2026-05', amount: 100 }], [{ since: '2026-06', until: 'forever', amount: 100 }]]) {
    assert.throws(() => validateState(ledgerWithLoan({ paymentChanges: invalidChanges })), /loan payment history/);
  }
  assert.throws(() => validateState(ledgerWithLoan({ paymentEditedAt: '2026-09-15' })), /loan payment edit time/);
});

test('a payment history conflict reads as dated amounts, oldest first, and an empty side says so', () => {
  const car = { ...k_legacyCarLoan, paymentChanges: [{ since: '2027-03', amount: 15000 }, { since: '2026-09', amount: 123456789 }] };

  assert.deepEqual(paymentChangeConflictLines(car.paymentChanges), ['€1,234,567.89 from September 2026', '€150.00 from March 2027']);
  assert.deepEqual(paymentChangeConflictLines([]), ['No payment changes']);
  assert.equal(paymentHistoryText(car), '€185.00 from January 2026 · €1,234,567.89 from September 2026 · €150.00 from March 2027');
});

// Revision 1 (January) lowers the car payment to €150 from March and €120 from
// October; revision 2 starts in July and stores only what applies from July.
function legacyLedgerWithTwoRevisions(revisionTwoChanges) {
  const state = legacyLedger();
  const firstOptions = { year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02', loanChanges: [{ loanId: 'car', since: '2026-03', amount: 15000 }, { loanId: 'car', since: '2026-10', amount: 12000 }] };
  const withFirst = approvePlanRevision(state, buildPlan(state, firstOptions), { id: 'plan-2026-1', fromMonth: 1, today: '2026-01-02' });
  const second = buildPlan(withFirst, { year: 2026, fromMonth: 7, income: 210000, cushion: 0, today: '2026-07-02', loanChanges: revisionTwoChanges });
  return approvePlanRevision(withFirst, second, { id: 'plan-2026-2', fromMonth: 7, today: '2026-07-02' });
}

test('an earlier revision of the same year keeps its changes for the months before the later revision starts', () => {
  const legacy = legacyLedgerWithTwoRevisions([{ loanId: 'car', since: '2026-07', amount: 15000 }, { loanId: 'car', since: '2026-10', amount: 12000 }]);

  assert.deepEqual(migrateState(legacy).loans[0].paymentChanges, [{ since: '2026-03', amount: 15000 }, { since: '2026-10', amount: 12000 }]);
});

test('a change a later revision of the same year dropped is not brought back', () => {
  const legacy = legacyLedgerWithTwoRevisions([{ loanId: 'car', since: '2026-07', amount: 15000 }]);

  assert.deepEqual(migrateState(legacy).loans[0].paymentChanges, [{ since: '2026-03', amount: 15000 }]);
});

test('the edit month comes from the exact UTC instant, so every device migrates the same file alike', context => {
  // In Lisbon this instant is already 1 October locally.
  const originalTimeZone = process.env.TZ;
  process.env.TZ = 'Europe/Lisbon';
  context.after(() => {
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
      return;
    }
    process.env.TZ = originalTimeZone;
  });
  const lateOnTheLastDay = legacyLedgerWithApprovedPlan({ ...k_legacyCarLoan, payment: 16000, paymentEditedAt: '2026-09-30T23:30:00.000Z' });
  const planWithOctoberChange = { ...lateOnTheLastDay.plans[2026][0], loanChanges: [{ loanId: 'car', since: '2026-09', amount: 15000 }, { loanId: 'car', since: '2026-10', amount: 14000 }] };

  const migrated = migrateState({ ...lateOnTheLastDay, plans: { 2026: [planWithOctoberChange] } });

  assert.deepEqual(migrated.loans[0].paymentChanges, [{ since: '2026-10', amount: 14000 }]);
});

test('a plan change dated at the loan\'s start becomes its starting payment', () => {
  const legacy = legacyLedger();
  const plan = buildPlan(legacy, { year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02', loanChanges: [{ loanId: 'car', since: '2026-01', amount: 17000 }] });
  const withPlan = approvePlanRevision(legacy, plan, { id: 'plan-2026', fromMonth: 1, today: '2026-01-02' });

  const migratedLoan = migrateState(withPlan).loans[0];

  assert.deepEqual([migratedLoan.payment, migratedLoan.paymentChanges], [17000, []]);
});

test('temporary and one-month payments read with their until month', () => {
  const car = { ...k_legacyCarLoan, paymentChanges: [{ since: '2027-01', until: '2027-05', amount: 9000 }, { since: '2027-08', until: '2027-08', amount: 30000 }] };

  assert.equal(paymentHistoryText(car), '€185.00 from January 2026 · €90.00 from January 2027 until May 2027 · €300.00 in August 2027 only');
});

test('a version 4 backup merged against a version 5 device brings the same history, so nothing conflicts', () => {
  const legacyBackup = legacyLedgerWithApprovedPlan();
  const base = migrateState(legacyBackup);
  const renamedHere = { ...base, loans: [{ ...base.loans[0], name: 'Family car' }] };

  const merge = mergeThreeWay(base, renamedHere, migrateState(structuredClone(legacyBackup)));

  assert.deepEqual(merge.conflicts, []);
  assert.deepEqual(merge.result.loans[0].paymentChanges, [{ since: '2026-06', amount: 15000 }, { since: '2027-06', amount: 0 }]);
});

test('a later revision that removed only a next-year change does not bring it back', () => {
  const state = legacyLedger();
  const firstOptions = { year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02', loanChanges: [{ loanId: 'car', since: '2027-06', amount: 0 }] };
  const withFirst = approvePlanRevision(state, buildPlan(state, firstOptions), { id: 'plan-2026-1', fromMonth: 1, today: '2026-01-02' });
  const sameMonthsNoChanges = buildPlan(withFirst, { ...firstOptions, fromMonth: 7, today: '2026-07-02', loanChanges: [] });
  const withSecond = approvePlanRevision(withFirst, sameMonthsNoChanges, { id: 'plan-2026-2', fromMonth: 7, today: '2026-07-02' });

  assert.deepEqual(migrateState(withSecond).loans[0].paymentChanges, []);
});

test('a newer loan edit wins over the next year\'s plan that only carried an earlier plan\'s payment (P19)', () => {
  const state = legacyLedger({ loans: [{ ...k_legacyCarLoan, payment: 120000 }] });
  const plan2026 = buildPlan(state, { year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02', loanChanges: [{ loanId: 'car', since: '2026-06', amount: 110000 }] });
  const with2026 = approvePlanRevision(state, { ...plan2026, createdAt: '2026-01-02T09:00:00.000Z' }, { id: 'plan-2026', fromMonth: 1, today: '2026-01-02' });
  // Drafted in October: the 2027 plan restates the carried €1,100 in January and adds its own €900 from September.
  const plan2027 = buildPlan(with2026, { year: 2027, fromMonth: 1, income: 200000, cushion: 0, today: '2026-10-02', loanChanges: [{ loanId: 'car', since: '2027-01', amount: 110000 }, { loanId: 'car', since: '2027-09', amount: 90000 }] });
  const with2027 = approvePlanRevision(with2026, { ...plan2027, createdAt: '2026-10-02T09:00:00.000Z' }, { id: 'plan-2027', fromMonth: 1, today: '2026-10-02' });
  const editedInNovember = { ...with2027, loans: [{ ...with2027.loans[0], payment: 100000, paymentEditedAt: '2026-11-15T10:00:00.000Z' }] };

  const migratedLoan = migrateState(editedInNovember).loans[0];

  assert.deepEqual([migratedLoan.payment, migratedLoan.paymentChanges], [100000, [{ since: '2027-09', amount: 90000 }]]);
});

test('a plan holding two changes for the same loan and month migrates with the last one, as plans used it', () => {
  const legacy = legacyLedger();
  const plan = buildPlan(legacy, { year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02', loanChanges: [{ loanId: 'car', since: '2026-09', amount: 15000 }, { loanId: 'car', since: '2026-09', amount: 16000 }, { loanId: 'car', since: '2026-04', amount: 15000 }, { loanId: 'car', since: '2026-04', amount: 18500 }] });
  const withPlan = approvePlanRevision(legacy, plan, { id: 'plan-2026', fromMonth: 1, today: '2026-01-02' });

  assert.equal(plan.months['2026-09'].loan, 16000);
  assert.deepEqual(migrateState(withPlan).loans[0].paymentChanges, [{ since: '2026-09', amount: 16000 }]);
});
