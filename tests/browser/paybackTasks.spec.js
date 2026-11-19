import { test, expect } from '@playwright/test';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { createPaybackTask } from '../../src/paybackTasks.js';
import { openMoreSection, returnHome } from '../helpers/userFlows.js';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.clock.install({ time: new Date('2026-11-18T12:00:00') });
  await page.addInitScript(state => {
    if (!localStorage.getItem('melo-state-v1')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(state));
    }
  }, createFinancialState());
  await page.goto('/');
});

async function addTrackedExpense(page) {
  await page.getByLabel('Add expense', { exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Amount · EUR', { exact: true }).fill('100.00');
  await editor.getByLabel('Title', { exact: true }).fill('Shared train tickets');
  await editor.getByRole('switch', { name: 'Expect a payback' }).click();
  await editor.getByLabel('Expected payback · EUR', { exact: true }).fill('60.00');
  await editor.getByLabel('Due date · YYYY-MM-DD · optional', { exact: true }).fill('2026-11-17');
  await editor.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(editor).toHaveCount(0);
}

test('a tracked expense prefills a payback and can be closed after a partial payment', async ({ page }) => {
  await addTrackedExpense(page);
  await openMoreSection(page, 'Reimbursements');
  await expect(page.getByText('Overdue', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record payback', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Amount · EUR', { exact: true })).toHaveValue('60');
  await expect(dialog.getByText('Linked expense · Shared train tickets', { exact: true })).toBeVisible();
  await dialog.getByLabel('Close dialog', { exact: true }).click();
  await expect(page.getByText('€60.00 outstanding', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Record payback', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount · EUR', { exact: true }).fill('25.00');
  await dialog.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(page.getByText('€35.00 outstanding', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close without payback', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm close without payback', exact: true }).click();
  await page.reload();
  await openMoreSection(page, 'Reimbursements');
  await page.getByRole('button', { name: 'Show payback history', exact: true }).click();
  await expect(page.getByText('Closed without further payment', { exact: true })).toBeVisible();
  await expect(page.getByText('Expected €60.00 · Received €25.00', { exact: true })).toBeVisible();
  await returnHome(page);
  await expect(page.getByLabel('View net spending transactions')).toContainText('€75.00');
  await expect(page.getByLabel('View income transactions')).toContainText('€0.00');
});

test('turning off tracking confirms closure and deleting the expense confirms removal of its history', async ({ page }) => {
  await addTrackedExpense(page);
  await page.getByLabel('View Shared train tickets', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit transaction', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('switch', { name: 'Expect a payback' }).click();
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor.getByText('Close without recording a payback? The closure will stay in your history.')).toBeVisible();
  await editor.getByRole('button', { name: 'Close and save', exact: true }).click();
  await openMoreSection(page, 'Reimbursements');
  await page.getByRole('button', { name: 'Show payback history', exact: true }).click();
  await page.getByRole('button', { name: 'View expense', exact: true }).click();
  await page.getByRole('button', { name: 'Edit transaction', exact: true }).click();
  await editor.getByRole('button', { name: 'Delete transaction', exact: true }).click();
  await expect(editor.getByText('Delete this expense, its payback task and closure history permanently?')).toBeVisible();
  await editor.getByRole('button', { name: 'Delete transaction', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show payback history', exact: true })).toHaveCount(0);
});

test('backup review identifies the expense and payback task before confirming their removal', async ({ page }) => {
  const expense = createTransaction({ title: 'Shared train tickets', amount: 10000 });
  const baseline = createFinancialState({ transactions: [expense] });
  const current = createPaybackTask(baseline, expense.id, { id: 'train-task', expectedAmount: 6000, at: '2026-11-18T11:00:00.000Z' });
  // Seed before the app starts on reload. Writing from the running page could
  // race with a save the app still has pending.
  await page.addInitScript(({ current, baseline }) => {
    if (!sessionStorage.getItem('synthetic-merge-seeded')) {
      localStorage.setItem('melo-state-v1', JSON.stringify(current));
      localStorage.setItem('melo-sync-base', JSON.stringify(baseline));
      sessionStorage.setItem('synthetic-merge-seeded', 'true');
    }
  }, { current, baseline });
  await page.reload();
  await openMoreSection(page, 'Settings');
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Review backup merge', exact: true }).click();
  const chooser = await choosingFile;
  await chooser.setFiles({ name: 'synthetic-payback-merge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...baseline, transactions: [] })) });

  const review = page.getByRole('dialog');
  await expect(review.getByText('Expense and payback task · Shared train tickets', { exact: true })).toBeVisible();
  await expect(review.getByText('Expected payback €60.00', { exact: true })).toBeVisible();
  await expect(review.getByText('Expense and payback task removed', { exact: true })).toBeVisible();
  await review.getByText('BACKUP FILE', { exact: true }).click();
  await review.getByRole('button', { name: 'Apply reviewed merge', exact: true }).click();
  await returnHome(page);
  await expect(page.getByLabel('View net spending transactions')).toContainText('€0.00');
});
