import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { buildPlan } from '../../src/planning.js';

const k_ledgerKey = 'melo-state-v1';

function ledgerWithEarlierPlan() {
  const ledger = createFinancialState({
    categories: [...createFinancialState().categories, { id: 'hobbies', name: 'Hobbies', kind: 'Variable' }],
    transactions: [
      createTransaction({ id: 'september-food', date: '2026-09-10', amount: 30000 }),
      createTransaction({ id: 'september-pay', type: 'income', category: 'salary', title: 'Salary', date: '2026-09-01', amount: 250000 }),
      createTransaction({ id: 'october-food', date: '2026-10-10', amount: 30000 }),
      createTransaction({ id: 'october-pay', type: 'income', category: 'salary', title: 'Salary', date: '2026-10-01', amount: 250000 })
    ],
    outlook: { completeMonths: ['2026-09', '2026-10'] }
  });
  const earlierPlan = buildPlan(ledger, {
    year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02',
    incomeChanges: [{ since: '2026-07', amount: 250000 }],
    overrides: { groceries: 41000, hobbies: 5000 }
  });
  ledger.plans = { 2026: [{ ...earlierPlan, id: 'plan-2026', createdAt: '2026-01-02T09:00:00.000Z' }] };
  ledger.categories = ledger.categories.filter(category => category.id !== 'hobbies');
  return ledger;
}

async function openNextYearInterview(page, ledger) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose month', exact: true }).click();
  await page.getByRole('button', { name: 'Next year', exact: true }).click();
  await page.getByRole('button', { name: 'Jan', exact: true }).click();
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Build a plan', exact: true }).click();
  return page.getByRole('dialog');
}

function savedLedger(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), k_ledgerKey);
}

test('a new year starts from the earlier plan, offers its overrides and freezes only the kept ones', async ({ page }) => {
  const dialog = await openNextYearInterview(page, ledgerWithEarlierPlan());
  await expect(dialog.getByLabel('Expected monthly income · EUR', { exact: true })).toHaveValue('2500');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(dialog.getByText('Assumptions start from your 2026 plan, revision 1.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Not applied: Hobbies override €50.00, its category no longer exists.', { exact: true })).toBeVisible();
  const groceriesOverride = dialog.getByLabel('Override Groceries', { exact: true });
  await expect(groceriesOverride).toHaveValue('');
  await dialog.getByRole('button', { name: 'Keep earlier override for Groceries', exact: true }).click();
  await expect(groceriesOverride).toHaveValue('410');
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const saved = await savedLedger(page);
  const groceries = saved.plans['2027'][0].months['2027-01'].lines.find(line => line.id === 'groceries');
  expect([groceries.amount, groceries.override]).toEqual([41000, true]);
  expect(saved.plans['2026']).toEqual(ledgerWithEarlierPlan().plans['2026']);
});

test('the month-by-month preview moves the forecast for a new named cost but not for a target-only edit', async ({ page }) => {
  const dialog = await openNextYearInterview(page, ledgerWithEarlierPlan());
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  const marchPlanned = dialog.getByTestId('draft-planned-2027-03');
  const marchExpected = dialog.getByTestId('draft-expected-2027-03');
  const plannedBefore = await marchPlanned.textContent();
  const expectedBefore = await marchExpected.textContent();

  await dialog.getByLabel('Override Groceries', { exact: true }).fill('1');
  await expect(marchPlanned).not.toHaveText(plannedBefore);
  await expect(marchExpected).toHaveText(expectedBefore);

  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await dialog.getByLabel('A trip, a big purchase, a seasonal cost · optional', { exact: true }).fill('Spring trip');
  await dialog.getByLabel('One-off amount · EUR', { exact: true }).fill('1000');
  await dialog.getByLabel('Month', { exact: true }).selectOption({ label: 'March' });
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(marchExpected).not.toHaveText(expectedBefore);
});

test('abandoning a draft leaves the ledger unchanged', async ({ page }) => {
  const ledger = ledgerWithEarlierPlan();
  const dialog = await openNextYearInterview(page, ledger);
  await dialog.getByLabel('Expected monthly income · EUR', { exact: true }).fill('9999');
  await dialog.getByLabel('Variable spending history', { exact: true }).selectOption('3');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await savedLedger(page)).toEqual(ledger);
});

function ledgerWithLoanChanges() {
  const ledger = ledgerWithEarlierPlan();
  ledger.loans = [
    { id: 'car', name: 'Car loan', account: 'everyday', start: '2026-01', end: '2029-12', payment: 18500, paymentChanges: [{ since: '2026-10', amount: 15000 }], remaining: 0, original: 0 },
    { id: 'phone', name: 'Phone plan', account: 'everyday', start: '2026-01', end: '2026-12', payment: 3000, paymentChanges: [], remaining: 0, original: 0 },
    { id: 'bike', name: 'Bike loan', account: 'everyday', start: '2027-06', end: '2028-05', payment: 4000, paymentChanges: [], remaining: 0, original: 0 }
  ];
  const plan = ledger.plans['2026'][0];
  plan.loanChanges = [{ loanId: 'car', since: '2026-10', amount: 15000 }, { loanId: 'phone', since: '2026-06', amount: 2000 }];
  plan.incomeChanges = [...plan.incomeChanges, { since: '2027-04', amount: 270000 }];
  plan.months['2026-12'].lines.push({ id: 'groceries:Fixed', category: 'groceries', name: 'Groceries · fixed', kind: 'Fixed', amount: 9000, override: true });
  return ledger;
}

test('step 2 shows loan payments from each loan\'s history and lists carried changes in their months', async ({ page }) => {
  const dialog = await openNextYearInterview(page, ledgerWithLoanChanges());
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(dialog.getByText('Car loan · €150.00/month from January', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Bike loan · €40.00/month from June', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Income €2,700.00/month from April 2027', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove carried income change from April 2027', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByText('Not applied: Phone plan payment change from 2026-06, the loan has ended or was removed.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Not applied: Groceries · fixed override €90.00, that plan line no longer exists.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const plan = (await savedLedger(page)).plans['2027'][0];
  expect([plan.months['2027-01'].loan, plan.months['2027-05'].income]).toEqual([15000, 250000]);
});

test('a same-year revision prefills current overrides, can drop one, and keeps earlier months and revisions', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  const ledger = ledgerWithEarlierPlan();
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Revise remaining year', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  const groceriesOverride = dialog.getByLabel('Override Groceries', { exact: true });
  await expect(groceriesOverride).toHaveValue('410');
  await dialog.getByRole('button', { name: 'Drop earlier override for Groceries', exact: true }).click();
  await expect(groceriesOverride).toHaveValue('');
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const revisions = (await savedLedger(page)).plans['2026'];
  expect(revisions.map(revision => revision.revision)).toEqual([1, 2]);
  expect(revisions[0]).toEqual(ledger.plans['2026'][0]);
  for (const month of ['2026-01', '2026-06', '2026-10']) {
    expect(revisions[1].months[month]).toEqual(ledger.plans['2026'][0].months[month]);
  }
  expect(revisions[1].months['2026-11'].lines.find(line => line.id === 'groceries').override).toBe(false);
});
