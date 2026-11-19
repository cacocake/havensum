import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';

const k_ledgerKey = 'melo-state-v1';

async function openInterview(page, ledger) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Build a plan', exact: true }).click();
  return page.getByRole('dialog');
}

test('the draft shows its confirmed months, suggests the cushion and lists the bills behind a fixed line', async ({ page }) => {
  const ledger = createFinancialState({
    transactions: [
      createTransaction({ id: 'shoes', category: 'shopping', date: '2026-09-10', amount: 9000 }),
      createTransaction({ id: 'rent', title: 'A very long landlord name for the flat by the river', category: 'rent', date: '2026-10-01', amount: 123456789 })
    ],
    outlook: { completeMonths: ['2026-09', '2026-10'] }
  });
  const dialog = await openInterview(page, ledger);

  await expect(dialog.getByText('Based on months you confirmed complete: Sep 2026, Oct 2026.', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Monthly occasional-spending cushion · EUR', { exact: true })).toHaveValue('45');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  const bill = dialog.getByText('A very long landlord name for the flat by the river · latest €1,234,567.89', { exact: true });
  await expect(bill).toBeVisible();

  const dialogBox = await dialog.boundingBox();
  const billBox = await bill.boundingBox();
  expect(billBox.x + billBox.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(JSON.parse(await page.evaluate(key => localStorage.getItem(key), k_ledgerKey)).plans).toEqual({});
});

test('unconfirmed and missing history are labelled so amounts can be entered manually', async ({ page }) => {
  const partialLedger = createFinancialState({ transactions: [createTransaction({ date: '2026-10-10', amount: 3000 })] });
  const dialog = await openInterview(page, partialLedger);
  await expect(dialog.getByText('Partial estimate from recorded months not yet confirmed complete: Oct 2026.', { exact: true })).toBeVisible();

  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), transactions: [] })), k_ledgerKey);
  await page.reload();
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Build a plan', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('No usable history yet. Enter the amounts you expect.', { exact: true })).toBeVisible();
});
