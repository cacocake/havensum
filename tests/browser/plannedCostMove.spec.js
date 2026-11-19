import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { buildPlan } from '../../src/planning.js';

// Owner decisions F16/F17: a recurring planned cost moves from this year or a
// later one. Earlier years, frozen plans and recorded expenses stay as saved.
const k_ledgerKey = 'melo-state-v1';

function celebrationsPayment(id, title, date, month) {
  return createTransaction({ id, title, date, amount: 8000, category: 'shopping', plannedCost: { eventId: 'celebrations', month } });
}

// All synthetic: a recurring December cost with last year's expense, an early
// booking already linked to next December, a one-off trip and a frozen plan.
function ledgerWithPlannedCosts() {
  const ledger = createFinancialState({
    events: [
      { id: 'celebrations', name: 'December celebrations', month: 12, amount: 30000 },
      { id: 'trip', name: 'Autumn trip', year: 2026, month: 10, amount: 90000 }
    ],
    transactions: [
      celebrationsPayment('gifts-2025', 'Gifts', '2025-12-20', '2025-12'),
      celebrationsPayment('early-booking', 'Early booking', '2026-11-12', '2027-12')
    ]
  });
  const plan = buildPlan(ledger, { year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02' });
  ledger.plans = { 2026: [{ ...plan, id: 'plan-2026', createdAt: '2026-01-02T09:00:00.000Z' }] };
  return ledger;
}

async function openYearAhead(page, ledger) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Plan Year ahead', exact: true }).click();
  return page.getByTestId('planned-costs');
}

function savedLedger(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), k_ledgerKey);
}

test('moving a recurring planned cost from next year keeps this year, its linked expenses and the frozen plan', async ({ page }) => {
  const costs = await openYearAhead(page, ledgerWithPlannedCosts());
  await expect(costs.getByTestId('planned-cost-trip')).toContainText('October 2026 only · €900.00');
  await expect(costs.getByRole('button', { name: 'Move Autumn trip' })).toHaveCount(0);
  await expect(costs.getByTestId('planned-cost-celebrations')).toContainText('December · every year · €300.00');

  await costs.getByRole('button', { name: 'Move December celebrations', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('New month', { exact: true }).selectOption('11');
  await dialog.getByLabel('First year', { exact: true }).selectOption('2027');
  await expect(dialog.getByTestId('planned-cost-move-summary')).toHaveText('From 2027, December celebrations is planned in November instead of December.');
  await expect(dialog.getByText('2026 and earlier keep their month and linked expenses.', { exact: false })).toBeVisible();
  await expect(dialog.getByTestId('planned-cost-move-review')).toContainText('1 linked expense stays on the old month and will need review in Expected costs:');
  await expect(dialog.getByTestId('planned-cost-move-review')).toContainText('Early booking · €80.00 · linked to Dec 2027');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Move from 2027', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const original = ledgerWithPlannedCosts();
  const saved = await savedLedger(page);
  expect(saved.events).toEqual([{ ...original.events[0], monthFromYear: { 2027: 11 } }, original.events[1]]);
  expect(saved.transactions).toEqual(original.transactions);
  expect(saved.plans).toEqual(original.plans);
  await expect(costs.getByTestId('planned-cost-celebrations')).toContainText('December · every year · €300.00');
});

test('the moved year lists the planned cost in its new month', async ({ page }) => {
  const ledger = ledgerWithPlannedCosts();
  ledger.events[0].monthFromYear = { 2027: 11 };
  await openYearAhead(page, ledger);
  await page.getByRole('button', { name: 'Choose month', exact: true }).click();
  await page.getByRole('button', { name: 'Next year', exact: true }).click();
  await page.getByRole('button', { name: 'Jan', exact: true }).click();

  const costs = page.getByTestId('planned-costs');
  await expect(costs).toContainText('In 2027.');
  await expect(costs.getByTestId('planned-cost-celebrations')).toContainText('November · every year · moved from December · €300.00');
  await expect(costs.getByTestId('planned-cost-trip')).toHaveCount(0);
});

test('a move starts this year at the earliest, and repeating the current month changes nothing', async ({ page }) => {
  const costs = await openYearAhead(page, ledgerWithPlannedCosts());
  await costs.getByRole('button', { name: 'Move December celebrations', exact: true }).click();
  const dialog = page.getByRole('dialog');

  const firstYears = await dialog.getByLabel('First year', { exact: true }).locator('option').allTextContents();
  expect(firstYears).toEqual(['2026', '2027', '2028', '2029', '2030', '2031']);
  await expect(dialog.getByTestId('planned-cost-move-summary')).toHaveText('December celebrations is already in December from 2026.');
  await expect(dialog.getByRole('button', { name: 'Move from 2026', exact: true })).toBeDisabled();
});

test('closing the move after choosing a new month asks before discarding and changes nothing', async ({ page }) => {
  const costs = await openYearAhead(page, ledgerWithPlannedCosts());
  const before = await savedLedger(page);
  await costs.getByRole('button', { name: 'Move December celebrations', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('New month', { exact: true }).selectOption('11');

  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog.getByText('Discard your changes?', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();

  await expect(dialog).toHaveCount(0);
  expect(await savedLedger(page)).toEqual(before);
});

test('the planning interview lists a moved planned cost in its month for the draft year', async ({ page }) => {
  const ledger = ledgerWithPlannedCosts();
  ledger.events[0].monthFromYear = { 2027: 11 };
  await openYearAhead(page, ledger);
  await page.getByRole('button', { name: 'Choose month', exact: true }).click();
  await page.getByRole('button', { name: 'Next year', exact: true }).click();
  await page.getByRole('button', { name: 'Jan', exact: true }).click();
  await page.getByRole('button', { name: 'Plan This month', exact: true }).click();
  await page.getByRole('button', { name: 'Build a plan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(dialog.getByText('December celebrations · month 11 · every year', { exact: true })).toBeVisible();
});
