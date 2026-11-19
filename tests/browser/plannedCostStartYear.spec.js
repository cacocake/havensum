import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { buildPlan } from '../../src/planning.js';

// Owner decision P04: a planned cost marked "Repeats every year" in a draft
// counts from the drafted plan's year onwards. Earlier years and their frozen
// plans stay as they were. All data is synthetic.
const k_ledgerKey = 'melo-state-v1';
const k_longName = 'Family ski week in the mountains with the cousins and grandparents';

function ledgerWithThisYearsPlan() {
  const ledger = createFinancialState({
    events: [{ id: 'gifts', name: 'Gifts', month: 12, amount: 30000 }],
    transactions: [
      createTransaction({ id: 'october-food', date: '2026-10-10', amount: 30000 }),
      createTransaction({ id: 'october-pay', type: 'income', category: 'salary', title: 'Salary', date: '2026-10-01', amount: 250000 })
    ],
    outlook: { completeMonths: ['2026-10'] }
  });
  const plan = buildPlan(ledger, { year: 2026, fromMonth: 1, income: 250000, cushion: 0, today: '2026-01-02' });
  ledger.plans = { 2026: [{ ...plan, id: 'plan-2026', createdAt: '2026-01-02T09:00:00.000Z' }] };
  return ledger;
}

async function openApp(page, ledger) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');
}

async function chooseMonth(page, yearButton, monthName) {
  await page.getByRole('button', { name: 'Choose month', exact: true }).click();
  if (yearButton) {
    await page.getByRole('button', { name: yearButton, exact: true }).click();
  }
  await page.getByRole('button', { name: monthName, exact: true }).click();
}

function savedLedger(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), k_ledgerKey);
}

function hasNoHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test("a cost that repeats every year from next year's draft is saved from that year and stays out of this year", async ({ page }) => {
  await openApp(page, ledgerWithThisYearsPlan());
  await chooseMonth(page, 'Next year', 'Jan');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Build a plan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

  await dialog.getByLabel('A trip, a big purchase, a seasonal cost · optional', { exact: true }).fill(k_longName);
  await dialog.getByRole('switch', { name: 'Repeats every year', exact: true }).click();
  await expect(dialog.getByText('Counts from 2027 onwards. 2026 and earlier stay as they are.', { exact: true })).toBeVisible();
  await dialog.getByLabel('Amount each year · EUR', { exact: true }).fill('900');
  await dialog.getByLabel('Month', { exact: true }).selectOption({ label: 'February' });
  await dialog.getByRole('button', { name: 'Add another event', exact: true }).click();
  await expect(dialog.getByRole('switch', { name: 'Repeats every year', exact: true })).toHaveAttribute('aria-checked', 'false');
  await expect(dialog.getByText(`${k_longName} · month 2 · every year from 2027`, { exact: true })).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const original = ledgerWithThisYearsPlan();
  const saved = await savedLedger(page);
  const ski = saved.events.find(event => event.name === k_longName);
  expect([ski.fromYear, ski.year, ski.month, ski.amount]).toEqual([2027, undefined, 2, 90000]);
  expect(saved.plans['2026']).toEqual(original.plans['2026']);
  expect(saved.plans['2027'][0].months['2027-02'].event).toBe(90000);

  await page.getByRole('button', { name: 'Plan Year ahead', exact: true }).click();
  const costs2027 = page.getByTestId('planned-costs');
  await expect(costs2027.getByTestId(`planned-cost-${ski.id}`)).toContainText('February · every year from 2027 · €900.00');
  expect(await hasNoHorizontalScroll(page)).toBe(true);

  await chooseMonth(page, 'Previous year', 'Nov');
  await expect(page.getByTestId('planned-costs').getByTestId('planned-cost-gifts')).toBeVisible();
  await expect(page.getByTestId(`planned-cost-${ski.id}`)).toHaveCount(0);
});

test("revising this year's plan after adding a cost that repeats from next year keeps it out of this year", async ({ page }) => {
  const ledger = ledgerWithThisYearsPlan();
  ledger.events.push({ id: 'ski', name: k_longName, month: 12, amount: 90000, fromYear: 2027 });
  await openApp(page, ledger);
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Revise remaining year', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(dialog.getByText('Gifts · month 12 · every year', { exact: true })).toBeVisible();
  await expect(dialog.getByText(k_longName, { exact: false })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const saved = await savedLedger(page);
  const revision = saved.plans['2026'].at(-1);
  expect(saved.plans['2026']).toHaveLength(2);
  expect(saved.plans['2026'][0]).toEqual(ledger.plans['2026'][0]);
  expect(revision.months['2026-12'].event).toBe(30000);
  expect(saved.events).toEqual(ledger.events);
});
