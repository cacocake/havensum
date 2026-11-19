import test from 'node:test';
import assert from 'node:assert/strict';
import { isRestorePreviewCurrent, prepareFullRestore } from '../src/fullRestore.js';
import { buildPlan } from '../src/planning.js';
import { prepareLoadedLedger } from '../src/startupLedger.js';
import { readRestoreRecovery, writeRestoreRecovery, readImportRecovery, writeImportRecovery, readMergeRecovery } from '../src/storage.web.js';
import { installBrowserStorage } from './helpers/browserStorage.js';
import { createFinancialState, createTransaction, planArchiveOf } from './helpers/financialFixtures.js';

function ledgerWithoutPlans() {
  return createFinancialState({
    accounts: [
      { id: 'everyday', name: 'Everyday', tag: 'Personal', openingBalance: 100000 },
      { id: 'reserve', name: 'Reserve', tag: 'Savings', openingBalance: 500000, interestSchedule: [{ since: '2026-01', rate: 3 }, { since: '2027-01', rate: 1 }] }
    ],
    transactions: [createTransaction({ id: 'one' }), createTransaction({ id: 'two', amount: 5000 })],
  });
}

function backupLedger() {
  const ledger = ledgerWithoutPlans();
  const snapshot = year => ({ ...buildPlan(ledger, { year, income: 100000, cushion: 0, today: `${year}-01-02` }), createdAt: `${year}-01-02T09:00:00.000Z` });
  return { ...ledger, plans: { ...planArchiveOf(snapshot(2026)), ...planArchiveOf(snapshot(2027)) } };
}

test('a current backup is validated and summarised before anything is replaced', () => {
  const backup = backupLedger();

  const preview = prepareFullRestore(JSON.stringify(backup));

  assert.deepEqual(preview.restoredState, backup);
  assert.deepEqual(preview.missingCategories, []);
  assert.deepEqual(preview.summary, {
    accounts: 2, transactions: 2, categories: backup.categories.length, loans: 0, events: 0,
    planYears: [{ year: 2026, revisions: 1 }, { year: 2027, revisions: 1 }], scheduledRateAccounts: 1,
    accountNames: ['Everyday', 'Reserve']
  });
});

test('a legacy backup restores in its migrated form, keeping its plan and rate', () => {
  const legacy = createFinancialState({
    version: 2,
    accounts: [{ id: 'reserve', name: 'Reserve', tag: 'Savings', openingBalance: 0, interest: 2, interestStart: '2026-03' }],
    plan: { year: 2026, revision: 2, window: 6, tolerance: 200, drift: 0.3, incomeChanges: [], loanChanges: [], months: {} }
  });

  const { restoredState, summary } = prepareFullRestore(JSON.stringify(legacy));

  assert.equal(restoredState.version, 4);
  assert.deepEqual(restoredState.accounts[0].interestSchedule, [{ since: '2026-03', rate: 2 }]);
  assert.deepEqual(summary.planYears, [{ year: 2026, revisions: 1 }]);
  assert.equal(restoredState.plans[2026][0].revision, 2);
});

test('transactions whose category is missing are listed for review and kept uncategorized', () => {
  const backup = backupLedger();
  backup.transactions[0].category = 'retired-category';

  const preview = prepareFullRestore(JSON.stringify(backup));

  assert.deepEqual(preview.missingCategories, [{ transactionId: 'one', categoryId: 'retired-category' }]);
  assert.equal(preview.restoredState.transactions[0].category, null);
});

test('corrupt files, transaction lists, invalid ledgers and future versions are refused with a clear reason', () => {
  const cases = [
    ['{not json', /not a readable JSON/],
    [JSON.stringify([createTransaction()]), /full Havensum backup/],
    [JSON.stringify({ ...backupLedger(), version: 99 }), /newer version/],
    [JSON.stringify({ ...backupLedger(), transactions: [createTransaction({ amount: 1.5 })] }), /could not be validated/]
  ];
  for (const [fileText, reason] of cases) {
    assert.throws(() => prepareFullRestore(fileText), reason);
  }
});

test('a preview is stale once the device ledger has changed', () => {
  const current = createFinancialState();
  const preview = prepareFullRestore(JSON.stringify(backupLedger()), current);

  const savedCurrent = JSON.stringify(current);

  assert.equal(isRestorePreviewCurrent(preview, current, savedCurrent), true);
  assert.equal(isRestorePreviewCurrent(preview, { ...current, theme: 'dark' }, savedCurrent), false);
});

test('a preview is stale when the saved ledger is not the one it was compared with', () => {
  const current = createFinancialState();
  const preview = prepareFullRestore(JSON.stringify(backupLedger()), current);
  const savedByAnotherTab = JSON.stringify({ ...current, theme: 'dark' });

  assert.equal(isRestorePreviewCurrent(preview, current, savedByAnotherTab), false);
  assert.equal(isRestorePreviewCurrent(preview, current, null), false);
});

test('the pre-restore copy is kept apart from import and merge recovery', async context => {
  installBrowserStorage(context);
  const importCopy = createFinancialState({ theme: 'dark' });
  const deviceLedger = createFinancialState({ transactions: [createTransaction()] });
  await writeImportRecovery(importCopy);

  await writeRestoreRecovery(deviceLedger);

  assert.deepEqual(await readRestoreRecovery(), deviceLedger);
  assert.deepEqual(await readImportRecovery(), importCopy);
  assert.equal(await readMergeRecovery(), null);
});

test('every distinct pre-restore copy is kept, so restoring twice cannot lose the original ledger', async context => {
  const storage = installBrowserStorage(context);
  const original = createFinancialState({ transactions: [createTransaction({ id: 'original' })] });
  const wrongBackup = createFinancialState({ transactions: [createTransaction({ id: 'wrong' })] });

  await writeRestoreRecovery(original);
  await writeRestoreRecovery(wrongBackup);
  await writeRestoreRecovery(wrongBackup);

  assert.deepEqual(await readRestoreRecovery(), wrongBackup);
  assert.deepEqual(JSON.parse(storage.getItem('havensum-restore-recovery-v1')), original);
  assert.deepEqual(JSON.parse(storage.getItem('havensum-restore-recovery-v1:1')), wrongBackup);
  assert.equal(storage.getItem('havensum-restore-recovery-v1:2'), null);
});

test('a restored ledger gets the same startup preparation as a loaded one', () => {
  const backup = createFinancialState({ accounts: [{ id: 'reserve', name: 'Reserve', tag: 'Savings', openingBalance: 100000, interestSchedule: [{ since: '2026-09', rate: 12 }] }] });

  const prepared = prepareLoadedLedger(backup, '2026-11');

  assert.deepEqual(prepared.transactions.map(transaction => transaction.date), ['2026-09-30', '2026-10-31']);
});

test('category warnings carried in a backup join the restore review and are cleared from the restored ledger', () => {
  const backup = backupLedger();
  backup.transactions[1].category = null;
  backup.migrationCategoryWarnings = [{ transactionId: 'two', categoryId: 'old-category' }];

  const preview = prepareFullRestore(JSON.stringify(backup));

  assert.deepEqual(preview.missingCategories, [{ transactionId: 'two', categoryId: 'old-category' }]);
  assert.equal(preview.restoredState.migrationCategoryWarnings, undefined);
});

test('the newest pre-restore copy is the ledger replaced last, even when it matches an older copy', async context => {
  installBrowserStorage(context);
  const original = createFinancialState({ transactions: [createTransaction({ id: 'original' })] });
  const otherBackup = createFinancialState({ transactions: [createTransaction({ id: 'other' })] });

  await writeRestoreRecovery(original);
  await writeRestoreRecovery(otherBackup);
  await writeRestoreRecovery(original);

  assert.deepEqual(await readRestoreRecovery(), original);
});

test('a corrupt newest copy falls back to the previous readable one', async context => {
  const storage = installBrowserStorage(context);
  const original = createFinancialState({ transactions: [createTransaction({ id: 'original' })] });
  await writeRestoreRecovery(original);
  await writeRestoreRecovery(createFinancialState({ theme: 'dark' }));
  storage.setItem('havensum-restore-recovery-v1:1', '{damaged copy');

  assert.deepEqual(await readRestoreRecovery(), original);
});

test('without a recorded latest index the highest kept copy is treated as newest', async context => {
  const storage = installBrowserStorage(context);
  const older = createFinancialState({ transactions: [createTransaction({ id: 'older' })] });
  const newer = createFinancialState({ transactions: [createTransaction({ id: 'newer' })] });
  storage.setItem('havensum-restore-recovery-v1', JSON.stringify(older));
  storage.setItem('havensum-restore-recovery-v1:1', JSON.stringify(newer));

  assert.deepEqual(await readRestoreRecovery(), newer);
  storage.setItem('havensum-restore-recovery-v1:latest-index', '-1');
  assert.deepEqual(await readRestoreRecovery(), newer);
});
