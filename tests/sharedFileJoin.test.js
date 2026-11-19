import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedFile, syncSharedFile } from '../src/sharedFileSync.js';
import { openSharedFile, adoptSharedFile, mergeIntoSharedFile, openSecondSharedFile, mergeSecondSharedFile, commitSharedFileJoin, joinItemKey, buildJoinedLedger } from '../src/sharedFileJoin.js';
import { parseSharedDocument } from '../src/sharedFileDocument.js';
import { mergeConflictKey } from '../src/mergeReview.js';
import * as webStorage from '../src/storage.web.js';
import { seed } from '../src/seed.js';
import { installBrowserStorage } from './helpers/browserStorage.js';
import { createInMemoryDriveTransport } from './helpers/inMemoryDriveTransport.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

const k_partnerEmail = 'partner@example.test';

function createWriteIdSource(deviceName) {
  let counter = 0;
  return () => {
    counter += 1;
    return `write-${deviceName}-${counter}`;
  };
}

function transactionIds(state) {
  return state.transactions.map(transaction => transaction.id).sort();
}

async function createFileFrom(state) {
  const drive = createInMemoryDriveTransport();
  const { binding } = await createSharedFile({ transport: drive.transport, localState: state, partnerEmail: k_partnerEmail, createWriteId: createWriteIdSource('creator') });
  return { drive, fileId: binding.fileId, creatorBinding: binding };
}

const k_creatorState = createFinancialState({
  theme: 'dark',
  transactions: [createTransaction({ id: 'creator-rent', title: 'Rent', category: 'rent', amount: 80000 })]
});

test('a device with no entries of its own adopts the file without a choice', async () => {
  const { drive, fileId } = await createFileFrom(k_creatorState);
  const emptyDevice = createFinancialState({ theme: 'light', accounts: [], categories: [] });
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: emptyDevice });
  assert.equal(opened.status, 'adopt');
  const adopted = adoptSharedFile(opened, emptyDevice);
  assert.deepEqual(transactionIds(adopted.state), ['creator-rent']);
  assert.equal(adopted.state.theme, 'light');
  assert.equal(adopted.binding.fileId, fileId);
});

test('a device holding only the example data adopts the file directly and drops the example flag (owner answer)', async () => {
  const { drive, fileId } = await createFileFrom(k_creatorState);
  const exampleDevice = seed();
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: exampleDevice });
  assert.equal(opened.status, 'adopt');
  const adopted = adoptSharedFile(opened, exampleDevice);
  assert.equal(adopted.state.demo, false);
  // Example data can hold entries of the person's own, so a copy is still kept.
  assert.equal(adopted.needsRecoveryCopy, true);
  assert.deepEqual(transactionIds(adopted.state), ['creator-rent']);
});

test('a device with its own entries must choose, and the review lists every one-sided record on both sides', async () => {
  const { drive, fileId } = await createFileFrom(k_creatorState);
  const partnerDevice = createFinancialState({
    accounts: [...createFinancialState().accounts, { id: 'partner-savings', name: 'Partner savings', openingBalance: 5000 }],
    transactions: [
      createTransaction({ id: 'partner-rent', title: 'Rent', category: 'rent', amount: 80000 }),
      createTransaction({ id: 'partner-coffee', amount: 300 })
    ]
  });
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: partnerDevice });
  assert.equal(opened.status, 'choose');
  const oneSided = opened.review.oneSided.map(item => `${item.side}:${item.collection}:${item.id}`).sort();
  assert.deepEqual(oneSided, [
    'local:accounts:partner-savings',
    'local:transactions:partner-coffee',
    'local:transactions:partner-rent',
    'remote:transactions:creator-rent'
  ]);
  assert.deepEqual(opened.review.conflicts, []);
});

test('the same ID with different content on both sides is a choice, not a silent pick', async () => {
  const { drive, fileId } = await createFileFrom(k_creatorState);
  const partnerDevice = createFinancialState({ transactions: [createTransaction({ id: 'creator-rent', title: 'Rent', category: 'rent', amount: 79000 })] });
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: partnerDevice });
  assert.equal(opened.status, 'choose');
  const [conflict] = opened.review.conflicts;
  assert.equal(conflict.field, '$record');
  assert.throws(() => mergeIntoSharedFile(opened, partnerDevice, {}), /Choose a side/);
  const joined = mergeIntoSharedFile(opened, partnerDevice, { choices: { [mergeConflictKey(conflict)]: 'local' } });
  assert.equal(joined.state.transactions.find(transaction => transaction.id === 'creator-rent').amount, 79000);
});

test('merging with review keeps what the person keeps, drops duplicates, and the next sync shares the rest', async () => {
  const { drive, fileId, creatorBinding } = await createFileFrom(k_creatorState);
  const partnerDevice = createFinancialState({
    theme: 'light',
    transactions: [
      createTransaction({ id: 'partner-rent', title: 'Rent', category: 'rent', amount: 80000 }),
      createTransaction({ id: 'partner-coffee', amount: 300 })
    ]
  });
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: partnerDevice });
  const duplicateRent = opened.review.oneSided.find(item => item.id === 'partner-rent');
  const joined = mergeIntoSharedFile(opened, partnerDevice, { droppedKeys: new Set([joinItemKey(duplicateRent)]) });
  assert.deepEqual(transactionIds(joined.state), ['creator-rent', 'partner-coffee']);
  assert.equal(joined.state.theme, 'light');

  const synced = await syncSharedFile({ transport: drive.transport, binding: joined.binding, localState: joined.state, createWriteId: createWriteIdSource('partner'), saveProgress: async () => {} });
  assert.equal(synced.status, 'synced');
  let creatorSaved = null;
  const saveCreatorProgress = async progress => {
    creatorSaved = progress;
  };
  await syncSharedFile({ transport: drive.transport, binding: creatorBinding, localState: k_creatorState, createWriteId: createWriteIdSource('creator'), saveProgress: saveCreatorProgress });
  assert.deepEqual(transactionIds(creatorSaved.state), ['creator-rent', 'partner-coffee']);
  assert.equal(creatorSaved.state.theme, 'dark');
});

test('dropping a remote record during the join removes it from the file on the next sync', async () => {
  const { drive, fileId } = await createFileFrom(k_creatorState);
  const partnerDevice = createFinancialState({ transactions: [createTransaction({ id: 'partner-rent', title: 'Rent', category: 'rent', amount: 80000 })] });
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: partnerDevice });
  const remoteRent = opened.review.oneSided.find(item => item.id === 'creator-rent');
  const joined = mergeIntoSharedFile(opened, partnerDevice, { droppedKeys: new Set([joinItemKey(remoteRent)]) });
  await syncSharedFile({ transport: drive.transport, binding: joined.binding, localState: joined.state, createWriteId: createWriteIdSource('partner'), saveProgress: async () => {} });
  assert.deepEqual(transactionIds(parseSharedDocument(drive.headContent(fileId)).ledger), ['partner-rent']);
});

test('a join that would leave a transaction without its account is refused', async () => {
  const { drive, fileId } = await createFileFrom(k_creatorState);
  const partnerDevice = createFinancialState({
    accounts: [...createFinancialState().accounts, { id: 'partner-only', name: 'Partner only', openingBalance: 0 }],
    transactions: [createTransaction({ id: 'partner-coffee', account: 'partner-only' })]
  });
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: partnerDevice });
  const account = opened.review.oneSided.find(item => item.id === 'partner-only');
  assert.throws(() => mergeIntoSharedFile(opened, partnerDevice, { droppedKeys: new Set([joinItemKey(account)]) }), SyntaxError);
});

test('plan years found on one side are kept and a year planned on both sides is a whole-history choice', async () => {
  const plan = (id, year, tolerance) => ({ id, year, revision: 1, months: {}, window: 6, tolerance, drift: 0.1, incomeChanges: [], loanChanges: [] });
  const { drive, fileId } = await createFileFrom({ ...k_creatorState, plans: { 2026: [plan('creator-2026', 2026, 100)], 2027: [plan('creator-2027', 2027, 100)] } });
  const partnerDevice = createFinancialState({ plans: { 2027: [plan('partner-2027', 2027, 200)], 2028: [plan('partner-2028', 2028, 300)] } });
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: partnerDevice });
  const [conflict] = opened.review.conflicts;
  assert.equal(conflict.collection, 'plans');
  assert.equal(conflict.id, '2027');
  const ledger = buildJoinedLedger(opened.review, { choices: { [mergeConflictKey(conflict)]: 'local' } });
  assert.deepEqual(Object.keys(ledger.plans).sort(), ['2026', '2027', '2028']);
  assert.equal(ledger.plans['2027'][0].id, 'partner-2027');
});

test('adopting saves a recovery copy of this device first, and a failed copy blocks the adoption', async context => {
  const storage = installBrowserStorage(context);
  const { drive, fileId } = await createFileFrom(k_creatorState);
  const partnerDevice = createFinancialState({ transactions: [createTransaction({ id: 'partner-coffee' })] });
  await webStorage.writeState(partnerDevice);
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: partnerDevice });
  assert.equal(opened.status, 'choose');
  const adopted = adoptSharedFile(opened, partnerDevice);
  assert.equal(adopted.needsRecoveryCopy, true);

  const originalSetItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (key.startsWith('havensum-shared-file-join-recovery-v1')) {
      throw new Error('Quota exceeded');
    }
    originalSetItem(key, value);
  };
  await assert.rejects(commitSharedFileJoin(webStorage, adopted, partnerDevice), /Quota/);
  assert.deepEqual(transactionIds(await webStorage.readState()), ['partner-coffee']);
  assert.equal(await webStorage.readSharedFileBinding(), null);

  storage.setItem = originalSetItem;
  await commitSharedFileJoin(webStorage, adopted, partnerDevice);
  assert.deepEqual(transactionIds(await webStorage.readState()), ['creator-rent']);
  assert.deepEqual(transactionIds(await webStorage.readSharedFileJoinRecovery()), ['partner-coffee']);
  assert.equal((await webStorage.readSharedFileBinding()).fileId, fileId);
});

test('a second file is merged into the kept file through the one-sided review and is never changed', async () => {
  const { drive, fileId: keptFileId, creatorBinding } = await createFileFrom(k_creatorState);
  const partnerState = createFinancialState({ transactions: [createTransaction({ id: 'partner-coffee' })] });
  const { binding: otherBinding } = await createSharedFile({ transport: drive.transport, localState: partnerState, partnerEmail: k_partnerEmail, createWriteId: createWriteIdSource('partner'), saveProgress: async () => {} });
  const otherRevisions = drive.revisionCount(otherBinding.fileId);

  const sameFile = await openSecondSharedFile({ transport: drive.transport, fileId: keptFileId, localState: k_creatorState, binding: creatorBinding });
  assert.equal(sameFile.status, 'sameFile');
  const opened = await openSecondSharedFile({ transport: drive.transport, fileId: otherBinding.fileId, localState: k_creatorState, binding: creatorBinding });
  assert.equal(opened.status, 'choose');
  assert.deepEqual(opened.review.oneSided.map(item => `${item.side}:${item.id}`).sort(), ['local:creator-rent', 'remote:partner-coffee']);
  const merged = mergeSecondSharedFile(opened, k_creatorState, {});
  assert.equal(merged.binding, undefined);
  const synced = await syncSharedFile({ transport: drive.transport, binding: creatorBinding, localState: merged.state, createWriteId: createWriteIdSource('creator'), saveProgress: async () => {} });
  assert.equal(synced.status, 'synced');
  assert.deepEqual(transactionIds(parseSharedDocument(drive.headContent(keptFileId)).ledger), ['creator-rent', 'partner-coffee']);
  assert.equal(drive.revisionCount(otherBinding.fileId), otherRevisions);
});

test('opening a file that cannot be read or reached changes nothing', async () => {
  const { drive, fileId } = await createFileFrom(k_creatorState);
  drive.failNext('read', 'accessLost');
  assert.equal((await openSharedFile({ transport: drive.transport, fileId, localState: createFinancialState() })).status, 'paused');
  drive.replaceContent(fileId, 'not a shared file');
  assert.equal((await openSharedFile({ transport: drive.transport, fileId, localState: createFinancialState() })).status, 'invalidRemote');
  assert.equal((await openSecondSharedFile({ transport: drive.transport, fileId, localState: createFinancialState() })).status, 'invalidRemote');
});

test('different prediction settings on both sides are a choice when joining', async () => {
  const { drive, fileId } = await createFileFrom({ ...k_creatorState, outlook: { window: 6 } });
  const partnerDevice = createFinancialState({ outlook: { window: 3 } });
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: partnerDevice });
  assert.equal(opened.status, 'choose');
  const [conflict] = opened.review.conflicts;
  assert.equal(conflict.collection, 'outlook');
  const ledger = buildJoinedLedger(opened.review, { droppedKeys: new Set(), choices: { [mergeConflictKey(conflict)]: 'local' } });
  assert.deepEqual(ledger.outlook, { window: 3 });
});

test('a device left with only the unchanged default categories adopts without a choice', async () => {
  const { drive, fileId } = await createFileFrom({ ...k_creatorState, categories: k_creatorState.categories.map(category => ({ ...category, name: `${category.name} (ours)` })) });
  const clearedDevice = createFinancialState({ accounts: [], categories: seed().categories });
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: clearedDevice });
  assert.equal(opened.status, 'adopt');
  const customised = createFinancialState({ accounts: [], categories: [...seed().categories, { id: 'garden', name: 'Garden' }] });
  assert.equal((await openSharedFile({ transport: drive.transport, fileId, localState: customised })).status, 'choose');
});

test('a joined ledger keeps one missing-category warning per kept transaction', async () => {
  const uncategorized = createTransaction({ id: 'uncategorized', category: null });
  const warning = { transactionId: 'uncategorized', categoryId: 'old' };
  const { drive, fileId } = await createFileFrom({ ...k_creatorState, transactions: [...k_creatorState.transactions, uncategorized], migrationCategoryWarnings: [warning] });
  const partnerDevice = createFinancialState({
    transactions: [uncategorized, createTransaction({ id: 'partner-orphan', category: null })],
    migrationCategoryWarnings: [warning, { transactionId: 'partner-orphan', categoryId: 'old' }]
  });
  const opened = await openSharedFile({ transport: drive.transport, fileId, localState: partnerDevice });
  const orphan = opened.review.oneSided.find(item => item.id === 'partner-orphan');
  const ledger = buildJoinedLedger(opened.review, { droppedKeys: new Set([joinItemKey(orphan)]) });
  assert.deepEqual(ledger.migrationCategoryWarnings, [warning]);
});
