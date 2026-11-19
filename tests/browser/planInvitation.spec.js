import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, planArchiveOf } from '../helpers/financialFixtures.js';
import { buildPlan } from '../../src/planning.js';

const k_ledgerKey = 'melo-state-v1';
const k_deferralKey = 'havensum-plan-invitation-deferral-v1';

async function openYearPlan(page, { now, ledger }) {
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
}

function ledgerPlannedFor(year) {
  const ledger = createFinancialState();
  return { ...ledger, plans: planArchiveOf({ ...buildPlan(ledger, { year, income: 100000, cushion: 0, today: `${year}-01-02` }), createdAt: `${year}-01-02T09:00:00.000Z` }) };
}

function savedLedger(page) {
  return page.evaluate(key => localStorage.getItem(key), k_ledgerKey);
}

test('a fresh ledger is invited, Later survives reload, and manual entry stays available without any ledger change', async ({ page }) => {
  const ledger = createFinancialState();
  await openYearPlan(page, { now: '2026-11-19T12:00:00', ledger });
  const invitation = page.getByTestId('plan-invitation');
  await expect(invitation.getByText('Ready to plan 2026?', { exact: true })).toBeVisible();
  const ledgerBefore = await savedLedger(page);

  await page.getByRole('button', { name: 'Ask me later in 2026', exact: true }).click();
  await expect(invitation).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();
  await expect(page.getByTestId('plan-invitation')).toHaveCount(0);
  expect(await savedLedger(page)).toBe(ledgerBefore);
  expect(await page.evaluate(key => localStorage.getItem(key), k_deferralKey)).toBe('2026');

  await page.getByRole('button', { name: 'Build a plan', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Make room for your year', { exact: true })).toBeVisible();
});

test('in January a ledger planned only for last year is invited, and approval removes the invitation', async ({ page }) => {
  await openYearPlan(page, { now: '2027-01-02T12:00:00', ledger: ledgerPlannedFor(2026) });
  const invitation = page.getByTestId('plan-invitation');
  await expect(invitation.getByText('Ready to plan 2027?', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Start the 2027 interview', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Start the 2027 interview', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await expect(invitation).toHaveCount(0);
  const saved = JSON.parse(await savedLedger(page));
  expect(Object.keys(saved.plans)).toEqual(['2026', '2027']);
});

test('a plan prepared ahead for the new year means no invitation after rollover', async ({ page }) => {
  await openYearPlan(page, { now: '2027-01-02T12:00:00', ledger: ledgerPlannedFor(2027) });
  await expect(page.getByText('Ready to plan 2027?', { exact: true })).toHaveCount(0);
});

test('a deferral from last year does not hide the new year\'s invitation', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '2026'), k_deferralKey);
  await openYearPlan(page, { now: '2027-01-02T12:00:00', ledger: ledgerPlannedFor(2026) });
  await expect(page.getByText('Ready to plan 2027?', { exact: true })).toBeVisible();
});
