import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState } from '../helpers/financialFixtures.js';
import { openMoreSection, returnHome } from '../helpers/userFlows.js';
import { buildPlan } from '../../src/planning.js';

const k_ledgerKey = 'melo-state-v1';
const k_clockStart = '2026-11-19T12:00:00';
const k_carLoan = { id: 'car', name: 'Car loan', account: 'everyday', start: '2026-01', end: '2029-12', payment: 18500, paymentChanges: [], remaining: 400000, original: 500000 };

function ledgerWithPlan(loan = k_carLoan) {
  const ledger = createFinancialState({ loans: [loan] });
  const plan = buildPlan(ledger, { year: 2026, fromMonth: 1, income: 200000, cushion: 10000, today: '2026-01-02' });
  ledger.plans = { 2026: [{ ...plan, id: 'plan-2026', createdAt: '2026-01-02T09:00:00.000Z' }] };
  return ledger;
}

async function openLoans(page, ledger) {
  await page.clock.install({ time: new Date(k_clockStart) });
  await page.addInitScript(({ key, seededLedger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(seededLedger));
    }
  }, { key: k_ledgerKey, seededLedger: ledger });
  await page.goto('/');
  await openMoreSection(page, 'Loans');
}

async function changeCarPayment(page, amount, from) {
  await page.getByRole('button', { name: 'Edit Car loan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Change the monthly payment', exact: true }).click();
  await dialog.getByLabel('New monthly payment · EUR', { exact: true }).fill(amount);
  await dialog.getByLabel('New payment from · YYYY-MM', { exact: true }).fill(from);
  await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();
  return dialog;
}

function savedLedger(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), k_ledgerKey);
}

test('Keep my plan after a payment change leaves every plan snapshot identical', async ({ page }) => {
  const ledger = ledgerWithPlan();
  await openLoans(page, ledger);
  const prompt = await changeCarPayment(page, '160', '2026-12');

  await expect(prompt.getByText('Your 2026 plan still uses the earlier Car loan payment.', { exact: true })).toBeVisible();
  await prompt.getByRole('button', { name: 'Keep my plan', exact: true }).click();
  await expect(prompt).toHaveCount(0);

  const saved = await savedLedger(page);
  expect(saved.loans[0].paymentChanges).toEqual([{ since: '2026-12', amount: 16000 }]);
  expect(JSON.stringify(saved.plans)).toBe(JSON.stringify(ledger.plans));
});

test('Revise from a passed month freezes a revision that restates only the passed loan lines and keeps the earlier revision', async ({ page }) => {
  const ledger = ledgerWithPlan();
  await openLoans(page, ledger);
  const dialog = await changeCarPayment(page, '160', '2026-03');

  await dialog.getByRole('button', { name: 'Revise from March 2026', exact: true }).click();
  await expect(dialog.getByText('Step 1 of 3 · 2026 · Only November–December will change, plus loan payments from March 2026.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByText('Car loan · €160.00/month from November', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByText('Passed months from March 2026 get the new loan payment only; everything else in them stays as frozen.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const [earlier, latest] = (await savedLedger(page)).plans['2026'];
  expect(earlier).toEqual(ledger.plans['2026'][0]);
  expect(latest.months['2026-02']).toEqual(earlier.months['2026-02']);
  expect([latest.months['2026-03'].loan, latest.months['2026-03'].expense]).toEqual([16000, earlier.months['2026-03'].expense - 2500]);
  const outsideLoanLine = plannedMonth => ({ ...plannedMonth, loan: 0, loanPayments: {}, expense: 0, balance: 0 });
  expect(outsideLoanLine(latest.months['2026-03'])).toEqual(outsideLoanLine(earlier.months['2026-03']));
  expect([latest.months['2026-11'].loan, latest.loanRestatedFrom]).toEqual([16000, '2026-03']);
  await returnHome(page);
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await expect(page.getByText('This revision restated loan payments from March 2026, including passed months; earlier revisions keep their figures.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show plan revision 1', exact: true }).click();
  await expect(page.getByTestId('loan-restated-note')).toHaveCount(0);
});

test('a balance-only edit or a loan without a plan for that year offers no revision', async ({ page }) => {
  await openLoans(page, ledgerWithPlan());
  await page.getByRole('button', { name: 'Edit Car loan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Remaining balance · EUR', { exact: true }).fill('3000');
  await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const prompt = await changeCarPayment(page, '150', '2027-02');
  await expect(prompt).toHaveCount(0);
  expect((await savedLedger(page)).loans[0].paymentChanges).toEqual([{ since: '2027-02', amount: 15000 }]);
});

test('the revision prompt fits a narrow screen with a long loan name', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const longName = 'A very long family car loan name from the countryside dealership';
  await openLoans(page, ledgerWithPlan({ ...k_carLoan, name: longName }));
  await page.getByRole('button', { name: `Edit ${longName}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Change the monthly payment', exact: true }).click();
  await dialog.getByLabel('New monthly payment · EUR', { exact: true }).fill('1234567.89');
  await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();

  await expect(dialog.getByRole('button', { name: 'Revise from November 2026', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('when the month rolls over while revising, the passed month is restated after one refresh, and the save then succeeds', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-30T12:00:00') });
  const ledger = ledgerWithPlan();
  await page.addInitScript(({ key, seededLedger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(seededLedger));
    }
  }, { key: k_ledgerKey, seededLedger: ledger });
  await page.goto('/');
  await openMoreSection(page, 'Loans');
  const dialog = await changeCarPayment(page, '160', '2026-11');
  await dialog.getByRole('button', { name: 'Revise from November 2026', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.clock.setSystemTime(new Date('2026-12-01T09:00:00'));

  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog.getByText('Passed months from November 2026 get the new loan payment only; everything else in them stays as frozen.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const latest = (await savedLedger(page)).plans['2026'].at(-1);
  expect([latest.loanRestatedFrom, latest.months['2026-11'].loan, latest.months['2026-12'].loan]).toEqual(['2026-11', 16000, 16000]);
});
