import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';

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
  const csvDownload = page.waitForEvent('download');
  const backup = await backupDownload;
  await page.getByRole('button', { name: 'Export transactions CSV', exact: true }).click();
  const csv = await csvDownload;

  expect([backup.suggestedFilename(), csv.suggestedFilename()]).toEqual(['Havensum-backup-2026-11-20.json', 'Havensum-transactions-2026-11-20.csv']);
});
