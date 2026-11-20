import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState } from '../helpers/financialFixtures.js';
import { openMoreSection, returnHome } from '../helpers/userFlows.js';
import { buildPlan } from '../../src/planning.js';

const k_ledgerKey = 'melo-state-v1';
const k_versionBeforeHistory = 4;
const k_clockStart = '2026-11-19T12:00:00';
const k_carLoan = { id: 'car', name: 'Car loan', account: 'everyday', start: '2026-01', end: '2029-12', payment: 18500, remaining: 400000, original: 500000 };

// A 2026 plan approved on 2 January that stored its own change: €150 from October.
function ledgerWithApprovedPlan(loan) {
  const ledger = createFinancialState({ loans: [loan] });
  const plan = buildPlan(ledger, {
    year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02',
    loanChanges: [{ loanId: 'car', since: '2026-10', amount: 15000 }]
  });
  ledger.plans = { 2026: [{ ...plan, id: 'plan-2026', createdAt: '2026-01-02T09:00:00.000Z' }] };
  return ledger;
}

async function openApp(page, ledger) {
  await page.clock.install({ time: new Date(k_clockStart) });
  await page.addInitScript(({ key, seededLedger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(seededLedger));
    }
  }, { key: k_ledgerKey, seededLedger: ledger });
  await page.goto('/');
  await openMoreSection(page, 'Loans');
}

async function openLoanForm(page, loanName = 'Car loan') {
  await page.getByRole('button', { name: `Edit ${loanName}`, exact: true }).click();
  return page.getByRole('dialog');
}

async function changeMonthlyPayment(dialog, amount) {
  await dialog.getByRole('button', { name: 'Change the monthly payment', exact: true }).click();
  await dialog.getByLabel('New monthly payment · EUR', { exact: true }).fill(amount);
}

async function saveLoanForm(dialog) {
  await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

function savedLedger(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), k_ledgerKey);
}

async function openNextYearLoanStep(page) {
  await returnHome(page);
  await page.getByRole('button', { name: 'Choose month', exact: true }).click();
  await page.getByRole('button', { name: 'Next year', exact: true }).click();
  await page.getByRole('button', { name: 'Jan', exact: true }).click();
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Build a plan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  return dialog;
}

test('a payment lowered from a future month is kept in the history and the card shows this month\'s payment', async ({ page }) => {
  await openApp(page, ledgerWithApprovedPlan({ ...k_carLoan, paymentChanges: [] }));
  const dialog = await openLoanForm(page);
  await expect(dialog.getByText('Monthly payment this month · €185.00', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('New payment from · YYYY-MM', { exact: true })).toHaveCount(0);

  await changeMonthlyPayment(dialog, '160');
  await expect(dialog.getByLabel('New payment from · YYYY-MM', { exact: true })).toHaveValue('2026-11');
  await dialog.getByLabel('New payment from · YYYY-MM', { exact: true }).fill('2027-03');
  await saveLoanForm(dialog);

  const saved = await savedLedger(page);
  expect([saved.loans[0].payment, saved.loans[0].paymentChanges]).toEqual([18500, [{ since: '2027-03', amount: 16000 }]]);
  expect(saved.loans[0].paymentEditedAt).toBeUndefined();
  await expect(page.getByText('Payment history · €185.00 from January 2026 · €160.00 from March 2027', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Amount · EUR', { exact: true })).toHaveValue('185');
});

test('a past month entered late replaces a later scheduled change, and a mistaken entry can be removed', async ({ page }) => {
  await openApp(page, ledgerWithApprovedPlan({ ...k_carLoan, paymentChanges: [{ since: '2026-06', amount: 17000 }, { since: '2027-03', amount: 16000 }] }));
  let dialog = await openLoanForm(page);
  await expect(dialog.getByText('Monthly payment this month · €170.00', { exact: true })).toBeVisible();
  await changeMonthlyPayment(dialog, '195');
  await dialog.getByLabel('New payment from · YYYY-MM', { exact: true }).fill('2026-09');
  await saveLoanForm(dialog);
  expect((await savedLedger(page)).loans[0].paymentChanges).toEqual([{ since: '2026-06', amount: 17000 }, { since: '2026-09', amount: 19500 }]);
  await expect(page.getByText('€195.00', { exact: true })).toBeVisible();

  dialog = await openLoanForm(page);
  await dialog.getByRole('button', { name: 'Remove €170.00 from June 2026', exact: true }).click();
  await expect(dialog.getByText('€195.00 from September 2026', { exact: true })).toBeVisible();
  await saveLoanForm(dialog);
  expect((await savedLedger(page)).loans[0].paymentChanges).toEqual([{ since: '2026-09', amount: 19500 }]);
});

test('a new payment needs a valid month up to the loan\'s last month, and nothing is saved until it has one', async ({ page }) => {
  const ledger = ledgerWithApprovedPlan({ ...k_carLoan, paymentChanges: [] });
  await openApp(page, ledger);
  const dialog = await openLoanForm(page);
  await changeMonthlyPayment(dialog, '160');

  for (const invalidMonth of ['2030-01', 'next month']) {
    await dialog.getByLabel('New payment from · YYYY-MM', { exact: true }).fill(invalidMonth);
    await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();
    await expect(dialog.getByText('Choose the month the new payment applies from (YYYY-MM), up to the loan\'s last month.', { exact: true })).toBeVisible();
  }
  expect((await savedLedger(page)).loans).toEqual(ledger.loans);
});

test('the next draft follows the loan\'s history read-only, and the earlier plan stays identical', async ({ page }) => {
  const ledger = ledgerWithApprovedPlan({ ...k_carLoan, paymentChanges: [{ since: '2026-11', amount: 16000 }, { since: '2027-06', amount: 12000 }] });
  await openApp(page, ledger);

  const dialog = await openNextYearLoanStep(page);
  await expect(dialog.getByText('Car loan · €160.00/month from January', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Car loan €120.00/month from June 2027', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Loan payments come from each loan\'s payment history. To change one, edit the loan on the Loans screen.', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Car loan · new monthly payment, optional', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Remove carried Car loan/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const saved = await savedLedger(page);
  expect(['2027-01', '2027-05', '2027-06'].map(month => saved.plans['2027'][0].months[month].loan)).toEqual([16000, 16000, 12000]);
  expect(saved.plans['2026']).toEqual(ledger.plans['2026']);
});

test('a version 4 ledger opens with each loan\'s history taken from its plan, keeping the original bytes', async ({ page }) => {
  const legacyLedger = { ...ledgerWithApprovedPlan(k_carLoan), version: k_versionBeforeHistory };
  await openApp(page, legacyLedger);

  await expect(page.getByText('Payment history · €185.00 from January 2026 · €150.00 from October 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('€150.00', { exact: true })).toBeVisible();
  const saved = await savedLedger(page);
  expect([saved.version, saved.loans[0].paymentChanges]).toEqual([5, [{ since: '2026-10', amount: 15000 }]]);
  expect(saved.plans['2026']).toEqual(legacyLedger.plans['2026']);
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(`${key}:recovery:v4`), k_ledgerKey))).toEqual(legacyLedger);
});

test('a long loan name and a long history fit the loan form and card at a narrow width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const longName = 'A very long family car loan name from the countryside dealership';
  const changes = [{ since: '2026-03', amount: 12345678 }, { since: '2026-09', amount: 98765432 }, { since: '2027-06', amount: 1 }];
  await openApp(page, ledgerWithApprovedPlan({ ...k_carLoan, name: longName, paymentChanges: changes }));

  await expect(page.getByText(/^Payment history · /)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const dialog = await openLoanForm(page, longName);
  await changeMonthlyPayment(dialog, '1234567.89');
  await expect(dialog.getByRole('button', { name: 'Remove €987,654.32 from September 2026', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('New payment from · YYYY-MM', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a temporary payment until a chosen month returns to the earlier payment afterwards', async ({ page }) => {
  await openApp(page, ledgerWithApprovedPlan({ ...k_carLoan, paymentChanges: [{ since: '2027-09', amount: 17000 }] }));
  const dialog = await openLoanForm(page);
  await changeMonthlyPayment(dialog, '90');
  await dialog.getByLabel('New payment from · YYYY-MM', { exact: true }).fill('2027-01');
  await expect(dialog.getByLabel('Until · YYYY-MM', { exact: true })).toHaveCount(0);
  await dialog.getByRole('switch', { name: 'Until a chosen month', exact: true }).click();
  await expect(dialog.getByLabel('Until · YYYY-MM', { exact: true })).toHaveValue('2027-01');
  await dialog.getByLabel('Until · YYYY-MM', { exact: true }).fill('2026-12');
  await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();
  await expect(dialog.getByText('Choose the last month of the temporary payment (YYYY-MM), from its first month on.', { exact: true })).toBeVisible();
  await dialog.getByLabel('Until · YYYY-MM', { exact: true }).fill('2027-05');
  await saveLoanForm(dialog);

  expect((await savedLedger(page)).loans[0].paymentChanges).toEqual([{ since: '2027-01', until: '2027-05', amount: 9000 }, { since: '2027-09', amount: 17000 }]);
  await expect(page.getByText('Payment history · €185.00 from January 2026 · €90.00 from January 2027 until May 2027 · €170.00 from September 2027', { exact: true })).toBeVisible();
});

test('a payment pause of zero can be entered, but an emptied payment is refused', async ({ page }) => {
  await openApp(page, ledgerWithApprovedPlan({ ...k_carLoan, paymentChanges: [] }));
  const dialog = await openLoanForm(page);
  await changeMonthlyPayment(dialog, '');
  await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();
  await expect(dialog.getByText('Enter the new monthly payment: zero or more.', { exact: true })).toBeVisible();

  await dialog.getByLabel('New monthly payment · EUR', { exact: true }).fill('0');
  await dialog.getByLabel('New payment from · YYYY-MM', { exact: true }).fill('2027-02');
  await dialog.getByRole('switch', { name: 'Until a chosen month', exact: true }).click();
  await dialog.getByLabel('Until · YYYY-MM', { exact: true }).fill('2027-02');
  await saveLoanForm(dialog);
  await expect(page.getByText('Payment history · €185.00 from January 2026 · €0.00 in February 2027 only', { exact: true })).toBeVisible();
});

test('moving the start month later folds the changes it passes into the starting payment', async ({ page }) => {
  await openApp(page, ledgerWithApprovedPlan({ ...k_carLoan, paymentChanges: [{ since: '2026-06', amount: 15000 }, { since: '2027-02', amount: 14000 }] }));
  const dialog = await openLoanForm(page);
  await dialog.getByLabel('Start month · YYYY-MM', { exact: true }).fill('2026-09');
  await saveLoanForm(dialog);

  const savedLoan = (await savedLedger(page)).loans[0];
  expect([savedLoan.start, savedLoan.payment, savedLoan.paymentChanges]).toEqual(['2026-09', 15000, [{ since: '2027-02', amount: 14000 }]]);
});

test('a future payment equal to this month\'s amount can be scheduled, and cancelling the change keeps the payment', async ({ page }) => {
  await openApp(page, ledgerWithApprovedPlan({ ...k_carLoan, paymentChanges: [{ since: '2027-01', amount: 16000 }] }));
  let dialog = await openLoanForm(page);
  await changeMonthlyPayment(dialog, '200');
  await dialog.getByRole('button', { name: 'Keep the payment as it is', exact: true }).click();
  await expect(dialog.getByLabel('New monthly payment · EUR', { exact: true })).toHaveCount(0);
  await saveLoanForm(dialog);
  expect((await savedLedger(page)).loans[0].paymentChanges).toEqual([{ since: '2027-01', amount: 16000 }]);

  dialog = await openLoanForm(page);
  await changeMonthlyPayment(dialog, '185');
  await dialog.getByLabel('New payment from · YYYY-MM', { exact: true }).fill('2027-07');
  await saveLoanForm(dialog);
  expect((await savedLedger(page)).loans[0].paymentChanges).toEqual([{ since: '2027-01', amount: 16000 }, { since: '2027-07', amount: 18500 }]);
});

test('an entry saved before the loan\'s start month is shown from the start and can be removed', async ({ page }) => {
  await openApp(page, ledgerWithApprovedPlan({ ...k_carLoan, start: '2027-03', paymentChanges: [{ since: '2027-02', until: '2027-06', amount: 50000 }] }));
  const dialog = await openLoanForm(page);
  await dialog.getByRole('button', { name: 'Remove €500.00 from March 2027 until June 2027', exact: true }).click();
  await saveLoanForm(dialog);

  expect((await savedLedger(page)).loans[0].paymentChanges).toEqual([]);
});

test('a lasting payment from before the loan\'s start is refused, so a mistyped year cannot erase the history', async ({ page }) => {
  const ledger = ledgerWithApprovedPlan({ ...k_carLoan, paymentChanges: [{ since: '2026-06', amount: 17000 }] });
  await openApp(page, ledger);
  const dialog = await openLoanForm(page);
  await changeMonthlyPayment(dialog, '160');
  await dialog.getByLabel('New payment from · YYYY-MM', { exact: true }).fill('2025-11');
  await dialog.getByRole('button', { name: 'Save loan', exact: true }).click();

  await expect(dialog.getByText('A new payment starts in the loan\'s start month or later.', { exact: true })).toBeVisible();
  expect((await savedLedger(page)).loans).toEqual(ledger.loans);
});

test('the payment shown follows the start month being edited, before saving', async ({ page }) => {
  await openApp(page, ledgerWithApprovedPlan({ ...k_carLoan, paymentChanges: [{ since: '2026-06', amount: 17000 }, { since: '2026-12', amount: 16000 }] }));
  const dialog = await openLoanForm(page);
  await expect(dialog.getByText('€170.00 from June 2026', { exact: true })).toBeVisible();
  await dialog.getByLabel('Start month · YYYY-MM', { exact: true }).fill('2026-08');

  await expect(dialog.getByText('€170.00 from August 2026', { exact: true })).toBeVisible();
  await expect(dialog.getByText('€170.00 from June 2026', { exact: true })).toHaveCount(0);
});

test('an entry can be removed after moving the start month in the same edit', async ({ page }) => {
  await openApp(page, ledgerWithApprovedPlan({ ...k_carLoan, paymentChanges: [{ since: '2026-02', until: '2026-06', amount: 5000 }] }));
  const dialog = await openLoanForm(page);
  await dialog.getByLabel('Start month · YYYY-MM', { exact: true }).fill('2026-03');
  await dialog.getByRole('button', { name: 'Remove €50.00 from March 2026 until June 2026', exact: true }).click();
  await expect(dialog.getByText('€50.00 from March 2026 until June 2026', { exact: true })).toHaveCount(0);
  await saveLoanForm(dialog);

  const savedLoan = (await savedLedger(page)).loans[0];
  expect([savedLoan.start, savedLoan.paymentChanges]).toEqual(['2026-03', []]);
});

test('removing an entry at a later start, then moving the start back, keeps the earlier months', async ({ page }) => {
  await openApp(page, ledgerWithApprovedPlan({ ...k_carLoan, payment: 10000, paymentChanges: [{ since: '2026-03', amount: 20000 }, { since: '2026-05', until: '2026-06', amount: 5000 }] }));
  const dialog = await openLoanForm(page);
  await dialog.getByLabel('Start month · YYYY-MM', { exact: true }).fill('2026-04');
  await dialog.getByRole('button', { name: 'Remove €50.00 from May 2026 until June 2026', exact: true }).click();
  await dialog.getByLabel('Start month · YYYY-MM', { exact: true }).fill('2026-01');
  await expect(dialog.getByText('€200.00 from March 2026', { exact: true })).toBeVisible();
  await saveLoanForm(dialog);

  const savedLoan = (await savedLedger(page)).loans[0];
  expect([savedLoan.start, savedLoan.payment, savedLoan.paymentChanges]).toEqual(['2026-01', 10000, [{ since: '2026-03', amount: 20000 }]]);
});
