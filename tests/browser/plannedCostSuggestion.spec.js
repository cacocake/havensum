import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { buildPlan } from '../../src/planning.js';

const k_ledgerKey = 'melo-state-v1';

function linkedExpense(id, eventId, monthKey, category, amount, singleOccurrence) {
  const plannedCost = singleOccurrence ? { eventId, month: monthKey, singleOccurrence: true } : { eventId, month: monthKey };
  return createTransaction({ id, title: id, category, amount, date: `${monthKey}-05`, plannedCost });
}

// Three completed Decembers of a recurring cost and three completed trips, all synthetic.
function ledgerWithCompletedCosts() {
  const ledger = createFinancialState({
    categories: [
      ...createFinancialState().categories,
      { id: 'travel', name: 'Travel', kind: 'Occasional' },
      { id: 'flights', name: 'Flights', parentId: 'travel' },
      { id: 'hotels', name: 'Hotels', parentId: 'travel' }
    ],
    events: [
      { id: 'celebrations', name: 'December celebrations', month: 12, amount: 30000 },
      { id: 'lisbon', name: 'Lisbon weekend', year: 2024, month: 5, amount: 50000 },
      { id: 'azores', name: 'Azores week', year: 2025, month: 3, amount: 50000 },
      { id: 'porto', name: 'Porto break', year: 2025, month: 9, amount: 50000 }
    ],
    outlook: { completeMonths: ['2023-12', '2024-05', '2024-12', '2025-03', '2025-09', '2025-12'] },
    transactions: [
      linkedExpense('gifts-2023', 'celebrations', '2023-12', 'shopping', 40000, false),
      linkedExpense('gifts-2024', 'celebrations', '2024-12', 'shopping', 42000, false),
      linkedExpense('gifts-2025', 'celebrations', '2025-12', 'shopping', 41000, false),
      linkedExpense('lisbon-flight', 'lisbon', '2024-05', 'flights', 15000, true),
      linkedExpense('lisbon-hotel', 'lisbon', '2024-05', 'hotels', 20000, true),
      linkedExpense('azores-flight', 'azores', '2025-03', 'flights', 40000, true),
      linkedExpense('porto-hotel', 'porto', '2025-09', 'hotels', 35000, true)
    ]
  });
  const earlierPlan = buildPlan(ledger, { year: 2026, fromMonth: 1, income: 200000, cushion: 0, today: '2026-01-02' });
  ledger.plans = { 2026: [{ ...earlierPlan, id: 'plan-2026', createdAt: '2026-01-02T09:00:00.000Z' }] };
  return ledger;
}

async function openNextYearCosts(page, ledger) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ key, ledger }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(ledger));
    }
  }, { key: k_ledgerKey, ledger });
  await page.goto('/');
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

test('a recurring planned cost shows its past years and an accepted suggestion applies to the plan year only', async ({ page }) => {
  const dialog = await openNextYearCosts(page, ledgerWithCompletedCosts());
  const suggestion = dialog.getByTestId('planned-cost-suggestion');

  await expect(suggestion).toContainText('Similar past costs suggest €410.00 (between €400.00 and €420.00).');
  await expect(suggestion).toContainText('December celebrations · Dec 2023 · €400.00');
  await expect(suggestion).toContainText('December celebrations · Dec 2025 · €410.00');
  await dialog.getByRole('button', { name: 'Use €410.00 for 2027', exact: true }).click();
  await expect(dialog.getByText('Using €410.00 for 2027 only.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const saved = await savedLedger(page);
  const celebrations = saved.events.find(event => event.id === 'celebrations');
  expect([celebrations.amount, celebrations.yearAmounts]).toEqual([30000, { 2027: 41000 }]);
  expect(saved.plans['2027'][0].months['2027-12'].event).toBe(41000);
  expect(saved.plans['2026']).toEqual(ledgerWithCompletedCosts().plans['2026']);
});

test('keeping the usual amount, or cancelling after confirming the discard, leaves the planned cost unchanged', async ({ page }) => {
  const dialog = await openNextYearCosts(page, ledgerWithCompletedCosts());
  const before = await page.evaluate(key => localStorage.getItem(key), k_ledgerKey);

  await dialog.getByRole('button', { name: 'Use €410.00 for 2027', exact: true }).click();
  await dialog.getByRole('button', { name: 'Keep usual €300.00', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Use €410.00 for 2027', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Use €410.00 for 2027', exact: true }).click();
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByText('Discard your changes?', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();

  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), k_ledgerKey)).toBe(before);
});

test('a new planned cost compared with past travel uses the suggestion only when chosen', async ({ page }) => {
  const dialog = await openNextYearCosts(page, ledgerWithCompletedCosts());
  await dialog.getByLabel('A trip, a big purchase, a seasonal cost · optional', { exact: true }).fill('Madeira trip');
  const comparison = dialog.getByLabel('Compare with past costs · optional', { exact: true });

  await comparison.selectOption({ label: 'Like other Groceries costs' });
  await expect(dialog.getByText('Not enough similar past costs yet (0 of 3). Enter the amount you expect.', { exact: true })).toBeVisible();
  await comparison.selectOption({ label: 'Like other Travel costs' });
  const suggestion = dialog.getByTestId('planned-cost-suggestion').first();
  await expect(suggestion).toContainText('Similar past costs suggest €350.00 (between €350.00 and €400.00).');
  await expect(suggestion).toContainText('Lisbon weekend · May 2024 · €350.00');
  await expect(dialog.getByLabel('One-off amount · EUR', { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Use €350.00', exact: true }).click();
  await expect(dialog.getByLabel('One-off amount · EUR', { exact: true })).toHaveValue('350');
  await dialog.getByRole('button', { name: 'Add another event', exact: true }).click();
  await expect(comparison).toHaveCount(0);
  await dialog.getByLabel('A trip, a big purchase, a seasonal cost · optional', { exact: true }).fill('Second trip');
  await expect(comparison).toHaveValue('');
  await dialog.getByLabel('A trip, a big purchase, a seasonal cost · optional', { exact: true }).fill('');
  await dialog.getByLabel('A trip, a big purchase, a seasonal cost · optional', { exact: true }).fill('Madeira trip');
  await comparison.selectOption({ label: 'Like other Travel costs' });
  await dialog.getByLabel('A trip, a big purchase, a seasonal cost · optional', { exact: true }).fill('');
  await dialog.getByLabel('A trip, a big purchase, a seasonal cost · optional', { exact: true }).fill('Madeira trip');
  await expect(comparison).toHaveValue('');
  await comparison.selectOption({ label: 'Like other Travel costs' });
  await dialog.getByRole('button', { name: 'Use €350.00', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const madeira = (await savedLedger(page)).events.find(event => event.name === 'Madeira trip');
  expect([madeira.amount, madeira.year, madeira.yearAmounts]).toEqual([35000, 2027, undefined]);
});

test('the suggestion stays within a 320 px screen with a long name and a large amount', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const ledger = ledgerWithCompletedCosts();
  ledger.events[0].name = 'December celebrations with the whole extended family and friends';
  ledger.transactions = ledger.transactions.map(transaction => transaction.plannedCost.eventId === 'celebrations'
    ? { ...transaction, amount: transaction.amount * 1000 }
    : transaction);
  const dialog = await openNextYearCosts(page, ledger);
  const suggestion = dialog.getByTestId('planned-cost-suggestion');
  const useButton = dialog.getByRole('button', { name: 'Use €410,000.00 for 2027', exact: true });

  await expect(useButton).toBeVisible();
  for (const element of [suggestion, useButton]) {
    const box = await element.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('a year amount from an earlier revision is shown and can be returned to the usual amount', async ({ page }) => {
  const ledger = ledgerWithCompletedCosts();
  ledger.events[0].yearAmounts = { 2027: 41000, 2028: 45000 };
  const dialog = await openNextYearCosts(page, ledger);

  await expect(dialog.getByText('Using €410.00 for 2027 only.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep usual €300.00', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Use €410.00 for 2027', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Freeze my plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const saved = await savedLedger(page);
  expect(saved.events.find(event => event.id === 'celebrations').yearAmounts).toEqual({ 2028: 45000 });
  expect(saved.plans['2027'][0].months['2027-12'].event).toBe(30000);
});
