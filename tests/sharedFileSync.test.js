import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedFile, syncSharedFile, applySyncReview, k_maximumWriteAttempts } from '../src/sharedFileSync.js';
import { openSharedFile, adoptSharedFile, mergeIntoSharedFile } from '../src/sharedFileJoin.js';
import { createSharedDocument, parseSharedDocument, sharedLedgerOf } from '../src/sharedFileDocument.js';
import { mergeConflictKey } from '../src/mergeReview.js';
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

function addTransaction(state, overrides) {
  return { ...state, transactions: [...state.transactions, createTransaction(overrides)] };
}

function transactionIds(state) {
  return state.transactions.map(transaction => transaction.id).sort();
}

function remoteLedger(drive, fileId) {
  return parseSharedDocument(drive.headContent(fileId)).ledger;
}

// A device keeps its ledger and link. Each sync saves both together through
// saveProgress, which a test can make fail to simulate a stopped app.
function createDevice(name, transport, state) {
  const device = { name, state, binding: null, createWriteId: createWriteIdSource(name), failNextSave: false };
  device.saveProgress = async ({ state: savedState, binding }) => {
    if (device.failNextSave) {
      device.failNextSave = false;
      throw new Error('The app stopped');
    }
    device.state = savedState;
    device.binding = binding;
  };
  device.sync = () => syncSharedFile({ transport, binding: device.binding, localState: device.state, createWriteId: device.createWriteId, saveProgress: device.saveProgress });
  device.resolve = (outcome, choices) => {
    const applied = applySyncReview({ review: outcome.review, choices, currentState: device.state, binding: device.binding });
    if (applied.status === 'resolved') {
      device.state = applied.state;
      device.binding = applied.binding;
    }
    return applied;
  };
  return device;
}

async function connectTwoDevices({ creatorState = createFinancialState({ theme: 'dark' }), partnerState = createFinancialState({ theme: 'light', categories: [], accounts: [] }) } = {}) {
  const drive = createInMemoryDriveTransport();
  const creator = createDevice('creator', drive.transport, creatorState);
  const partner = createDevice('partner', drive.transport, partnerState);
  const created = await createSharedFile({ transport: drive.transport, localState: creator.state, partnerEmail: k_partnerEmail, createWriteId: creator.createWriteId });
  assert.equal(created.status, 'created');
  creator.binding = created.binding;
  const opened = await openSharedFile({ transport: drive.transport, fileId: created.binding.fileId, localState: partner.state });
  assert.equal(opened.status, 'adopt');
  const adopted = adoptSharedFile(opened, partner.state);
  partner.state = adopted.state;
  partner.binding = adopted.binding;
  return { drive, creator, partner, fileId: created.binding.fileId };
}

test('creating the file shares it with the partner and uploads only the shared collections', async () => {
  const { drive, creator, fileId } = await connectTwoDevices();
  assert.equal(drive.partnerEmailOf(fileId), k_partnerEmail);
  const document = JSON.parse(drive.headContent(fileId));
  assert.equal(document.ledger.theme, undefined);
  assert.deepEqual(document.ledger.accounts, creator.state.accounts);
  assert.equal(creator.binding.fileId, fileId);
});

test('create is blocked while example data is loaded (G07)', async () => {
  const drive = createInMemoryDriveTransport();
  await assert.rejects(
    createSharedFile({ transport: drive.transport, localState: createFinancialState({ demo: true }), partnerEmail: k_partnerEmail, createWriteId: createWriteIdSource('demo') }),
    /example data/
  );
});

test('independent edits on two devices merge silently and each keeps its own theme', async () => {
  const { drive, creator, partner, fileId } = await connectTwoDevices();
  creator.state = addTransaction(creator.state, { id: 'creator-coffee' });
  partner.state = addTransaction(partner.state, { id: 'partner-bread', account: 'shared' });
  assert.equal((await creator.sync()).status, 'synced');
  assert.equal((await partner.sync()).status, 'synced');
  assert.equal((await creator.sync()).status, 'synced');
  assert.deepEqual(transactionIds(creator.state), ['creator-coffee', 'partner-bread']);
  assert.deepEqual(transactionIds(partner.state), ['creator-coffee', 'partner-bread']);
  assert.deepEqual(transactionIds(remoteLedger(drive, fileId)), ['creator-coffee', 'partner-bread']);
  assert.equal(creator.state.theme, 'dark');
  assert.equal(partner.state.theme, 'light');
});

test('a sync with nothing new writes nothing', async () => {
  const { drive, creator, fileId } = await connectTwoDevices();
  const revisionsBefore = drive.revisionCount(fileId);
  assert.equal((await creator.sync()).status, 'synced');
  assert.equal(drive.revisionCount(fileId), revisionsBefore);
});

test('a same-field edit waits for review, writes nothing and leaves local data unchanged', async () => {
  const { drive, creator, partner, fileId } = await connectTwoDevices({ creatorState: createFinancialState({ transactions: [createTransaction()] }) });
  await partner.sync();
  creator.state = { ...creator.state, transactions: [createTransaction({ amount: 1500 })] };
  partner.state = { ...partner.state, transactions: [createTransaction({ amount: 1700 })] };
  await creator.sync();
  const revisionsBefore = drive.revisionCount(fileId);
  const partnerBefore = partner.state;
  const outcome = await partner.sync();
  assert.equal(outcome.status, 'needsReview');
  assert.equal(drive.revisionCount(fileId), revisionsBefore);
  assert.equal(partner.state, partnerBefore);
  const [conflict] = outcome.review.merge.conflicts;
  assert.equal(conflict.field, 'amount');
  assert.equal(conflict.local, 1700);
  assert.equal(conflict.remote, 1500);

  assert.equal(partner.resolve(outcome, { [mergeConflictKey(conflict)]: 'remote' }).status, 'resolved');
  assert.equal((await partner.sync()).status, 'synced');
  await creator.sync();
  assert.equal(partner.state.transactions[0].amount, 1500);
  assert.equal(creator.state.transactions[0].amount, 1500);
});

test('choosing this device in a review is written to the file', async () => {
  const { drive, creator, partner, fileId } = await connectTwoDevices({ creatorState: createFinancialState({ transactions: [createTransaction()] }) });
  await partner.sync();
  creator.state = { ...creator.state, transactions: [createTransaction({ amount: 1500 })] };
  partner.state = { ...partner.state, transactions: [createTransaction({ amount: 1700 })] };
  await creator.sync();
  const outcome = await partner.sync();
  const [conflict] = outcome.review.merge.conflicts;
  partner.resolve(outcome, { [mergeConflictKey(conflict)]: 'local' });
  await partner.sync();
  assert.equal(remoteLedger(drive, fileId).transactions[0].amount, 1700);
  await creator.sync();
  assert.equal(creator.state.transactions[0].amount, 1700);
});

test('an unfinished or stale review is refused', async () => {
  const { creator, partner } = await connectTwoDevices({ creatorState: createFinancialState({ transactions: [createTransaction()] }) });
  await partner.sync();
  creator.state = { ...creator.state, transactions: [createTransaction({ amount: 1500 })] };
  partner.state = { ...partner.state, transactions: [createTransaction({ amount: 1700 })] };
  await creator.sync();
  const outcome = await partner.sync();
  const unfinished = applySyncReview({ review: outcome.review, choices: {}, currentState: partner.state, binding: partner.binding });
  assert.equal(unfinished.status, 'incomplete');
  const editedMeanwhile = addTransaction(partner.state, { id: 'during-review' });
  const [conflict] = outcome.review.merge.conflicts;
  const choices = { [mergeConflictKey(conflict)]: 'local' };
  const stale = applySyncReview({ review: outcome.review, choices, currentState: editedMeanwhile, binding: partner.binding });
  assert.equal(stale.status, 'stale');
  const otherFile = applySyncReview({ review: outcome.review, choices, currentState: partner.state, binding: { ...partner.binding, fileId: 'file-other' } });
  assert.equal(otherFile.status, 'stale');
});

test('asking to sync again while a review is open recomputes the same review instead of overwriting', async () => {
  const { drive, creator, partner, fileId } = await connectTwoDevices({ creatorState: createFinancialState({ transactions: [createTransaction()] }) });
  await partner.sync();
  creator.state = { ...creator.state, transactions: [createTransaction({ amount: 1500 })] };
  partner.state = { ...partner.state, transactions: [createTransaction({ amount: 1700 })] };
  await creator.sync();
  assert.equal((await partner.sync()).status, 'needsReview');
  const revisionsBefore = drive.revisionCount(fileId);
  assert.equal((await partner.sync()).status, 'needsReview');
  assert.equal(drive.revisionCount(fileId), revisionsBefore);
  assert.equal(remoteLedger(drive, fileId).transactions[0].amount, 1500);
});

test('an edit on one device and a delete on the other wait for review', async () => {
  const { creator, partner } = await connectTwoDevices({ creatorState: createFinancialState({ transactions: [createTransaction()] }) });
  await partner.sync();
  creator.state = { ...creator.state, transactions: [] };
  partner.state = { ...partner.state, transactions: [createTransaction({ title: 'Renamed' })] };
  await creator.sync();
  const outcome = await partner.sync();
  assert.equal(outcome.status, 'needsReview');
  assert.equal(outcome.review.merge.conflicts[0].field, '$record');
});

test('concurrent plan revisions for one year are reviewed as whole histories', async () => {
  const { creator, partner } = await connectTwoDevices();
  const revision = (id, tolerance) => ({ id, year: 2027, revision: 1, months: {}, window: 6, tolerance, drift: 0.1, incomeChanges: [], loanChanges: [] });
  creator.state = { ...creator.state, plans: { 2027: [revision('plan-creator', 1000)] } };
  partner.state = { ...partner.state, plans: { 2027: [revision('plan-partner', 2000)] } };
  await creator.sync();
  const outcome = await partner.sync();
  assert.equal(outcome.status, 'needsReview');
  assert.equal(outcome.review.merge.conflicts[0].field, '$planYear');
});

test('a write overwritten before it is verified is re-merged so neither side is lost', async () => {
  const { drive, creator, partner, fileId } = await connectTwoDevices();
  const rootDocument = parseSharedDocument(drive.headContent(fileId));
  creator.state = addTransaction(creator.state, { id: 'creator-coffee' });
  // The partner merged against the root before the creator's write and overwrites it.
  const partnerLedger = addTransaction(partner.state, { id: 'partner-bread' });
  drive.onNextWriteLanded(() => {
    drive.replaceContent(fileId, createSharedDocument(partnerLedger, { writeId: 'write-partner-stale', parent: rootDocument }));
  });
  const outcome = await creator.sync();
  assert.equal(outcome.status, 'synced');
  assert.deepEqual(transactionIds(remoteLedger(drive, fileId)), ['creator-coffee', 'partner-bread']);
  assert.deepEqual(transactionIds(creator.state), ['creator-coffee', 'partner-bread']);
});

test('a verified write that a slower partner overwrites later is restored on the next sync', async () => {
  const { drive, creator, fileId } = await connectTwoDevices();
  const rootDocument = parseSharedDocument(drive.headContent(fileId));
  creator.state = addTransaction(creator.state, { id: 'creator-coffee' });
  await creator.sync();
  const slowPartnerLedger = addTransaction(createFinancialState(), { id: 'partner-bread' });
  drive.replaceContent(fileId, createSharedDocument(slowPartnerLedger, { writeId: 'write-partner-slow', parent: rootDocument }));
  assert.equal((await creator.sync()).status, 'synced');
  assert.deepEqual(transactionIds(remoteLedger(drive, fileId)), ['creator-coffee', 'partner-bread']);
});

test('a deletion made by the partner after our read is not undone by our re-merge', async () => {
  const { drive, creator, partner, fileId } = await connectTwoDevices({ creatorState: createFinancialState({ transactions: [createTransaction({ id: 'old-entry' })] }) });
  await partner.sync();
  const headBefore = parseSharedDocument(drive.headContent(fileId));
  creator.state = addTransaction(creator.state, { id: 'creator-coffee' });
  drive.onNextWriteLanded(() => {
    drive.replaceContent(fileId, createSharedDocument({ ...partner.state, transactions: [] }, { writeId: 'write-partner-delete', parent: headBefore }));
  });
  await creator.sync();
  assert.deepEqual(transactionIds(remoteLedger(drive, fileId)), ['creator-coffee']);
});

test('a file that keeps being overwritten stops after a bounded number of attempts without losing local changes', async () => {
  const { drive, creator, fileId } = await connectTwoDevices();
  const rootDocument = parseSharedDocument(drive.headContent(fileId));
  creator.state = addTransaction(creator.state, { id: 'creator-coffee' });
  for (let attempt = 0; attempt < k_maximumWriteAttempts; attempt += 1) {
    drive.onNextWriteLanded(() => {
      drive.replaceContent(fileId, createSharedDocument(createFinancialState(), { writeId: `write-busy-${attempt}`, parent: rootDocument }));
    });
  }
  const outcome = await creator.sync();
  assert.equal(outcome.status, 'retryLater');
  assert.deepEqual(transactionIds(creator.state), ['creator-coffee']);
  assert.equal((await creator.sync()).status, 'synced');
  assert.deepEqual(transactionIds(remoteLedger(drive, fileId)), ['creator-coffee']);
});

test('a write that fails before landing leaves the file unchanged and keeps every local entry', async () => {
  const { drive, creator, fileId } = await connectTwoDevices();
  creator.state = addTransaction(creator.state, { id: 'creator-coffee' });
  const revisions = drive.revisionCount(fileId);
  drive.failNext('write', 'offline');
  const outcome = await creator.sync();
  assert.equal(outcome.status, 'offline');
  assert.deepEqual(transactionIds(creator.state), ['creator-coffee']);
  assert.equal(drive.revisionCount(fileId), revisions);
  assert.equal((await creator.sync()).status, 'synced');
  assert.deepEqual(transactionIds(remoteLedger(drive, fileId)), ['creator-coffee']);
});

test('a write that lands but whose reply is lost is recognised on the next sync', async () => {
  const { drive, creator, partner, fileId } = await connectTwoDevices();
  partner.state = addTransaction(partner.state, { id: 'partner-bread', account: 'shared' });
  await partner.sync();
  creator.state = addTransaction(creator.state, { id: 'creator-coffee' });
  drive.onNextWriteLanded(() => {
    throw new Error('connection reset');
  });
  assert.equal((await creator.sync()).status, 'retryLater');
  assert.equal((await creator.sync()).status, 'synced');
  assert.deepEqual(transactionIds(creator.state), ['creator-coffee', 'partner-bread']);
  assert.deepEqual(transactionIds(remoteLedger(drive, fileId)), ['creator-coffee', 'partner-bread']);
});

test('after a lost write reply, the partner deleting the new entry is not undone (review B1)', async () => {
  const { drive, creator, partner, fileId } = await connectTwoDevices();
  creator.state = addTransaction(creator.state, { id: 'creator-coffee' });
  drive.onNextWriteLanded(() => {
    throw new Error('connection reset');
  });
  assert.equal((await creator.sync()).status, 'retryLater');
  await partner.sync();
  assert.deepEqual(transactionIds(partner.state), ['creator-coffee']);
  partner.state = { ...partner.state, transactions: [] };
  await partner.sync();
  assert.equal((await creator.sync()).status, 'synced');
  assert.deepEqual(transactionIds(creator.state), []);
  assert.deepEqual(transactionIds(remoteLedger(drive, fileId)), []);
});

test('after a lost write reply, the partner setting a field back is not undone (review B1)', async () => {
  const { drive, creator, partner, fileId } = await connectTwoDevices({ creatorState: createFinancialState({ transactions: [createTransaction({ amount: 1000 })] }) });
  await partner.sync();
  creator.state = { ...creator.state, transactions: [createTransaction({ amount: 2000 })] };
  drive.onNextWriteLanded(() => {
    throw new Error('connection reset');
  });
  await creator.sync();
  await partner.sync();
  partner.state = { ...partner.state, transactions: [createTransaction({ amount: 1000 })] };
  await partner.sync();
  assert.equal((await creator.sync()).status, 'synced');
  assert.equal(creator.state.transactions[0].amount, 1000);
  assert.equal(remoteLedger(drive, fileId).transactions[0].amount, 1000);
});

test('when the merged ledger cannot be saved, nothing is written', async () => {
  const { drive, creator, fileId } = await connectTwoDevices();
  creator.state = addTransaction(creator.state, { id: 'creator-coffee' });
  const revisions = drive.revisionCount(fileId);
  creator.failNextSave = true;
  const outcome = await creator.sync();
  assert.equal(outcome.status, 'retryLater');
  assert.equal(outcome.reason, 'progressNotSaved');
  assert.equal(drive.revisionCount(fileId), revisions);
  assert.equal((await creator.sync()).status, 'synced');
  assert.deepEqual(transactionIds(remoteLedger(drive, fileId)), ['creator-coffee']);
});

test('a category deleted on one device while the other starts using it waits for review (review B2)', async () => {
  const { drive, creator, partner, fileId } = await connectTwoDevices();
  await partner.sync();
  creator.state = { ...creator.state, categories: creator.state.categories.filter(category => category.id !== 'shopping') };
  await creator.sync();
  partner.state = addTransaction(partner.state, { id: 'new-shoes', category: 'shopping' });
  const revisions = drive.revisionCount(fileId);
  const outcome = await partner.sync();
  assert.equal(outcome.status, 'needsReview');
  const [conflict] = outcome.review.merge.conflicts;
  assert.equal(conflict.collection, 'categories');
  assert.equal(conflict.id, 'shopping');
  assert.equal(conflict.remote, undefined);
  assert.equal(drive.revisionCount(fileId), revisions);
  assert.equal(partner.resolve(outcome, { [mergeConflictKey(conflict)]: 'local' }).status, 'resolved');
  assert.equal((await partner.sync()).status, 'synced');
  await creator.sync();
  assert.ok(creator.state.categories.some(category => category.id === 'shopping'));
  assert.equal(creator.state.transactions[0].category, 'shopping');
});

test('choosing the deletion of an account that a new entry uses is refused with its reason (review B2)', async () => {
  const { creator, partner } = await connectTwoDevices();
  await partner.sync();
  creator.state = { ...creator.state, accounts: creator.state.accounts.filter(account => account.id !== 'shared') };
  await creator.sync();
  partner.state = addTransaction(partner.state, { id: 'joint-dinner', account: 'shared' });
  const outcome = await partner.sync();
  assert.equal(outcome.status, 'needsReview');
  const [conflict] = outcome.review.merge.conflicts;
  assert.equal(conflict.collection, 'accounts');
  const refused = partner.resolve(outcome, { [mergeConflictKey(conflict)]: 'remote' });
  assert.equal(refused.status, 'invalid');
  assert.match(refused.message, /account/i);
});

test('changes that combine into an invalid ledger are reported and nothing is written', async () => {
  const expense = createTransaction({ id: 'dinner', amount: 4000 });
  const { drive, creator, partner, fileId } = await connectTwoDevices({ creatorState: createFinancialState({ transactions: [expense] }) });
  await partner.sync();
  const payback = (id, amount) => createTransaction({ id, type: 'reimbursement', title: 'Half of dinner', amount, linkedId: 'dinner' });
  creator.state = addTransaction(creator.state, payback('payback-creator', 3000));
  partner.state = addTransaction(partner.state, payback('payback-partner', 3000));
  await creator.sync();
  const revisions = drive.revisionCount(fileId);
  const before = partner.state;
  const outcome = await partner.sync();
  assert.equal(outcome.status, 'invalidMerge');
  assert.match(outcome.message, /reimburse/i);
  assert.equal(drive.revisionCount(fileId), revisions);
  assert.equal(partner.state, before);
});

test('lost access, a missing file, an expired session and no network pause sync and keep everything', async () => {
  const cases = [['accessLost', 'paused'], ['fileMissing', 'paused'], ['expiredSession', 'reconnect'], ['offline', 'offline']];
  for (const [reason, expectedStatus] of cases) {
    const { drive, creator } = await connectTwoDevices();
    creator.state = addTransaction(creator.state, { id: 'unsynced' });
    const before = { state: creator.state, binding: creator.binding };
    drive.failNext('read', reason);
    const outcome = await creator.sync();
    assert.equal(outcome.status, expectedStatus, reason);
    assert.equal(creator.state, before.state);
    assert.equal(creator.binding, before.binding);
  }
});

test('a deleted file pauses sync instead of re-creating it', async () => {
  const { drive, creator, fileId } = await connectTwoDevices();
  drive.deleteFile(fileId);
  const outcome = await creator.sync();
  assert.equal(outcome.status, 'paused');
  assert.equal(outcome.reason, 'fileMissing');
});

test('a corrupted remote file is never merged or overwritten and its content can be downloaded', async () => {
  const { drive, creator, fileId } = await connectTwoDevices();
  drive.replaceContent(fileId, '{"format":"havensum-shared-file", broken');
  creator.state = addTransaction(creator.state, { id: 'unsynced' });
  const before = creator.state;
  const revisions = drive.revisionCount(fileId);
  const outcome = await creator.sync();
  assert.equal(outcome.status, 'invalidRemote');
  assert.match(outcome.message, /cannot be read/);
  assert.equal(outcome.remoteContent, '{"format":"havensum-shared-file", broken');
  assert.equal(creator.state, before);
  assert.equal(drive.revisionCount(fileId), revisions);
});

test('an older-schema ledger written into the file is migrated and merged', async () => {
  const { drive, creator, fileId } = await connectTwoDevices();
  const head = parseSharedDocument(drive.headContent(fileId));
  const legacyLedger = sharedLedgerOf({ ...createFinancialState({ version: 2 }), transactions: [createTransaction({ id: 'legacy-entry' })] });
  drive.replaceContent(fileId, JSON.stringify({ format: 'havensum-shared-file', formatVersion: 1, writeId: 'write-legacy', lineage: [head.writeId], ledger: legacyLedger }));
  assert.equal((await creator.sync()).status, 'synced');
  assert.deepEqual(transactionIds(creator.state), ['legacy-entry']);
  assert.equal(creator.state.version, 4);
});

test('a replaced file with no shared history needs the one-sided-record review', async () => {
  const { drive, creator, fileId } = await connectTwoDevices();
  drive.replaceContent(fileId, createSharedDocument(createFinancialState(), { writeId: 'write-unrelated', parent: null }));
  creator.state = addTransaction(creator.state, { id: 'creator-coffee' });
  const outcome = await creator.sync();
  assert.equal(outcome.status, 'needsJoin');
  assert.equal(outcome.opened.fileId, fileId);
  assert.deepEqual(outcome.opened.review.oneSided.map(item => item.id), ['creator-coffee']);
  const joined = mergeIntoSharedFile(outcome.opened, creator.state, {});
  creator.state = joined.state;
  creator.binding = joined.binding;
  assert.equal((await creator.sync()).status, 'synced');
  assert.deepEqual(transactionIds(remoteLedger(drive, fileId)), ['creator-coffee']);
});

test('without a stored link there is nothing to sync', async () => {
  const drive = createInMemoryDriveTransport();
  const outcome = await syncSharedFile({ transport: drive.transport, binding: null, localState: createFinancialState(), createWriteId: createWriteIdSource('none'), saveProgress: async () => {} });
  assert.equal(outcome.status, 'notConnected');
});

test('the shared missing-category review stays accepted once either person accepts it, and new entries reach both', async () => {
  const uncategorized = createTransaction({ id: 'uncategorized', category: null });
  const warning = { transactionId: 'uncategorized', categoryId: 'old-category' };
  const { creator, partner } = await connectTwoDevices({
    creatorState: createFinancialState({ transactions: [uncategorized], migrationCategoryWarnings: [warning] })
  });
  assert.deepEqual(partner.state.migrationCategoryWarnings, [warning]);
  const { migrationCategoryWarnings, ...accepted } = creator.state;
  creator.state = accepted;
  await creator.sync();
  await partner.sync();
  assert.equal(partner.state.migrationCategoryWarnings, undefined);

  const second = createTransaction({ id: 'second-uncategorized', category: null });
  const secondWarning = { transactionId: 'second-uncategorized', categoryId: 'gone' };
  partner.state = { ...addTransaction(partner.state, second), migrationCategoryWarnings: [secondWarning] };
  await partner.sync();
  await creator.sync();
  assert.deepEqual(creator.state.migrationCategoryWarnings, [secondWarning]);
});

test('creating a file while offline reports it and stores no link', async () => {
  const drive = createInMemoryDriveTransport();
  drive.failNext('create', 'offline');
  const outcome = await createSharedFile({ transport: drive.transport, localState: createFinancialState(), partnerEmail: k_partnerEmail, createWriteId: createWriteIdSource('offline') });
  assert.equal(outcome.status, 'offline');
  assert.equal(outcome.binding, undefined);
});

test('a review prepared before another sync finished is refused as stale', async () => {
  const { creator, partner } = await connectTwoDevices({ creatorState: createFinancialState({ transactions: [createTransaction()] }) });
  await partner.sync();
  creator.state = { ...creator.state, transactions: [createTransaction({ amount: 1500 })] };
  partner.state = { ...partner.state, transactions: [createTransaction({ amount: 1700 })] };
  await creator.sync();
  const outcome = await partner.sync();
  const [conflict] = outcome.review.merge.conflicts;
  const newerLink = { ...partner.binding, lastSeenRevision: 'rev-newer' };
  const applied = applySyncReview({ review: outcome.review, choices: { [mergeConflictKey(conflict)]: 'remote' }, currentState: partner.state, binding: newerLink });
  assert.equal(applied.status, 'stale');
});
