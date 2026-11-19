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
  await expect(page.getByText('No approved plan for 2026.', { exact: false })).toBeVisible();
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

  const ledgerBefore = await savedLedger(page);
  await page.getByRole('button', { name: 'Start the 2027 interview', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await savedLedger(page)).toBe(ledgerBefore);
  await page.getByRole('button', { name: 'Start the 2027 interview', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await savedLedger(page)).toBe(ledgerBefore);
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
  await expect(page.getByText('2027 · revision 1', { exact: false })).toBeVisible();
  await expect(page.getByText('Ready to plan 2027?', { exact: true })).toHaveCount(0);
});

test('a deferral from last year does not hide the new year\'s invitation', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '2026'), k_deferralKey);
  await openYearPlan(page, { now: '2027-01-02T12:00:00', ledger: ledgerPlannedFor(2026) });
  await expect(page.getByText('Ready to plan 2027?', { exact: true })).toBeVisible();
});

test('a deferral saved for this year is read back on startup', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '2027'), k_deferralKey);
  await openYearPlan(page, { now: '2027-01-02T12:00:00', ledger: ledgerPlannedFor(2026) });
  await expect(page.getByText('No approved plan for 2027.', { exact: false })).toBeVisible();
  await expect(page.getByText('Ready to plan 2027?', { exact: true })).toHaveCount(0);
});

test('if Later cannot be saved the card still hides for now with a plain explanation', async ({ page }) => {
  await page.addInitScript(key => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (storageKey === key) {
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      }
      return setItem.call(this, storageKey, value);
    };
  }, k_deferralKey);
  await openYearPlan(page, { now: '2026-11-19T12:00:00', ledger: createFinancialState() });
  await page.getByRole('button', { name: 'Ask me later in 2026', exact: true }).click();

  await expect(page.getByTestId('plan-invitation')).toHaveCount(0);
  await expect(page.getByText('Hidden for now. This device could not remember the choice, so the invitation may return.', { exact: true })).toBeVisible();
});

test('the invitation card stays within narrow screens', async ({ page }) => {
  await openYearPlan(page, { now: '2026-11-19T12:00:00', ledger: createFinancialState() });
  const card = await page.getByTestId('plan-invitation').boundingBox();
  const viewport = page.viewportSize();
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
  for (const name of ['Start the 2026 interview', 'Ask me later in 2026']) {
    const button = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(button.x + button.width).toBeLessThanOrEqual(card.x + card.width + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
