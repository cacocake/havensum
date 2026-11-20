import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState } from '../helpers/financialFixtures.js';
import { openMoreSection, returnHome } from '../helpers/userFlows.js';
import { buildPlan } from '../../src/planning.js';

const k_ledgerKey = 'melo-state-v1';
const k_replacedChangeNote = "Not applied: Car loan change to €150.00 from 2026-10, the loan's payment was edited since.";

// A 2026 plan approved on 2 January lowers the car payment to €150 from October.
function ledgerWithCarriedLoanChange(loanDetails = {}) {
  const ledger = createFinancialState({
    loans: [{ id: 'car', name: 'Car loan', account: 'everyday', start: '2026-01', end: '2029-12', payment: 18500, remaining: 400000, original: 500000, ...loanDetails }]
  });
  const plan = buildPlan(ledger, {
    year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02',
    loanChanges: [{ loanId: 'car', since: '2026-10', amount: 15000 }]
  });
  ledger.plans = { 2026: [{ ...plan, id: 'plan-2026', createdAt: '2026-01-02T09:00:00.000Z' }] };
  return ledger;
}

async function editCarLoan(page, fieldLabel, value) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger: ledgerWithCarriedLoanChange() });
  await page.goto('/');
  await openMoreSection(page, 'Loans');
  await page.getByRole('button', { name: 'Edit Car loan', exact: true }).click();
  const loanDialog = page.getByRole('dialog');
  await loanDialog.getByLabel(fieldLabel, { exact: true }).fill(value);
  await loanDialog.getByRole('button', { name: 'Save loan', exact: true }).click();
  await expect(loanDialog).toHaveCount(0);
  await returnHome(page);
}

async function openNextYearLoanStep(page) {
  await page.getByRole('button', { name: 'Choose month', exact: true }).click();
  await page.getByRole('button', { name: 'Next year', exact: true }).click();
  await page.getByRole('button', { name: 'Jan', exact: true }).click();
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Build a plan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  return dialog;
}

function savedLedger(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), k_ledgerKey);
}

test('a loan payment edited after the plan was approved starts the next draft', async ({ page }) => {
  await editCarLoan(page, 'Monthly payment · EUR', '160');
  const editedLoan = (await savedLedger(page)).loans[0];
  const editedSinceClockStart = Date.parse(editedLoan.paymentEditedAt) - new Date('2026-11-19T12:00:00').getTime();
  expect(editedLoan.payment).toBe(16000);
  expect(editedSinceClockStart).toBeGreaterThanOrEqual(0);
  expect(editedSinceClockStart).toBeLessThan(60000);

  const dialog = await openNextYearLoanStep(page);
  await expect(dialog.getByText('Car loan · €160.00/month from January', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Car loan · new monthly payment, optional', { exact: true })).toHaveAttribute('placeholder', '160 · unchanged');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByText(k_replacedChangeNote, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const saved = await savedLedger(page);
  expect([saved.plans['2027'][0].loanChanges, saved.plans['2027'][0].months['2027-01'].loan]).toEqual([[], 16000]);
  expect(saved.plans['2026']).toEqual(ledgerWithCarriedLoanChange().plans['2026']);
});

test('renaming a loan is not a payment edit, so the carried change still starts the draft', async ({ page }) => {
  await editCarLoan(page, 'Loan name', 'Family car');
  expect((await savedLedger(page)).loans[0].paymentEditedAt).toBeUndefined();

  const dialog = await openNextYearLoanStep(page);
  await expect(dialog.getByText('Family car · €150.00/month from January', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Family car · new monthly payment, optional', { exact: true })).toHaveAttribute('placeholder', '150 · unchanged');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Freeze my plan', exact: true })).toBeVisible();
  await expect(dialog.getByText(/payment was edited since/)).toHaveCount(0);
});

test('the replaced-change note for a long loan name stays inside the interview at narrow widths', async ({ page }) => {
  const longLoanName = 'Family electric car loan from the credit union downtown';
  const ledger = ledgerWithCarriedLoanChange({ name: longLoanName, payment: 1234567, paymentEditedAt: '2026-09-15T08:00:00.000Z' });
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');

  const dialog = await openNextYearLoanStep(page);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  const note = dialog.getByText(`Not applied: ${longLoanName} change to €150.00 from 2026-10, the loan's payment was edited since.`, { exact: true });
  await expect(note).toBeVisible();

  const noteBox = await note.boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(noteBox.x).toBeGreaterThanOrEqual(dialogBox.x);
  expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width);
  expect(await note.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
