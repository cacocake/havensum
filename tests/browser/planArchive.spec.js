import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';
import { buildPlan } from '../../src/planning.js';

const k_ledgerKey = 'melo-state-v1';
const k_baselineKey = 'melo-sync-base';
const k_mergeRecoveryKey = 'havensum-merge-recovery-v1';

function approvedSnapshot(state, { id, year, fromMonth = 1, income, revision = 1, createdAt = `${year}-01-02T09:00:00.000Z` }) {
  return { ...buildPlan(state, { year, fromMonth, income, cushion: 0 }), id, revision, createdAt };
}

async function openPlanInterview(page, buttonName) {
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  return dialog;
}

function savedLedger(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), k_ledgerKey);
}

test('a legacy single-plan ledger keeps its frozen year after a second year is frozen and the app reloads', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  const legacyLedger = createFinancialState({ version: 2, transactions: [createTransaction({ date: '2026-10-10', amount: 30000 })] });
  legacyLedger.plan = { ...buildPlan(legacyLedger, { year: 2026, fromMonth: 6, income: 210000, cushion: 0, overrides: { groceries: 43210 } }), revision: 3, createdAt: '2026-06-01T09:00:00.000Z' };
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger: legacyLedger });
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose month', exact: true }).click();
  await page.getByRole('button', { name: 'Next year', exact: true }).click();
  await page.getByRole('button', { name: 'Jan', exact: true }).click();
  const dialog = await openPlanInterview(page, 'Build a plan');
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();

  const saved = await savedLedger(page);
  const { id, ...firstYear } = saved.plans['2026'][0];
  expect(typeof id).toBe('string');
  expect(firstYear).toEqual(legacyLedger.plan);
  expect(saved.plans['2027'].map(revision => revision.revision)).toEqual([1]);
  expect(saved.plan).toBeUndefined();
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await expect(page.getByText('2026 · revision 3 · 2026-06-01.', { exact: false })).toBeVisible();
});

test('a draft left open into the next month refreshes its start and needs a fresh approval', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-30T12:00:00') });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger: createFinancialState() });
  await page.goto('/');
  const dialog = await openPlanInterview(page, 'Build a plan');
  await expect(dialog.getByText('Step 3 of 3 · Only November–December will change.', { exact: true })).toBeVisible();
  await page.clock.setSystemTime(new Date('2026-12-01T09:00:00'));
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();

  await expect(dialog.getByText('The calendar has moved on', { exact: false })).toBeVisible();
  await expect(dialog.getByText('Step 3 of 3 · Only December–December will change.', { exact: true })).toBeVisible();
  expect((await savedLedger(page)).plans).toEqual({});
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const revision = (await savedLedger(page)).plans['2026'][0];
  expect(Object.keys(revision.months)).toEqual(['2026-12']);
});

test('a December draft left open into January cannot save into the now read-only year', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-12-31T12:00:00') });
  const ledger = createFinancialState();
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');
  const dialog = await openPlanInterview(page, 'Build a plan');
  await page.clock.setSystemTime(new Date('2027-01-01T09:00:00'));
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();

  await expect(dialog.getByText('2026 is now a past year, so its plans are read-only. Nothing was saved.', { exact: true })).toBeVisible();
  expect((await savedLedger(page)).plans).toEqual({});
});

test('an earlier revision of the selected year opens read-only beside the latest one', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  const ledger = createFinancialState();
  const firstRevision = approvedSnapshot(ledger, { id: 'plan-2026-first', year: 2026, income: 100000 });
  const secondRevision = approvedSnapshot({ ...ledger, plans: { 2026: [firstRevision] } }, { id: 'plan-2026-second', year: 2026, fromMonth: 11, income: 200000, revision: 2, createdAt: '2026-11-02T09:00:00.000Z' });
  ledger.plans = { 2026: [firstRevision, secondRevision] };
  await page.addInitScript(({ key, ledger }) => localStorage.setItem(key, JSON.stringify(ledger)), { key: k_ledgerKey, ledger });
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await expect(page.getByText('2026 · revision 2 · 2026-11-02.', { exact: false })).toBeVisible();
  await expect(page.getByText('EARLIER REVISION · READ-ONLY', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Show plan revision 1', exact: true }).click();
  await expect(page.getByText('2026 · revision 1 · 2026-01-02.', { exact: false })).toBeVisible();
  await expect(page.getByText('EARLIER REVISION · READ-ONLY', { exact: true })).toBeVisible();
  expect((await savedLedger(page)).plans).toEqual(ledger.plans);
});

function createConflictingPlanHistories() {
  const baseline = createFinancialState();
  const sharedRevision = approvedSnapshot(baseline, { id: 'plan-2026-shared', year: 2026, income: 100000 });
  baseline.plans = { 2026: [sharedRevision] };
  const localRevision = approvedSnapshot(baseline, { id: 'plan-2026-phone', year: 2026, fromMonth: 11, income: 150000, revision: 2 });
  const remoteRevision = approvedSnapshot(baseline, { id: 'plan-2026-laptop', year: 2026, fromMonth: 11, income: 175000, revision: 2 });
  const remoteNextYear = approvedSnapshot(baseline, { id: 'plan-2027-laptop', year: 2027, income: 180000 });
  const local = { ...baseline, plans: { 2026: [sharedRevision, localRevision] } };
  const remote = { ...baseline, plans: { 2026: [sharedRevision, remoteRevision], 2027: [remoteNextYear] } };
  return { baseline, local, remote };
}

async function reviewBackup(page, remote) {
  await openMoreSection(page, 'Settings');
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Review backup merge', exact: true }).click();
  await (await choosingFile).setFiles({ name: 'synthetic-plans.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(remote)) });
  return page.getByRole('dialog');
}

test('same-year plan histories with the same revision number need a choice and keep a pre-merge recovery copy', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  const { baseline, local, remote } = createConflictingPlanHistories();
  await page.addInitScript(({ keys, baseline, local }) => {
    if (!localStorage.getItem(keys.ledger)) {
      localStorage.setItem(keys.ledger, JSON.stringify(local));
      localStorage.setItem(keys.baseline, JSON.stringify(baseline));
    }
  }, { keys: { ledger: k_ledgerKey, baseline: k_baselineKey }, baseline, local });
  await page.goto('/');
  const review = await reviewBackup(page, remote);
  await expect(review.getByText('2026 plan · revision history', { exact: false })).toBeVisible();
  const apply = review.getByRole('button', { name: 'Apply reviewed merge', exact: true });
  await expect(apply).toBeDisabled();
  await review.getByText('BACKUP FILE', { exact: true }).click();
  await apply.click();

  await expect.poll(async () => (await savedLedger(page)).plans).toEqual(remote.plans);
  const recovery = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), k_mergeRecoveryKey);
  expect(recovery.plans).toEqual(local.plans);
});

test('a failed pre-merge recovery copy blocks the merge and leaves the ledger unchanged', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  const { baseline, local, remote } = createConflictingPlanHistories();
  await page.addInitScript(({ keys, baseline, local }) => {
    if (!localStorage.getItem(keys.ledger)) {
      localStorage.setItem(keys.ledger, JSON.stringify(local));
      localStorage.setItem(keys.baseline, JSON.stringify(baseline));
    }
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === keys.recovery) {
        throw Error('Synthetic recovery quota exceeded');
      }
      return setItem.call(this, key, value);
    };
  }, { keys: { ledger: k_ledgerKey, baseline: k_baselineKey, recovery: k_mergeRecoveryKey }, baseline, local });
  await page.goto('/');
  const review = await reviewBackup(page, remote);
  await review.getByText('BACKUP FILE', { exact: true }).click();
  await review.getByRole('button', { name: 'Apply reviewed merge', exact: true }).click();

  await expect(page.getByText('Synthetic recovery quota exceeded', { exact: true })).toBeVisible();
  await expect(review).toBeVisible();
  expect((await savedLedger(page)).plans).toEqual(local.plans);
});

test('example data starts with an archived plan and clearing it leaves an empty, valid archive', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.goto('/');
  await expect.poll(async () => (await savedLedger(page))?.plans?.['2026']?.length).toBe(1);
  await openMoreSection(page, 'Settings');
  await page.getByRole('button', { name: 'Clear example data', exact: true }).click();
  await page.getByRole('button', { name: 'Clear example data permanently', exact: true }).click();

  await expect.poll(async () => (await savedLedger(page)).demo).toBe(false);
  expect((await savedLedger(page)).plans).toEqual({});
  await page.reload();
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await expect(page.getByText('No approved plan for 2026.', { exact: false })).toBeVisible();
});
