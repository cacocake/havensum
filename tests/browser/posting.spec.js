import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { addTransaction, openMoreSection, returnHome } from '../helpers/userFlows.js';

// Owner decision L01: an entry dated after today counts in balances and
// monthly reports from its date, by the device's local date. Until then it is
// shown as scheduled and still feeds forecasts.
const k_ledgerKey = 'melo-state-v1';

function ledgerWithConcert() {
  return createFinancialState({ transactions: [
    createTransaction({ id: 'bakery', title: 'Bakery', amount: 1000, date: '2026-11-10' }),
    createTransaction({ id: 'concert', title: 'Concert tickets', amount: 4000, date: '2026-11-20', category: 'shopping' })
  ] });
}

async function openWithLedger(page, ledger, time) {
  await page.clock.install({ time: new Date(time) });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');
  await expect(page.getByLabel('Add expense', { exact: true })).toBeVisible();
}

test('a future-dated expense leaves today\'s balance and report alone, shows as scheduled and counts from its date', async ({ page }) => {
  await openWithLedger(page, ledgerWithConcert(), '2026-11-17T12:00:00');

  await expect(page.getByLabel('View Everyday account').first()).toContainText('€990.00');
  await expect(page.getByLabel('View net spending transactions')).toContainText('€10.00');
  await expect(page.getByTestId('month-scheduled')).toHaveText('1 scheduled entry · −€40.00 when it posts');
  await expect(page.getByLabel('View Concert tickets, scheduled', { exact: true })).toContainText('Scheduled');
  await expect(page.getByLabel('View Bakery', { exact: true })).not.toContainText('Scheduled');

  await page.getByLabel('View Everyday account').first().click();
  await expect(page.getByTestId('account-balance-today')).toHaveText('€990.00');
  await expect(page.getByTestId('account-scheduled-movement')).toHaveText('−€40.00');
  await expect(page.getByTestId('account-balance-after-scheduled')).toHaveText('€950.00');
  const ledgerBefore = await page.evaluate(key => localStorage.getItem(key), k_ledgerKey);

  // From its date the entry counts automatically, with no confirmation step.
  await page.clock.setSystemTime(new Date('2026-11-20T09:00:00'));
  await page.reload();
  await expect(page.getByLabel('View Everyday account').first()).toContainText('€950.00');
  await expect(page.getByLabel('View net spending transactions')).toContainText('€50.00');
  await expect(page.getByTestId('month-scheduled')).toHaveCount(0);
  await expect(page.getByLabel('View Concert tickets', { exact: true })).not.toContainText('Scheduled');
  expect(await page.evaluate(key => localStorage.getItem(key), k_ledgerKey)).toBe(ledgerBefore);
});

async function sendAppToBackgroundAndBack(page) {
  await page.evaluate(() => {
    for (const visibility of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { value: visibility, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
}

test('an app left open counts an entry once it returns on the entry\'s date', async ({ page }) => {
  await openWithLedger(page, ledgerWithConcert(), '2026-11-17T12:00:00');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Plan Year ahead', exact: true }).click();
  await expect(page.getByTestId('year-month-2026-11-scheduled')).toHaveText('−€40.00');

  await page.clock.setSystemTime(new Date('2026-11-20T09:00:00'));
  await sendAppToBackgroundAndBack(page);
  await expect(page.getByTestId('year-month-2026-11-scheduled')).toHaveCount(0);
  await expect(page.getByTestId('year-month-2026-11-recorded')).toHaveText('−€50.00');
  await returnHome(page);
  await expect(page.getByLabel('View Everyday account').first()).toContainText('€950.00');
});

test('a future month reports nothing until its entries post and lists them as scheduled', async ({ page }) => {
  const ledger = createFinancialState({ transactions: [
    createTransaction({ id: 'rent', title: 'December rent', amount: 80000, date: '2026-12-02', category: 'rent' })
  ] });
  await openWithLedger(page, ledger, '2026-11-17T12:00:00');
  await page.getByRole('button', { name: 'Choose month', exact: true }).click();
  await page.getByRole('button', { name: 'Dec', exact: true }).click();

  await expect(page.getByTestId('month-pulse-period')).toHaveText('December · posted so far');
  await expect(page.getByLabel('View net spending transactions')).toContainText('€0.00');
  await expect(page.getByTestId('month-scheduled')).toHaveText('1 scheduled entry · −€800.00 when it posts');
  await expect(page.getByLabel('View December rent, scheduled', { exact: true })).toBeVisible();
});

test('an account shows no scheduled lines when nothing is dated after today', async ({ page }) => {
  await openWithLedger(page, ledgerWithConcert(), '2026-11-25T12:00:00');
  await openMoreSection(page, 'Accounts');
  await page.getByLabel('View Everyday account').first().click();
  await expect(page.getByTestId('account-balance-today')).toHaveText('€950.00');
  await expect(page.getByTestId('account-scheduled-movement')).toHaveCount(0);
});

test.describe('west of UTC in the evening', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('a new entry defaults to the local date and is not scheduled', async ({ page }) => {
    // 21:00 on 10 November in Los Angeles is already 11 November in UTC.
    await openWithLedger(page, createFinancialState(), '2026-11-11T05:00:00Z');
    await page.getByLabel('Add expense', { exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel('Date', { exact: true })).toHaveValue('2026-11-10');
    await page.getByRole('dialog').getByLabel('Close dialog', { exact: true }).click();

    await addTransaction(page, { title: 'Late snack', amount: '5.00' });
    await expect(page.getByLabel('View Late snack', { exact: true })).toBeVisible();
    await expect(page.getByLabel('View Everyday account').first()).toContainText('€995.00');
  });
});

test.describe('west of UTC on New Year\'s Eve', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('a new loan starts in the local month and its default end keeps that month', async ({ page }) => {
    // 21:00 on 31 December in Los Angeles is already 1 January in UTC.
    await openWithLedger(page, createFinancialState(), '2027-01-01T05:00:00Z');
    await openMoreSection(page, 'Loans');
    await page.getByRole('button', { name: 'Add loan', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Start month · YYYY-MM', { exact: true })).toHaveValue('2026-12');
    await expect(dialog.getByLabel('Last month · YYYY-MM', { exact: true })).toHaveValue('2029-12');
  });
});

test.describe('east of UTC just after midnight', () => {
  test.use({ timezoneId: 'Pacific/Auckland' });

  test('the app opens on the local month and counts entries dated today', async ({ page }) => {
    // 00:30 on 1 December in Auckland is still 30 November in UTC.
    const ledger = createFinancialState({
      accounts: [
        { id: 'everyday', name: 'Everyday', tag: 'Personal', openingBalance: 100000 },
        { id: 'savings', name: 'Rainy day', tag: 'Savings', openingBalance: 100000, interestSchedule: [{ since: '2026-11', rate: 12 }] }
      ],
      transactions: [createTransaction({ id: 'coffee', title: 'First coffee', amount: 300, date: '2026-12-01' })]
    });
    await openWithLedger(page, ledger, '2026-11-30T11:30:00Z');

    await expect(page.getByTestId('month-pulse-period')).toHaveText('December, so far');
    await expect(page.getByLabel('View net spending transactions')).toContainText('€3.00');
    await expect(page.getByLabel('View First coffee', { exact: true })).toBeVisible();
    await expect(page.getByLabel('View Everyday account').first()).toContainText('€997.00');
    // November is complete locally, so its interest posts at startup: €1,000 × (1.12^(1/12) − 1).
    await expect(page.getByLabel('View Rainy day account').first()).toContainText('€1,009.49');
  });
});

test('an expense counts a payback dated later as scheduled, not received, until its date', async ({ page }) => {
  const ledger = createFinancialState({ transactions: [
    createTransaction({ id: 'dinner', title: 'Dinner out', amount: 12000, date: '2026-10-08' }),
    createTransaction({ id: 'friend-pays', type: 'reimbursement', title: 'Friend pays back', account: 'shared', amount: 4000, date: '2026-11-25', linkedId: 'dinner', category: undefined })
  ] });
  await openWithLedger(page, ledger, '2026-11-17T12:00:00');
  await page.getByRole('button', { name: 'Choose month', exact: true }).click();
  await page.getByRole('button', { name: 'Oct', exact: true }).click();

  const row = page.getByLabel('View Dinner out', { exact: true });
  await expect(row).toContainText('€40.00 scheduled back');
  await expect(row).not.toContainText('€40.00 back');
  await row.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('expense-net')).toHaveText('€120.00');
  await expect(dialog.getByTestId('expense-scheduled-back')).toHaveText('€40.00');
  await expect(dialog.getByTestId('expense-paid-back')).toHaveCount(0);
  await expect(dialog.getByText(/^Scheduled payback · 2026-11-25$/)).toBeVisible();

  await page.clock.setSystemTime(new Date('2026-11-25T09:00:00'));
  await page.reload();
  await page.getByRole('button', { name: 'Choose month', exact: true }).click();
  await page.getByRole('button', { name: 'Oct', exact: true }).click();
  await expect(page.getByLabel('View Dinner out', { exact: true })).toContainText('€40.00 back');
  await page.getByLabel('View Dinner out', { exact: true }).click();
  await expect(page.getByRole('dialog').getByTestId('expense-paid-back')).toHaveText('€40.00');
  await expect(page.getByRole('dialog').getByTestId('expense-net')).toHaveText('€80.00');
  await expect(page.getByRole('dialog').getByTestId('expense-scheduled-back')).toHaveCount(0);
});
