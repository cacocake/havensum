import test from 'node:test';
import assert from 'node:assert/strict';
import { readImportRecovery, readMergeRecovery, readState, writeImportRecovery, writeMergeRecovery, writeState } from '../src/storage.web.js';
import { buildPlan } from '../src/planning.js';
import { approvePlanRevision, latestPlan, planRevisions, plannedMonth, plannedYears, planRevisionStart, ReadOnlyPlanYearError, selectedPlan } from '../src/planArchive.js';
import { mergeThreeWay } from '../src/engine.js';
import { expectedSavings } from '../src/expectedSavings.js';
import { representedPlanYears, takeReviewedPlanYear } from '../src/planMerge.js';
import { migrateState, validateState } from '../src/stateSchema.js';
import { installBrowserStorage } from './helpers/browserStorage.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

const k_legacyVersion = 2;
const k_today = '2026-11-19';

function createLegacyLedger() {
  const legacyState = createFinancialState({
    version: k_legacyVersion,
    transactions: [createTransaction({ date: '2026-10-10', amount: 30000 })]
  });
  delete legacyState.plans;
  legacyState.plan = {
    year: 2026,
    revision: 3,
    createdAt: '2026-06-01T09:00:00.000Z',
    window: 6,
    tolerance: 200,
    drift: 0.3,
    incomeChanges: [],
    loanChanges: [],
    months: {
      '2026-06': {
        income: 210000, expense: 43210, cushion: 0, loan: 0, event: 0, balance: 166790,
        lines: [{ id: 'groceries', category: 'groceries', name: 'Groceries', kind: 'Variable', amount: 43210, override: true }]
      }
    }
  };
  return legacyState;
}

test('freezing a second year after loading a legacy ledger keeps the first year frozen across reload', async context => {
  const storage = installBrowserStorage(context);
  const legacyState = createLegacyLedger();
  const originalPlan = structuredClone(legacyState.plan);
  storage.setItem('melo-state-v1', JSON.stringify(legacyState));

  const loadedState = await readState();
  const nextYearPlan = buildPlan(loadedState, { year: 2027, income: 220000, cushion: 0 });
  await writeState(approvePlanRevision(loadedState, nextYearPlan, { id: 'plan-2027-first', fromMonth: 1, today: k_today }));
  const reloadedState = await readState();

  const { id, ...firstYearPlan } = latestPlan(reloadedState, 2026);
  assert.equal(typeof id, 'string');
  assert.deepEqual(firstYearPlan, originalPlan);
  assert.equal(latestPlan(reloadedState, 2027).months['2027-01'].income, 220000);
  assert.equal(latestPlan(reloadedState, 2027).revision, 1);
});

test('a legacy ledger without a plan migrates to an empty archive and keeps its original bytes', async context => {
  const storage = installBrowserStorage(context);
  const legacyBytes = JSON.stringify(createFinancialState({ version: k_legacyVersion }));
  storage.setItem('melo-state-v1', legacyBytes);

  const migratedState = await readState();

  assert.deepEqual(migratedState.plans, {});
  assert.equal(Object.hasOwn(migratedState, 'plan'), false);
  assert.equal(storage.getItem('melo-state-v1:recovery:v2'), legacyBytes);
});

test('a same-year revision keeps earlier months exactly, including months that were never planned', async context => {
  const storage = installBrowserStorage(context);
  storage.setItem('melo-state-v1', JSON.stringify(createLegacyLedger()));
  const loadedState = await readState();
  const juneBefore = structuredClone(latestPlan(loadedState, 2026).months['2026-06']);

  const revision = buildPlan(loadedState, { year: 2026, fromMonth: 11, income: 250000, cushion: 0 });
  const revisedState = approvePlanRevision(loadedState, revision, { id: 'plan-2026-november', fromMonth: 11, today: k_today });
  const revisedPlan = latestPlan(revisedState, 2026);

  assert.deepEqual(Object.keys(revisedPlan.months).sort(), ['2026-06', '2026-11', '2026-12']);
  assert.deepEqual(revisedPlan.months['2026-06'], juneBefore);
  assert.deepEqual([revisedPlan.revision, revisedPlan.months['2026-11'].income], [4, 250000]);
  assert.deepEqual(planRevisions(revisedState, 2026).map(snapshot => snapshot.revision), [3, 4]);
  assert.deepEqual(selectedPlan(revisedState, 2026, planRevisions(revisedState, 2026)[0].id), latestPlan(loadedState, 2026));
});

test('the revision starts at the later of the selected and current month, or January for a future year', () => {
  assert.deepEqual(planRevisionStart(2026, '2026-12', k_today), { kind: 'editable', fromMonth: 12 });
  assert.deepEqual(planRevisionStart(2026, '2026-03', k_today), { kind: 'editable', fromMonth: 11 });
  assert.deepEqual(planRevisionStart(2027, '2027-05', k_today), { kind: 'editable', fromMonth: 1 });
  assert.deepEqual(planRevisionStart(2026, '2026-11', '2026-12-01'), { kind: 'editable', fromMonth: 12 });
});

test('a December draft saved in January is blocked because its year is now read-only', () => {
  const state = createFinancialState();
  const decemberDraft = buildPlan(state, { year: 2026, fromMonth: 12, income: 100000, cushion: 0 });

  assert.deepEqual(planRevisionStart(2026, '2026-12', '2027-01-02'), { kind: 'readOnly' });
  assert.throws(() => approvePlanRevision(state, decemberDraft, { id: 'late', fromMonth: 12, today: '2027-01-02' }), ReadOnlyPlanYearError);
  assert.deepEqual(state.plans, {});
});

test('a selected year without a plan reports no target while other years keep theirs', () => {
  const state = createFinancialState();
  const firstYear = approvePlanRevision(state, buildPlan(state, { year: 2026, fromMonth: 11, income: 100000, cushion: 0 }), { id: 'plan-2026', fromMonth: 11, today: k_today });
  const bothYears = approvePlanRevision(firstYear, buildPlan(firstYear, { year: 2027, income: 120000, cushion: 0 }), { id: 'plan-2027', fromMonth: 1, today: k_today });

  assert.equal(latestPlan(firstYear, 2027), null);
  assert.equal(plannedMonth(firstYear, '2027-01'), null);
  assert.equal(buildPlan(firstYear, { year: 2027 }).revision, 1);
  assert.deepEqual(['2026-12', '2027-01'].map(month => plannedMonth(bothYears, month).income), [100000, 120000]);
  assert.deepEqual(plannedYears(bothYears), [2026, 2027]);
});

function snapshot(id, year, revision, income) {
  return { ...buildPlan(createFinancialState(), { year, income, cushion: 0 }), id, revision };
}

test('plan years edited on different devices merge independently and repeat cleanly', () => {
  const shared2026 = [snapshot('plan-2026-a', 2026, 1, 100)];
  const base = createFinancialState({ plans: { 2026: shared2026 } });
  const local = createFinancialState({ plans: { 2026: [...shared2026, snapshot('plan-2026-b', 2026, 2, 200)] } });
  const remote = createFinancialState({ plans: { 2026: shared2026, 2027: [snapshot('plan-2027-a', 2027, 1, 300)] } });

  const merged = mergeThreeWay(base, local, remote);
  const repeated = mergeThreeWay(base, merged.result, remote);

  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.result.plans, { 2026: local.plans[2026], 2027: remote.plans[2027] });
  assert.deepEqual(repeated.result.plans, merged.result.plans);
  assert.deepEqual(repeated.conflicts, []);
});

test('an older single-plan backup contributes its year without deleting years it could never represent', () => {
  const base = createFinancialState({ plans: { 2026: [snapshot('plan-2026-a', 2026, 1, 100)], 2027: [snapshot('plan-2027-a', 2027, 1, 300)] } });
  const local = structuredClone(base);
  const { id: discardedId, ...legacyPlan } = snapshot('not-in-legacy-data', 2026, 2, 900);
  const legacyBackup = createFinancialState({ version: k_legacyVersion, plan: legacyPlan });
  const remote = migrateState(legacyBackup);

  const merged = mergeThreeWay(base, local, remote, { remotePlanYears: representedPlanYears(legacyBackup) });

  assert.deepEqual(merged.result.plans[2027], local.plans[2027]);
  assert.deepEqual(merged.result.plans[2026], [...base.plans[2026], remote.plans[2026][0]]);
  assert.deepEqual(merged.conflicts, []);
});

test('choosing one side of a same-year conflict replaces only that year and keeps both candidates until chosen', () => {
  const base = createFinancialState({ plans: { 2026: [snapshot('plan-2026-a', 2026, 1, 100)] } });
  const local = createFinancialState({ plans: { 2026: [snapshot('plan-2026-local', 2026, 1, 200)], 2027: [snapshot('plan-2027-a', 2027, 1, 300)] } });
  const remote = createFinancialState({ plans: { 2026: [snapshot('plan-2026-remote', 2026, 1, 400)] } });
  const merged = mergeThreeWay(base, local, remote);
  const [conflict] = merged.conflicts;

  assert.deepEqual([conflict.local, conflict.remote], [local.plans[2026], remote.plans[2026]]);
  const reviewed = takeReviewedPlanYear(merged.result, conflict.id, conflict.remote);
  assert.deepEqual(reviewed.plans, { 2026: remote.plans[2026], 2027: local.plans[2027] });
  assert.equal(validateState(reviewed), reviewed);
});

test('malformed plan archives cannot be saved or loaded', async context => {
  const storage = installBrowserStorage(context);
  const state = createFinancialState();
  const revision = snapshot('plan-2026-a', 2026, 1, 100);
  const invalidStates = [
    { ...state, plans: [] },
    { ...state, plans: { 2026: [] } },
    { ...state, plans: { '26': [revision] } },
    { ...state, plans: { 2027: [revision] } },
    { ...state, plans: { 2026: [{ ...revision, id: '' }] } },
    { ...state, plans: { 2026: [revision, revision] } },
    { ...state, plans: { 2026: [revision] }, plan: revision }
  ];
  for (const invalidState of invalidStates) {
    await assert.rejects(writeState(invalidState), SyntaxError);
    const invalidBytes = JSON.stringify(invalidState);
    storage.setItem('melo-state-v1', invalidBytes);
    await assert.rejects(readState(), SyntaxError);
    assert.equal(storage.getItem('melo-state-v1'), invalidBytes);
  }
});

test('a failed recovery write leaves the single-plan ledger untouched until a retry succeeds', async context => {
  const storage = installBrowserStorage(context);
  const legacyBytes = JSON.stringify(createLegacyLedger());
  storage.setItem('melo-state-v1', legacyBytes);
  const failedWrite = context.mock.method(storage, 'setItem', () => {
    throw Error('Recovery storage quota exceeded');
  });

  await assert.rejects(readState(), /quota/);
  assert.equal(storage.getItem('melo-state-v1'), legacyBytes);
  assert.equal(storage.getItem('melo-state-v1:recovery:v2'), null);
  failedWrite.mock.restore();

  assert.equal(latestPlan(await readState(), 2026).revision, 3);
  assert.equal(storage.getItem('melo-state-v1:recovery:v2'), legacyBytes);
});

test('the pre-merge ledger copy is kept apart from the CSV import recovery copy', async context => {
  installBrowserStorage(context);
  const importRecovery = createFinancialState({ theme: 'dark' });
  const preMergeLedger = createFinancialState({ plans: { 2026: [snapshot('plan-2026-a', 2026, 1, 100)] } });
  await writeImportRecovery(importRecovery);

  await writeMergeRecovery(preMergeLedger);

  assert.deepEqual(await readMergeRecovery(), preMergeLedger);
  assert.deepEqual(await readImportRecovery(), importRecovery);
});

test('approving a target-only revision leaves Expected savings unchanged', () => {
  const state = createFinancialState({
    transactions: [createTransaction({ date: '2026-10-10', amount: 30000 })],
    outlook: { completeMonths: ['2026-10'], incomeChanges: [{ since: '2026-11', amount: 200000 }] }
  });
  const prediction = expectedSavings(state, '2026-12', k_today);
  const firstYear = approvePlanRevision(state, buildPlan(state, { year: 2026, fromMonth: 11, income: 100000, cushion: 0 }), { id: 'plan-a', fromMonth: 11, today: k_today });
  const revised = approvePlanRevision(firstYear, buildPlan(firstYear, { year: 2026, fromMonth: 12, income: 900000, cushion: 50000, overrides: { groceries: 1 } }), { id: 'plan-b', fromMonth: 12, today: k_today });

  assert.deepEqual(expectedSavings(revised, '2026-12', k_today), prediction);
  assert.notDeepEqual(plannedMonth(revised, '2026-12'), plannedMonth(firstYear, '2026-12'));
});

test('merging the same backup again after the baseline moved keeps every local revision', () => {
  const first = snapshot('plan-2026-a', 2026, 1, 100);
  const second = snapshot('plan-2026-b', 2026, 2, 200);
  const remote = createFinancialState({ plans: { 2026: [first] } });
  const local = createFinancialState({ plans: { 2026: [first, second] } });
  const merged = mergeThreeWay(remote, local, remote);
  const repeated = mergeThreeWay(merged.result, merged.result, remote);

  assert.deepEqual(repeated.result.plans, { 2026: [first, second] });
  assert.deepEqual(repeated.conflicts, []);
});

test('a revision from an older backup is appended without dropping earlier local revisions', () => {
  const first = snapshot('plan-2026-a', 2026, 1, 100);
  const base = createFinancialState({ plans: { 2026: [first] } });
  const { id: discardedId, ...legacyPlan } = snapshot('not-in-legacy-data', 2026, 2, 900);
  const legacyBackup = createFinancialState({ version: k_legacyVersion, plan: legacyPlan });
  const remote = migrateState(legacyBackup);

  const merged = mergeThreeWay(base, base, remote, { remotePlanYears: representedPlanYears(legacyBackup) });

  assert.deepEqual(merged.result.plans[2026], [first, remote.plans[2026][0]]);
  assert.deepEqual(merged.conflicts, []);
  const repeated = mergeThreeWay(merged.result, merged.result, remote, { remotePlanYears: representedPlanYears(legacyBackup) });
  assert.deepEqual(repeated.result.plans, merged.result.plans);
});

test('approval rejects a revision that changes months before its start', () => {
  const state = createFinancialState();
  const firstYear = approvePlanRevision(state, buildPlan(state, { year: 2026, fromMonth: 11, income: 100000, cushion: 0 }), { id: 'plan-a', fromMonth: 11, today: k_today });
  const tampered = buildPlan(firstYear, { year: 2026, fromMonth: 12, income: 200000, cushion: 0 });
  tampered.months['2026-11'].income = 1;

  assert.throws(() => approvePlanRevision(firstYear, tampered, { id: 'plan-b', fromMonth: 12, today: k_today }), /earlier months/);
  const added = buildPlan(firstYear, { year: 2026, fromMonth: 12, income: 200000, cushion: 0 });
  added.months['2026-10'] = added.months['2026-12'];
  assert.throws(() => approvePlanRevision(firstYear, added, { id: 'plan-c', fromMonth: 12, today: k_today }), /earlier months/);
});

test('revision numbers must be positive and increase within a year', async context => {
  installBrowserStorage(context);
  const state = createFinancialState();
  const first = snapshot('plan-2026-a', 2026, 1, 100);
  for (const revisions of [[{ ...first, revision: -1 }], [{ ...first, revision: 1.5 }], [first, snapshot('plan-2026-b', 2026, 1, 200)], [first, { ...snapshot('plan-2026-c', 2026, 2, 200), revision: 0 }]]) {
    await assert.rejects(writeState({ ...state, plans: { 2026: revisions } }), SyntaxError);
  }
});

test('an older backup whose revision does not follow the shared history needs an explicit choice', () => {
  const first = snapshot('plan-2026-a', 2026, 1, 100);
  const base = createFinancialState({ plans: { 2026: [first] } });
  const { id: discardedId, ...legacyPlan } = snapshot('not-in-legacy-data', 2026, 1, 900);
  const legacyBackup = createFinancialState({ version: k_legacyVersion, plan: legacyPlan });
  const remote = migrateState(legacyBackup);

  const merged = mergeThreeWay(base, base, remote, { remotePlanYears: representedPlanYears(legacyBackup) });

  assert.deepEqual(merged.result.plans[2026], [first]);
  assert.equal(merged.conflicts.length, 1);
  for (const side of ['local', 'remote']) {
    const reviewed = takeReviewedPlanYear(merged.result, '2026', merged.conflicts[0][side]);
    assert.equal(validateState(reviewed), reviewed);
  }
});

test('a legacy plan without a revision number migrates to a ledger that can still be saved and revised', async context => {
  const storage = installBrowserStorage(context);
  const legacyState = createLegacyLedger();
  delete legacyState.plan.revision;
  storage.setItem('melo-state-v1', JSON.stringify(legacyState));

  const loadedState = await readState();
  const revised = approvePlanRevision(loadedState, buildPlan(loadedState, { year: 2026, fromMonth: 11, income: 1, cushion: 0 }), { id: 'plan-next', fromMonth: 11, today: k_today });
  await writeState(revised);

  assert.equal(latestPlan(loadedState, 2026).revision, undefined);
  assert.deepEqual(planRevisions(await readState(), 2026).map(revision => revision.revision), [undefined, 1]);
});

test('approval without a valid start month is rejected explicitly', () => {
  const state = createFinancialState();
  const draft = buildPlan(state, { year: 2026, fromMonth: 11, income: 1, cushion: 0 });
  for (const fromMonth of [undefined, 0, 13, 1.5]) {
    assert.throws(() => approvePlanRevision(state, draft, { id: 'plan-x', fromMonth, today: k_today }), /start month/);
  }
});

test('legacy plans stored with a zero or null revision still open and save after migration', async context => {
  for (const storedRevision of [0, null]) {
    const storage = installBrowserStorage(context);
    const legacyState = createLegacyLedger();
    legacyState.plan.revision = storedRevision;
    storage.setItem('melo-state-v1', JSON.stringify(legacyState));

    const loadedState = await readState();
    await writeState({ ...loadedState, theme: 'dark' });

    assert.equal(latestPlan(await readState(), 2026).revision, storedRevision);
  }
});
