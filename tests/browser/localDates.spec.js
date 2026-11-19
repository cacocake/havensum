import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction, planArchiveOf } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';
import { closePaybackTask, createPaybackTask } from '../../src/paybackTasks.js';

// Owner decision L02: exported files carry the phone's local date. In New
// Zealand, 19 November at 19:00 UTC is already 20 November.
test.use({ timezoneId: 'Pacific/Auckland' });

test('backup and CSV file names use the local date when it differs from the UTC date', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-19T19:00:00Z') });
  await page.addInitScript(state => {
    if (!localStorage.getItem('melo-state-v1')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(state));
    }
  }, createFinancialState({ transactions: [createTransaction({ title: 'Existing purchase' })] }));
  await page.goto('/');
  await openMoreSection(page, 'Settings');

  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full JSON backup', exact: true }).click();
  const backup = await backupDownload;
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export transactions CSV', exact: true }).click();
  const csv = await csvDownload;

  expect([backup.suggestedFilename(), csv.suggestedFilename()]).toEqual(['Havensum-backup-2026-11-20.json', 'Havensum-transactions-2026-11-20.csv']);
});

test("a frozen plan's approval date is shown by the local day", async ({ page }) => {
  const plannedMonth = { income: 200000, expense: 90000, balance: 110000, cushion: 0, loan: 0, event: 0, lines: [] };
  const plan = { year: 2026, revision: 1, window: 3, tolerance: 200, drift: 0.3, incomeChanges: [], loanChanges: [],
    createdAt: '2026-11-19T19:00:00.000Z', months: { '2026-12': plannedMonth } };
  await page.clock.install({ time: new Date('2026-11-19T19:30:00Z') });
  await page.addInitScript(state => {
    if (!localStorage.getItem('melo-state-v1')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(state));
    }
  }, createFinancialState({ plans: planArchiveOf(plan) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Year Plan', exact: true }).click();

  await expect(page.getByText('2026 · revision 1 · 2026-11-20.', { exact: false })).toBeVisible();
});

test('a payback closed without payment shows its closure by the local day', async ({ page }) => {
  const withExpense = createFinancialState({ transactions: [createTransaction({ id: 'train', title: 'Shared train tickets', amount: 10000, date: '2026-11-10' })] });
  const tracked = createPaybackTask(withExpense, 'train', { id: 'train-task', expectedAmount: 6000, at: '2026-11-10T10:00:00.000Z' });
  const closed = closePaybackTask(tracked, 'train-task', { at: '2026-11-19T19:00:00.000Z', reason: 'Settled in person' });
  await page.clock.install({ time: new Date('2026-11-19T19:30:00Z') });
  await page.addInitScript(state => {
    if (!localStorage.getItem('melo-state-v1')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(state));
    }
  }, closed);
  await page.goto('/');
  await openMoreSection(page, 'Reimbursements');
  await page.getByRole('button', { name: 'Show payback history', exact: true }).click();

  await expect(page.getByText('2026-11-20 · Settled in person', { exact: true })).toBeVisible();
});
