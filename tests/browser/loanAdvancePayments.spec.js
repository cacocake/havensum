import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState } from '../helpers/financialFixtures.js';
import { editTransaction, openMoreSection, returnHome } from '../helpers/userFlows.js';
import { buildPlan } from '../../src/planning.js';

const k_ledgerKey = 'melo-state-v1';
const k_carLoan = { id: 'car', name: 'Car loan', account: 'everyday', start: '2026-01', end: '2029-12', payment: 18500, paymentChanges: [], remaining: 400000, original: 500000 };

function ledgerWithPlan(loan = k_carLoan) {
  const ledger = createFinancialState({ loans: [loan] });
  const plan = buildPlan(ledger, { year: 2026, fromMonth: 1, income: 200000, cushion: 10000, today: '2026-01-02' });
  ledger.plans = { 2026: [{ ...plan, id: 'plan-2026', createdAt: '2026-01-02T09:00:00.000Z' }] };
  return ledger;
}

async function openLoans(page, ledger) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ key, seededLedger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(seededLedger));
    }
  }, { key: k_ledgerKey, seededLedger: ledger });
  await page.goto('/');
  await openMoreSection(page, 'Loans');
}

async function recordAdvance(page, amount) {
  await page.getByRole('button', { name: 'Record advance payment', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Advance payment · EUR', { exact: true }).fill(amount);
  await dialog.getByRole('button', { name: 'Record advance payment', exact: true }).click();
  return dialog;
}

function savedLedger(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), k_ledgerKey);
}

test('an advance payment is recorded on the loan, lowers the remaining balance, and asks about the monthly payment (P14)', async ({ page }) => {
  const ledger = ledgerWithPlan();
  await openLoans(page, ledger);
  const dialog = await recordAdvance(page, '1500');

  await expect(dialog.getByText('Car loan · remaining balance now €2,500.00', { exact: true })).toBeVisible();
  const saved = await savedLedger(page);
  expect(saved.loans[0].remaining).toBe(250000);
  expect(saved.transactions).toEqual([expect.objectContaining({ type: 'expense', title: 'Car loan · advance payment', amount: 150000, date: '2026-11-19', account: 'everyday', category: 'loan', loanId: 'car', loanAdvance: true })]);
  expect(JSON.stringify(saved.plans)).toBe(JSON.stringify(ledger.plans));

  await dialog.getByRole('button', { name: 'No, it stays €185.00', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await savedLedger(page)).loans[0].paymentChanges).toEqual([]);
});

test('after an advance, a new monthly payment is entered on the loan and then offers the plan revision', async ({ page }) => {
  await openLoans(page, ledgerWithPlan());
  const dialog = await recordAdvance(page, '1500');
  await dialog.getByRole('button', { name: 'Yes, enter the new payment', exact: true }).click();

  await expect(dialog.getByLabel('New monthly payment · EUR', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Remaining balance · EUR', { exact: true })).toHaveValue('2500');
  await dialog.getByLabel('New monthly payment · EUR', { exact: true }).fill('120');
  await dialog.getByLabel('New payment from · YYYY-MM', { exact: true }).fill('2026-12');
  await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Revise from December 2026', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep my plan', exact: true }).click();

  const savedLoan = (await savedLedger(page)).loans[0];
  expect([savedLoan.remaining, savedLoan.paymentChanges]).toEqual([250000, [{ since: '2026-12', amount: 12000 }]]);
});

test('an empty advance is refused and nothing is saved', async ({ page }) => {
  const ledger = ledgerWithPlan();
  await openLoans(page, ledger);
  const dialog = await recordAdvance(page, '');

  await expect(dialog.getByText('Use a positive amount with at most two decimal places.', { exact: true })).toBeVisible();
  const saved = await savedLedger(page);
  expect([saved.loans, saved.transactions]).toEqual([ledger.loans, []]);
});

test('a one-off extra payment is only a recorded payment: no plan prompt, history unchanged', async ({ page }) => {
  const ledger = ledgerWithPlan();
  await openLoans(page, ledger);
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount · EUR', { exact: true }).fill('235');
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const saved = await savedLedger(page);
  expect(saved.loans).toEqual(ledger.loans);
  expect(JSON.stringify(saved.plans)).toBe(JSON.stringify(ledger.plans));
  expect(saved.transactions).toEqual([expect.objectContaining({ amount: 23500, category: 'loan', loanId: 'car' })]);
  expect(saved.transactions[0].loanAdvance).toBeUndefined();
});

test('the advance dialogs fit a narrow screen with a long loan name', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openLoans(page, ledgerWithPlan({ ...k_carLoan, name: 'A very long family car loan name from the countryside dealership' }));
  const dialog = await recordAdvance(page, '1234567.89');

  await expect(dialog.getByRole('button', { name: 'Yes, enter the new payment', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('editing an advance keeps its mark, and turning it into something else drops the mark', async ({ page }) => {
  await openLoans(page, ledgerWithPlan());
  const advanceDialog = await recordAdvance(page, '1500');
  await advanceDialog.getByRole('button', { name: 'No, it stays €185.00', exact: true }).click();
  await returnHome(page);

  let dialog = await editTransaction(page, 'Car loan · advance payment');
  await dialog.getByLabel('Amount · EUR', { exact: true }).fill('1600');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await savedLedger(page)).transactions[0]).toMatchObject({ amount: 160000, loanAdvance: true });

  dialog = await editTransaction(page, 'Car loan · advance payment');
  await dialog.getByRole('button', { name: 'Income', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await savedLedger(page)).transactions[0].loanAdvance).toBeUndefined();
});

test('an advance that pays the loan off leaves a €0 balance that the loan form can still save with a new payment (P26)', async ({ page }) => {
  await openLoans(page, ledgerWithPlan());
  const dialog = await recordAdvance(page, '4000');
  await expect(dialog.getByText('Car loan · remaining balance now €0.00', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Yes, enter the new payment', exact: true }).click();
  await dialog.getByLabel('New monthly payment · EUR', { exact: true }).fill('0');
  await dialog.getByLabel('New payment from · YYYY-MM', { exact: true }).fill('2026-12');
  await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();
  await dialog.getByRole('button', { name: 'Keep my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const savedLoan = (await savedLedger(page)).loans[0];
  expect([savedLoan.remaining, savedLoan.paymentChanges]).toEqual([0, [{ since: '2026-12', amount: 0 }]]);
});

test('an advance amount needs at most two decimals, and an empty date is refused', async ({ page }) => {
  const ledger = ledgerWithPlan();
  await openLoans(page, ledger);
  const dialog = await recordAdvance(page, '12.345');
  await expect(dialog.getByText('Use a positive amount with at most two decimal places.', { exact: true })).toBeVisible();

  await dialog.getByLabel('Advance payment · EUR', { exact: true }).fill('12.34');
  await dialog.getByLabel('Date', { exact: true }).fill('');
  await dialog.getByRole('button', { name: 'Record advance payment', exact: true }).click();
  await expect(dialog.getByText('Choose a valid date.', { exact: true })).toBeVisible();
  const saved = await savedLedger(page);
  expect([saved.loans, saved.transactions]).toEqual([ledger.loans, []]);
});

test('a paid-off €0 balance must be typed: a cleared or negative balance is refused, and a new loan still needs a balance (P26)', async ({ page }) => {
  const ledger = ledgerWithPlan();
  await openLoans(page, ledger);
  await page.getByRole('button', { name: 'Edit Car loan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const balance of ['', '-5', '1e3']) {
    await dialog.getByLabel('Remaining balance · EUR', { exact: true }).fill(balance);
    await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();
    await expect(dialog.getByText('Enter a name, a remaining balance (zero or more for an existing loan), a positive payment and a valid month range (YYYY-MM).', { exact: true })).toBeVisible();
  }
  expect((await savedLedger(page)).loans).toEqual(ledger.loans);
  await dialog.getByLabel('Remaining balance · EUR', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await savedLedger(page)).loans[0].remaining).toBe(0);

  await page.getByRole('button', { name: 'Add loan', exact: true }).click();
  await dialog.getByLabel('Loan name', { exact: true }).fill('Bike');
  await dialog.getByLabel('Remaining balance · EUR', { exact: true }).fill('0');
  await dialog.getByLabel('Monthly payment · EUR', { exact: true }).fill('50');
  await dialog.getByRole('button', { name: 'Add loan', exact: true }).click();
  await expect(dialog.getByText(/^Enter a name, a remaining balance/)).toBeVisible();
});
