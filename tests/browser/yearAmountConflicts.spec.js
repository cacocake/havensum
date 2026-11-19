import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';

const k_ledgerKey = 'melo-state-v1';
const k_baselineKey = 'melo-sync-base';
const k_narrowViewport = { width: 320, height: 720 };
const k_longPlannedCostName = 'December celebrations with the whole extended family and the neighbours';
const k_celebrations = { id: 'celebrations', name: 'December celebrations', month: 12, amount: 40000 };

async function openLedger(page, ledger, { baseline }) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ key, baselineKey, ledger, baseline }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
      localStorage.setItem(baselineKey, JSON.stringify(baseline));
    }
  }, { key: k_ledgerKey, baselineKey: k_baselineKey, ledger, baseline });
  await page.goto('/');
}

async function reviewBackupMerge(page, backup) {
  await openMoreSection(page, 'Settings');
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Review backup merge', exact: true }).click();
  await (await choosingFile).setFiles({ name: 'other-device.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  return page.getByRole('dialog');
}

function savedPlannedCost(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)).events[0], k_ledgerKey);
}

test('a year-amount conflict reads in euros by year and choosing the backup takes its whole set of year amounts', async ({ page }) => {
  const baseline = createFinancialState({ events: [{ ...k_celebrations, yearAmounts: { 2026: 40000, 2027: 40500 } }] });
  const ledger = createFinancialState({ events: [{ ...k_celebrations, yearAmounts: { 2026: 40000, 2027: 41000 } }] });
  const backup = createFinancialState({ events: [{ ...k_celebrations, yearAmounts: { 2026: 40000, 2027: 45000, 2028: 46000 } }] });
  await openLedger(page, ledger, { baseline });

  const review = await reviewBackupMerge(page, backup);

  await expect(review.getByText('December celebrations · amounts for 2027 and 2028', { exact: true })).toBeVisible();
  await expect(review.getByText('yearAmounts', { exact: false })).toHaveCount(0);
  const thisDevice = review.getByRole('button', { name: 'This device. Amount for 2027: €410.00. Amount for 2028: usual amount (€400.00)', exact: true });
  const backupFile = review.getByRole('button', { name: 'Backup file. Amount for 2027: €450.00. Amount for 2028: €460.00', exact: true });
  await expect(thisDevice).toBeVisible();
  await backupFile.click();
  await review.getByRole('button', { name: 'Apply reviewed merge', exact: true }).click();

  await expect.poll(async () => (await savedPlannedCost(page)).yearAmounts).toEqual({ 2026: 40000, 2027: 45000, 2028: 46000 });
});

test('a long planned-cost name wraps inside a narrow conflict card', async ({ page }) => {
  await page.setViewportSize(k_narrowViewport);
  const plannedCost = { ...k_celebrations, name: k_longPlannedCostName };
  const baseline = createFinancialState({ events: [plannedCost] });
  const ledger = createFinancialState({ events: [{ ...plannedCost, yearAmounts: { 2027: 123456789 } }] });
  const backup = createFinancialState({ events: [{ ...plannedCost, yearAmounts: { 2027: 987654321 } }] });
  await openLedger(page, ledger, { baseline });

  const review = await reviewBackupMerge(page, backup);

  const title = review.getByText(`${k_longPlannedCostName} · amount for 2027`, { exact: true });
  await expect(title).toBeVisible();
  const backupLine = review.getByText('Amount for 2027: €9,876,543.21', { exact: true });
  await expect(backupLine).toBeVisible();
  for (const element of [title, backupLine]) {
    const box = await element.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(k_narrowViewport.width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(k_narrowViewport.width);
});

test('an edit-versus-delete conflict on a planned cost still asks which side to keep', async ({ page }) => {
  const baseline = createFinancialState({ events: [k_celebrations] });
  const ledger = createFinancialState({ events: [{ ...k_celebrations, yearAmounts: { 2027: 41000 } }] });
  const backup = createFinancialState({ events: [] });
  await openLedger(page, ledger, { baseline });

  const review = await reviewBackupMerge(page, backup);

  await expect(review.getByText('events · celebrations · Edit vs. delete', { exact: true })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Backup file. Deleted', exact: true })).toBeVisible();
  await review.getByText('THIS DEVICE', { exact: true }).click();
  await review.getByRole('button', { name: 'Apply reviewed merge', exact: true }).click();

  await expect.poll(async () => (await savedPlannedCost(page))?.yearAmounts).toEqual({ 2027: 41000 });
});
