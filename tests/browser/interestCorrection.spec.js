import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';

const k_ledgerKey = 'melo-state-v1';
const k_accountName = 'Rainy day reserve with a deliberately long name';

// €1,000 at a 12% effective annual rate from September 2026: on 19 November
// the app has posted €9.49 for September and €9.58 for October.
function savingsLedger(transactions = []) {
  return createFinancialState({
    accounts: [{ id: 'reserve', name: k_accountName, tag: 'Savings', openingBalance: 100000, interestSchedule: [{ since: '2026-09', rate: 12 }] }],
    transactions
  });
}

function appInterest(month, date, amount) {
  return createTransaction({ id: `interest-reserve-${month}`, type: 'income', title: 'Savings interest', category: 'interest', account: 'reserve', date, amount, kind: 'Fixed' });
}

async function openLedger(page, ledger) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');
}

async function openAccount(page) {
  await openMoreSection(page, 'Accounts');
  await page.getByLabel(`View ${k_accountName}`).first().click();
}

async function openCorrection(page, buttonName) {
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  return page.getByRole('dialog');
}

function savedLedger(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), k_ledgerKey);
}

function interestEntries(ledger) {
  return ledger.transactions.filter(transaction => transaction.category === 'interest').map(({ id, amount }) => ({ id, amount }));
}

async function expectNoPageOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('a corrected past rate is reviewed month by month and applied once as marked corrections', async ({ page }) => {
  await openLedger(page, savingsLedger());
  await openAccount(page);
  await expect(page.getByTestId('past-interest-summary')).toHaveText('Recorded interest matches the balances and rates.');
  const dialog = await openCorrection(page, 'Correct past interest');
  await expect(dialog.getByTestId('interest-correction-empty')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Apply corrections', exact: true })).toBeDisabled();

  await dialog.getByLabel('Corrected rate · %', { exact: true }).fill('6');
  await dialog.getByLabel('From month · YYYY-MM', { exact: true }).fill('2026-09');
  await dialog.getByRole('button', { name: 'Set rate from this month', exact: true }).click();
  await expect(dialog.getByText('6% from Sep 2026, ongoing', { exact: true })).toBeVisible();
  await expect(dialog.getByTestId('interest-correction-2026-09-difference')).toHaveText('−€4.62');
  await expect(dialog.getByTestId('interest-correction-2026-10-difference')).toHaveText('−€4.69');
  await expect(dialog.getByTestId('interest-correction-total')).toHaveText('−€9.31');
  await expectNoPageOverflow(page);
  const monthsBox = await dialog.getByTestId('interest-correction-months').boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(monthsBox.x + monthsBox.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1);
  await dialog.getByRole('button', { name: 'Apply corrections', exact: true }).click();

  await expect.poll(async () => interestEntries(await savedLedger(page))).toEqual([
    { id: 'interest-reserve-2026-09', amount: 949 },
    { id: 'interest-reserve-2026-10', amount: 958 },
    { id: 'interest-correction-reserve-2026-09-1', amount: -462 },
    { id: 'interest-correction-reserve-2026-10-1', amount: -469 }
  ]);
  expect((await savedLedger(page)).accounts[0].interestSchedule).toEqual([{ since: '2026-09', rate: 6 }]);
  await expect(page.getByTestId('past-interest-summary')).toHaveText('Recorded interest matches the balances and rates.');
  await expect(page.getByTestId('account-balance-today')).toHaveText('€1,009.76');

  await page.getByLabel('View Interest correction').first().click();
  await expect(page.getByRole('dialog').getByTestId('interest-correction-note')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Edit transaction', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  await page.reload();
  await openAccount(page);
  const repeated = await openCorrection(page, 'Correct past interest');
  await expect(repeated.getByTestId('interest-correction-empty')).toBeVisible();
  await expect(repeated.getByRole('button', { name: 'Apply corrections', exact: true })).toBeDisabled();
  expect(interestEntries(await savedLedger(page))).toHaveLength(4);
});

test('cancelling a correction draft leaves the ledger and rates untouched', async ({ page }) => {
  await openLedger(page, savingsLedger());
  await openAccount(page);
  const before = await savedLedger(page);
  const dialog = await openCorrection(page, 'Correct past interest');
  await dialog.getByRole('button', { name: 'Remove the rate from Sep 2026', exact: true }).click();
  await expect(dialog.getByTestId('interest-correction-total')).toHaveText('−€19.07');

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await savedLedger(page)).toEqual(before);
});

test('a backdated deposit shows the interest its months missed until the correction is applied', async ({ page }) => {
  await openLedger(page, savingsLedger([
    appInterest('2026-09', '2026-09-30', 949),
    appInterest('2026-10', '2026-10-31', 958),
    createTransaction({ id: 'missed-deposit', type: 'income', title: 'Missed deposit', category: 'salary', account: 'reserve', date: '2026-09-15', amount: 100000 })
  ]));
  await openAccount(page);
  await expect(page.getByTestId('past-interest-summary')).toHaveText('2 completed months differ from the balances and rates · +€19.07');

  const dialog = await openCorrection(page, 'Review past interest');
  await expect(dialog.getByTestId('interest-correction-2026-09-difference')).toHaveText('+€9.49');
  await expect(dialog.getByTestId('interest-correction-2026-10-difference')).toHaveText('+€9.58');
  await dialog.getByRole('button', { name: 'Apply corrections', exact: true }).click();

  await expect(page.getByTestId('past-interest-summary')).toHaveText('Recorded interest matches the balances and rates.');
  expect(interestEntries(await savedLedger(page)).slice(2)).toEqual([
    { id: 'interest-correction-reserve-2026-09-1', amount: 949 },
    { id: 'interest-correction-reserve-2026-10-1', amount: 958 }
  ]);
});

test('bank interest for a month the app also posted waits for a per-month choice', async ({ page }) => {
  await openLedger(page, savingsLedger([
    appInterest('2026-09', '2026-09-30', 949),
    appInterest('2026-10', '2026-10-31', 958),
    createTransaction({ id: 'bank-interest-sep', type: 'income', title: 'Interest from bank', category: 'interest', account: 'reserve', date: '2026-09-30', amount: 949 })
  ]));
  await openAccount(page);
  await expect(page.getByTestId('past-interest-summary')).toContainText('1 month needs a bank-interest choice');
  const dialog = await openCorrection(page, 'Review past interest');
  await expect(dialog.getByRole('button', { name: 'Apply corrections', exact: true })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Bank amount only for Sep 2026', exact: true }).click();
  await expect(dialog.getByTestId('interest-correction-2026-09-difference')).toHaveText('−€9.49');
  await dialog.getByRole('button', { name: 'Apply corrections', exact: true }).click();

  await expect.poll(async () => (await savedLedger(page)).accounts[0].interestBankChoices).toEqual([{ month: '2026-09', choice: 'bank' }]);
  await page.reload();
  await openAccount(page);
  await expect(page.getByTestId('past-interest-summary')).toHaveText('Recorded interest matches the balances and rates.');
  expect(interestEntries(await savedLedger(page))).toEqual([
    { id: 'interest-reserve-2026-09', amount: 949 },
    { id: 'interest-reserve-2026-10', amount: 958 },
    { id: 'bank-interest-sep', amount: 949 },
    { id: 'interest-correction-reserve-2026-09-1', amount: -949 }
  ]);
  await expectNoPageOverflow(page);
});

test('a corrected rate typed but not yet set blocks Apply and asks before discarding', async ({ page }) => {
  await openLedger(page, savingsLedger([
    appInterest('2026-09', '2026-09-30', 949),
    appInterest('2026-10', '2026-10-31', 958),
    createTransaction({ id: 'missed-deposit', type: 'income', title: 'Missed deposit', category: 'salary', account: 'reserve', date: '2026-09-15', amount: 100000 })
  ]));
  await openAccount(page);
  const before = await savedLedger(page);
  const dialog = await openCorrection(page, 'Review past interest');
  await expect(dialog.getByRole('button', { name: 'Apply corrections', exact: true })).toBeEnabled();

  await dialog.getByLabel('Corrected rate · %', { exact: true }).fill('6');
  await expect(dialog.getByRole('button', { name: 'Apply corrections', exact: true })).toBeDisabled();
  await expect(dialog.getByTestId('interest-correction-unset-rate')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  expect(await savedLedger(page)).toEqual(before);
});
