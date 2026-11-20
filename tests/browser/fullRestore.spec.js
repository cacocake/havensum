import { test, expect } from '../helpers/browserTest.js';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';
import { openMoreSection } from '../helpers/userFlows.js';
import { buildPlan } from '../../src/planning.js';

const k_ledgerKey = 'melo-state-v1';
const k_baselineKey = 'melo-sync-base';
const k_restoreRecoveryKey = 'havensum-restore-recovery-v1';
const k_reloadedNotice = 'Your ledger was changed in another tab or window, so it was reloaded here. Choose the backup again to review it against the current ledger.';

function deviceLedger() {
  return createFinancialState({ transactions: [createTransaction({ id: 'device-only', title: 'Device purchase' })] });
}

function currentBackup() {
  const ledger = createFinancialState({
    accounts: [
      { id: 'everyday', name: 'Everyday', tag: 'Personal', openingBalance: 100000 },
      { id: 'reserve', name: 'Reserve', tag: 'Savings', openingBalance: 500000, interestSchedule: [{ since: '2026-01', rate: 3 }, { since: '2027-01', rate: 1 }] }
    ],
    transactions: [createTransaction({ id: 'backup-one', title: 'Backup purchase' }), createTransaction({ id: 'backup-two', title: 'Second backup purchase', amount: 5000 })]
  });
  ledger.plans = { 2026: [{ ...buildPlan(ledger, { year: 2026, income: 100000, cushion: 0, today: '2026-01-02' }), id: 'plan-2026', createdAt: '2026-01-02T09:00:00.000Z' }] };
  return ledger;
}

async function openSettings(page, { ledger = deviceLedger(), baseline, setup } = {}) {
  await page.clock.install({ time: new Date('2026-11-19T12:00:00') });
  await page.addInitScript(({ keys, ledger, baseline }) => {
    if (!localStorage.getItem(keys.ledger)) {
      localStorage.setItem(keys.ledger, JSON.stringify(ledger));
      if (baseline) {
        localStorage.setItem(keys.baseline, JSON.stringify(baseline));
      }
    }
  }, { keys: { ledger: k_ledgerKey, baseline: k_baselineKey }, ledger, baseline });
  if (setup) {
    await page.addInitScript(setup.script, setup.argument);
  }
  await page.goto('/');
  await openMoreSection(page, 'Settings');
}

async function chooseBackupFile(page, contents) {
  const choosingFile = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore full backup', exact: true }).click();
  await (await choosingFile).setFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(contents) });
}

function stored(page, key) {
  return page.evaluate(storageKey => localStorage.getItem(storageKey), key);
}

test('a reviewed restore replaces the ledger only after confirmation and keeps the previous ledger', async ({ page }) => {
  const baseline = deviceLedger();
  await openSettings(page, { baseline });
  const ledgerBefore = await stored(page, k_ledgerKey);
  await chooseBackupFile(page, JSON.stringify(currentBackup()));

  const dialog = page.getByRole('dialog');
  const summary = dialog.getByTestId('restore-summary');
  await expect(summary.getByText('Transactions', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Archived plans in the backup: 2026 (1 revision).', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Archived plans on this device: none.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Accounts in the backup: Everyday, Reserve.', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Transactions: 1 on this device, 2 in the backup', { exact: true })).toBeVisible();
  const restore = dialog.getByRole('button', { name: 'Restore this backup', exact: true });
  await expect(restore).toBeDisabled();
  expect(await stored(page, k_ledgerKey)).toBe(ledgerBefore);

  await dialog.getByRole('switch', { name: "Replace this device's ledger", exact: true }).click();
  await restore.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Backup restored. Your previous ledger is kept as a pre-restore copy.', { exact: true })).toBeVisible();

  const restoredLedger = JSON.parse(await stored(page, k_ledgerKey));
  const backupIds = currentBackup().transactions.map(transaction => transaction.id);
  expect(restoredLedger.transactions.filter(transaction => backupIds.includes(transaction.id))).toEqual(currentBackup().transactions);
  // Interest for completed months is caught up at once, as it is at startup.
  expect(restoredLedger.transactions.filter(transaction => transaction.title === 'Savings interest').map(transaction => transaction.date.slice(0, 7)))
    .toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  expect({ ...restoredLedger, transactions: [] }).toEqual({ ...currentBackup(), transactions: [] });
  expect(JSON.parse(await stored(page, k_restoreRecoveryKey))).toEqual(JSON.parse(ledgerBefore));
  expect(JSON.parse(await stored(page, k_baselineKey))).toEqual(baseline);
  await page.reload();
  await expect(page.getByLabel('View Backup purchase', { exact: true })).toBeVisible();
  await expect(page.getByLabel('View Device purchase', { exact: true })).toHaveCount(0);
});

test('a legacy backup restores its plan and savings rate in migrated form', async ({ page }) => {
  await openSettings(page);
  const legacy = createFinancialState({
    version: 2,
    accounts: [{ id: 'reserve', name: 'Reserve', tag: 'Savings', openingBalance: 0, interest: 2, interestStart: '2026-03' }],
    plan: { ...buildPlan(createFinancialState(), { year: 2026, income: 90000, cushion: 0, today: '2026-01-02' }), revision: 2 }
  });
  delete legacy.plans;
  await chooseBackupFile(page, JSON.stringify(legacy));
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('switch', { name: "Replace this device's ledger", exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore this backup', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const restored = JSON.parse(await stored(page, k_ledgerKey));
  expect([restored.version, restored.accounts[0].interestSchedule, restored.plans['2026'][0].revision]).toEqual([5, [{ since: '2026-03', rate: 2 }], 2]);
});

test('missing categories are reviewed before restoring and a cancelled preview changes nothing', async ({ page }) => {
  await openSettings(page);
  const ledgerBefore = await stored(page, k_ledgerKey);
  const backup = currentBackup();
  backup.transactions[0].category = 'retired-groceries';
  await chooseBackupFile(page, JSON.stringify(backup));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Missing category · retired-groceries', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await stored(page, k_ledgerKey)).toBe(ledgerBefore);
  expect(await stored(page, k_restoreRecoveryKey)).toBeNull();

  await chooseBackupFile(page, JSON.stringify(backup));
  await dialog.getByLabel('Category for Backup purchase', { exact: true }).selectOption({ label: 'Groceries' });
  await dialog.getByRole('switch', { name: "Replace this device's ledger", exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore this backup', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(JSON.parse(await stored(page, k_ledgerKey)).transactions[0].category).toBe('groceries');
});

test('corrupt, transaction-only and newer backups are refused before any preview', async ({ page }) => {
  await openSettings(page);
  const ledgerBefore = await stored(page, k_ledgerKey);
  const cases = [
    ['{broken backup', 'This file is not a readable JSON backup. Nothing was changed.'],
    [JSON.stringify([createTransaction()]), 'This file is not a full Havensum backup. Use Import transactions for transaction lists. Nothing was changed.'],
    [JSON.stringify({ ...currentBackup(), version: 99 }), 'This backup was made by a newer version of Havensum. Update the app before restoring it. Nothing was changed.']
  ];
  for (const [contents, message] of cases) {
    await chooseBackupFile(page, contents);
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  expect(await stored(page, k_ledgerKey)).toBe(ledgerBefore);
});

for (const [failingKey, message] of [
  [k_restoreRecoveryKey, 'The current ledger could not be copied for recovery, so nothing was replaced.'],
  [k_ledgerKey, 'The backup could not be saved, so your ledger is unchanged. A recovery copy of it was kept.']
]) {
  test(`a failed write to ${failingKey} leaves the device ledger in place`, async ({ page }) => {
    await openSettings(page);
    const ledgerBefore = await stored(page, k_ledgerKey);
    await chooseBackupFile(page, JSON.stringify(currentBackup()));
    await page.evaluate(key => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (storageKey, value) {
        if (storageKey === key) {
          throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
        }
        return setItem.call(this, storageKey, value);
      };
    }, failingKey);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('switch', { name: "Replace this device's ledger", exact: true }).click();
    await dialog.getByRole('button', { name: 'Restore this backup', exact: true }).click();

    await expect(dialog.getByText(message, { exact: true })).toBeVisible();
    expect(await stored(page, k_ledgerKey)).toBe(ledgerBefore);
    await page.reload();
    await expect(page.getByLabel('View Device purchase', { exact: true })).toBeVisible();
  });
}

test('a ledger saved by another tab after the preview refuses the restore and is reloaded here', async ({ page }) => {
  await openSettings(page);
  await chooseBackupFile(page, JSON.stringify(currentBackup()));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('restore-summary')).toBeVisible();
  const otherTabLedger = JSON.stringify({ ...deviceLedger(), theme: 'dark' });
  await page.evaluate(({ key, bytes }) => localStorage.setItem(key, bytes), { key: k_ledgerKey, bytes: otherTabLedger });
  await dialog.getByRole('switch', { name: "Replace this device's ledger", exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore this backup', exact: true }).click();

  await expect(page.getByText(k_reloadedNotice, { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(await stored(page, k_ledgerKey)).toBe(otherTabLedger);
  expect(await stored(page, k_restoreRecoveryKey)).toBeNull();
});

test('after a refusal the other tab\'s ledger is reloaded here and the backup can then replace it', async ({ page }) => {
  await openSettings(page);
  await chooseBackupFile(page, JSON.stringify(currentBackup()));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('restore-summary')).toBeVisible();
  const otherTabLedger = deviceLedger();
  otherTabLedger.transactions.push(createTransaction({ id: 'other-tab-only', title: 'Other tab purchase' }));
  await page.evaluate(({ key, bytes }) => localStorage.setItem(key, bytes), { key: k_ledgerKey, bytes: JSON.stringify(otherTabLedger) });
  await dialog.getByRole('switch', { name: "Replace this device's ledger", exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore this backup', exact: true }).click();
  await expect(page.getByText(k_reloadedNotice, { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);

  await chooseBackupFile(page, JSON.stringify(currentBackup()));
  await expect(dialog.getByLabel('Transactions: 2 on this device, 2 in the backup', { exact: true })).toBeVisible();
  await dialog.getByRole('switch', { name: "Replace this device's ledger", exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore this backup', exact: true }).click();

  await expect(page.getByText('Backup restored. Your previous ledger is kept as a pre-restore copy.', { exact: true })).toBeVisible();
  const preRestoreCopy = JSON.parse(await stored(page, k_restoreRecoveryKey));
  expect(preRestoreCopy.transactions.map(transaction => transaction.id)).toEqual(['device-only', 'other-tab-only']);
  expect(JSON.parse(await stored(page, k_ledgerKey)).transactions.some(transaction => transaction.id === 'other-tab-only')).toBe(false);
});

test('an unreadable ledger saved by another tab refuses the restore and asks for an app reload', async ({ page }) => {
  await openSettings(page);
  await chooseBackupFile(page, JSON.stringify(currentBackup()));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('restore-summary')).toBeVisible();
  const unreadableLedger = '{unreadable ledger';
  await page.evaluate(({ key, bytes }) => localStorage.setItem(key, bytes), { key: k_ledgerKey, bytes: unreadableLedger });
  await dialog.getByRole('switch', { name: "Replace this device's ledger", exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore this backup', exact: true }).click();

  await expect(page.getByText('Your ledger was changed in another tab or window and could not be reloaded here. Reload the app before restoring a backup.', { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(await stored(page, k_ledgerKey)).toBe(unreadableLedger);
  expect(await stored(page, k_restoreRecoveryKey)).toBeNull();
});

test('a ledger saved by another tab while the pre-restore copy is written is not replaced by the restore', async ({ page }) => {
  const otherTabLedger = JSON.stringify({ ...deviceLedger(), theme: 'dark' });
  // The other tab saves after the restore checked the saved ledger but before
  // the backup replaces it.
  const saveFromOtherTabAfterRecoveryCopy = {
    script: ({ ledgerKey, recoveryKey, bytes }) => {
      const saveItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        saveItem.call(this, key, value);
        if (key === recoveryKey) {
          saveItem.call(this, ledgerKey, bytes);
        }
      };
    },
    argument: { ledgerKey: k_ledgerKey, recoveryKey: k_restoreRecoveryKey, bytes: otherTabLedger }
  };
  await openSettings(page, { setup: saveFromOtherTabAfterRecoveryCopy });
  await chooseBackupFile(page, JSON.stringify(currentBackup()));
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('switch', { name: "Replace this device's ledger", exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore this backup', exact: true }).click();

  await expect(page.getByText(k_reloadedNotice, { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(await stored(page, k_ledgerKey)).toBe(otherTabLedger);
});

test('a ledger saved by another tab while the backup is read is not replaced by the restore', async ({ page }) => {
  const otherTabLedger = JSON.stringify({ ...deviceLedger(), theme: 'dark' });
  // The other tab saves after this tab loaded its ledger but before the
  // preview reads the saved copy, while the chosen file is being read.
  const saveFromOtherTabWhileReadingFile = {
    script: ({ key, bytes }) => {
      const readFileText = Blob.prototype.text;
      Blob.prototype.text = function () {
        Blob.prototype.text = readFileText;
        localStorage.setItem(key, bytes);
        return readFileText.call(this);
      };
    },
    argument: { key: k_ledgerKey, bytes: otherTabLedger }
  };
  await openSettings(page, { setup: saveFromOtherTabWhileReadingFile });
  await chooseBackupFile(page, JSON.stringify(currentBackup()));
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('switch', { name: "Replace this device's ledger", exact: true }).click();
  await dialog.getByRole('button', { name: 'Restore this backup', exact: true }).click();

  await expect(page.getByText(k_reloadedNotice, { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(await stored(page, k_ledgerKey)).toBe(otherTabLedger);
  expect(await stored(page, k_restoreRecoveryKey)).toBeNull();
});
