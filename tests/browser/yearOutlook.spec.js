import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction, planArchiveOf } from '../helpers/financialFixtures.js';

const k_ledgerKey = 'melo-state-v1';
const k_firstQuarter = ['2027-01', '2027-02', '2027-03'];

function monthlyEntries(months, { salary = 200000, rent = 80000, rentTitle = 'Rent' } = {}) {
  return months.flatMap(month => [
    createTransaction({ id: `salary-${month}`, type: 'income', title: 'Salary', amount: salary, date: `${month}-01`, category: 'salary' }),
    createTransaction({ id: `rent-${month}`, title: rentTitle, amount: rent, date: `${month}-02`, category: 'rent' })
  ]);
}

function plannedMonthsFrom(firstMonthNumber, { income, expense, balance }) {
  const storedMonth = { income, expense, balance, cushion: 0, loan: 0, event: 0, lines: [] };
  return Object.fromEntries(Array.from({ length: 13 - firstMonthNumber }, (_, index) =>
    [`2027-${String(firstMonthNumber + index).padStart(2, '0')}`, storedMonth]));
}

function frozenPlan(months) {
  return planArchiveOf({ year: 2027, revision: 1, window: 3, tolerance: 200, drift: 0.3, incomeChanges: [], loanChanges: [], months });
}

async function openYearAhead(page, ledger) {
  await page.clock.install({ time: new Date('2027-04-10T12:00:00') });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Plan Year ahead', exact: true }).click();
}

function savedLedger(page) {
  return page.evaluate(key => localStorage.getItem(key), k_ledgerKey);
}

test('the year outlook shows recorded, expected and planned totals with what shapes them, without writing estimates', async ({ page }) => {
  const ledger = createFinancialState({
    accounts: [
      { id: 'everyday', name: 'Everyday', tag: 'Personal', openingBalance: 100000 },
      { id: 'savings', name: 'Rainy day', tag: 'Savings', openingBalance: 100000, interestSchedule: [{ since: '2027-04', rate: 12 }, { since: '2027-05', rate: 0 }] }
    ],
    outlook: { window: 3, completeMonths: k_firstQuarter, incomeChanges: [{ since: '2027-07', amount: 220000 }] },
    events: [{ id: 'trip', name: 'Summer trip', year: 2027, month: 8, amount: 120000 }],
    transactions: monthlyEntries([...k_firstQuarter, '2027-04']),
    plans: frozenPlan(plannedMonthsFrom(6, { income: 200000, expense: 90000, balance: 110000 }))
  });
  await openYearAhead(page, ledger);
  const ledgerBefore = await savedLedger(page);

  const summary = page.getByTestId('year-outlook-summary');
  await expect(summary.getByText('2027 at a glance', { exact: true })).toBeVisible();
  // Jan–Apr recorded; Apr–Jun at €2,000, Jul–Dec at €2,200 plus €9.49 April interest.
  await expect(page.getByTestId('year-recorded-income')).toHaveText('€8,000.00');
  await expect(page.getByTestId('year-expected-income')).toHaveText('€25,209.49');
  await expect(page.getByTestId('year-expected-expense')).toHaveText('€10,800.00');
  await expect(page.getByTestId('year-planned-balance')).toHaveText('+€7,700.00');
  await expect(summary.getByText('Planned · Jun–Dec', { exact: true }).first()).toBeVisible();
  // Jun–Dec expected savings: 1,200 + 1,400 + 200 + 4 × 1,400 = 8,400 against 7,700 planned.
  await expect(page.getByTestId('year-variance')).toHaveText('€700.00 above planned savings across Jun–Dec');

  const drivers = page.getByTestId('year-outlook-drivers');
  await expect(drivers.getByText('€2,200.00/month from July 2027', { exact: true })).toBeVisible();
  await expect(drivers.getByText('Summer trip · August · €1,200.00 still to pay of €1,200.00', { exact: true })).toBeVisible();
  await expect(drivers.getByText('Interest · Rainy day', { exact: true })).toBeVisible();
  await expect(drivers.getByText('€9.49 estimated from scheduled rates', { exact: true })).toBeVisible();

  await expect(page.getByTestId('year-month-2027-02-recorded')).toHaveText('+€1,200.00');
  await expect(page.getByTestId('year-month-2027-05-recorded')).toHaveText('—');
  await expect(page.getByTestId('year-month-2027-05-plan')).toHaveText('Not set');
  await expect(page.getByTestId('year-month-2027-08-expected')).toHaveText('+€200.00');
  expect(await savedLedger(page)).toBe(ledgerBefore);

  await page.getByRole('button', { name: 'View August 2027 plan', exact: true }).click();
  await expect(page.getByTestId('expected-savings-amount')).toHaveText('+€200.00');
});

test('without a frozen target the outlook has no variance and labels months without evidence', async ({ page }) => {
  const ledger = createFinancialState({ outlook: { window: 3 }, transactions: monthlyEntries(['2027-01', '2027-02']) });
  await openYearAhead(page, ledger);
  await expect(page.getByTestId('year-variance')).toHaveText('No frozen target for 2027. The forecast is shown without a variance.');
  await expect(page.getByTestId('year-planned-balance')).toHaveText('No target');
  await expect(page.getByTestId('year-unavailable-months')).toHaveText('Not enough evidence for Mar. It is left out of the expected total.');
  await expect(page.getByTestId('year-partial-months')).toHaveText('Partial estimate for Apr–Dec: history has not been confirmed complete.');
  await expect(page.getByTestId('year-month-2027-03-recorded')).toHaveText('No records');
  await expect(page.getByTestId('year-month-2027-03-expected')).toHaveText('Unavailable');
  await expect(page.getByTestId('year-month-2027-04-expected').locator('..')).toContainText('Expected · partial');
});

test('the year outlook stays within narrow screens with long names and large amounts', async ({ page }) => {
  const ledger = createFinancialState({
    outlook: { window: 3, completeMonths: k_firstQuarter },
    loans: [{ id: 'mortgage', name: 'A very long mortgage name for the family home in the countryside', account: 'everyday', payment: 9876543, remaining: 999999999, original: 999999999, start: '2027-01', end: '2040-12' }],
    events: [{ id: 'renovation', name: 'Kitchen, bathroom and garden renovation with a very long description', year: 2027, month: 9, amount: 99999999 }],
    transactions: monthlyEntries([...k_firstQuarter, '2027-04'], { salary: 99999999, rent: 8765432, rentTitle: 'Monthly rent for the apartment near the river with parking' }),
    plans: frozenPlan(plannedMonthsFrom(1, { income: 99999999, expense: 98765432, balance: 1234567 }))
  });
  await openYearAhead(page, ledger);
  const viewport = page.viewportSize();
  for (const testId of ['year-outlook-summary', 'year-outlook-drivers', 'year-month-2027-09']) {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  }
  const amountsFit = await page.locator('[data-testid^="year-"]').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth + 1));
  expect(amountsFit).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
