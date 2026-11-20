import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedDocument, parseSharedDocument, sharedLedgerOf } from '../src/sharedFileDocument.js';
import { createBinding, recordIncorporatedSnapshots, selectBaseline, k_knownSnapshotLimit } from '../src/sharedFileBinding.js';
import { readSharedFileBinding, writeSharedFileBinding, readSnapshot, writeSnapshot } from '../src/storage.web.js';
import { installBrowserStorage } from './helpers/browserStorage.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

const k_fileId = 'file-shared';
const k_otherFileId = 'file-other';

function documentOf(state, writeId, parent = null) {
  return parseSharedDocument(createSharedDocument(state, { writeId, parent }));
}

test('a baseline from one shared file is never used against another file', () => {
  const first = documentOf(createFinancialState(), 'write-a');
  const binding = createBinding(k_fileId, { revision: 'rev-1', snapshots: [first] });
  assert.deepEqual(selectBaseline(binding, k_fileId, first).ledger, first.ledger);
  assert.equal(selectBaseline(binding, k_otherFileId, first), null);
  assert.equal(selectBaseline(null, k_fileId, first), null);
});

test('the baseline is the newest known snapshot the remote file descends from', () => {
  const state = createFinancialState();
  const root = documentOf(state, 'write-root');
  const ours = documentOf(createFinancialState({ transactions: [createTransaction()] }), 'write-ours', root);
  const theirsFromRoot = documentOf(createFinancialState({ transactions: [createTransaction({ id: 'theirs' })] }), 'write-theirs', root);
  const binding = createBinding(k_fileId, { revision: 'rev-ours', snapshots: [root, ours] });
  assert.deepEqual(selectBaseline(binding, k_fileId, documentOf(state, 'write-later', ours)).ledger, ours.ledger);
  // The partner overwrote our write without reading it: fall back to the root.
  assert.deepEqual(selectBaseline(binding, k_fileId, theirsFromRoot).ledger, root.ledger);
  // A replaced file with no shared history has no baseline.
  assert.equal(selectBaseline(binding, k_fileId, documentOf(state, 'write-unrelated')), null);
});

test('known snapshots are de-duplicated and bounded', () => {
  let binding = createBinding(k_fileId, { revision: null, snapshots: [] });
  let parent = null;
  for (let index = 0; index < k_knownSnapshotLimit + 3; index += 1) {
    const document = documentOf(createFinancialState(), `write-${index}`, parent);
    binding = recordIncorporatedSnapshots(binding, [document, document], `rev-${index}`);
    parent = document;
  }
  assert.equal(binding.knownSnapshots.length, k_knownSnapshotLimit);
  assert.equal(binding.knownSnapshots.at(-1).writeId, `write-${k_knownSnapshotLimit + 2}`);
  assert.equal(binding.lastSeenRevision, `rev-${k_knownSnapshotLimit + 2}`);
});

test('the baseline in use is kept even when newer snapshots fill the limit', () => {
  const root = documentOf(createFinancialState(), 'write-root');
  let binding = createBinding(k_fileId, { revision: 'rev-root', snapshots: [root] });
  for (let index = 0; index < k_knownSnapshotLimit + 2; index += 1) {
    binding = recordIncorporatedSnapshots(binding, [documentOf(createFinancialState(), `write-${index}`, root)], `rev-${index}`, { pinnedWriteId: root.writeId });
  }
  assert.equal(binding.knownSnapshots.length, k_knownSnapshotLimit);
  assert.equal(binding.knownSnapshots[0].writeId, root.writeId);
  assert.equal(binding.knownSnapshots.at(-1).writeId, `write-${k_knownSnapshotLimit + 1}`);
});

test('the shared-file baseline is stored separately and leaves melo-sync-base untouched', async context => {
  const storage = installBrowserStorage(context);
  const backupBaseline = createFinancialState({ transactions: [createTransaction({ id: 'manual-baseline' })] });
  await writeSnapshot(backupBaseline);
  const encodedBackupBaseline = storage.getItem('melo-sync-base');
  const document = documentOf(createFinancialState(), 'write-a');
  await writeSharedFileBinding(createBinding(k_fileId, { revision: 'rev-1', snapshots: [document] }));
  assert.equal(storage.getItem('melo-sync-base'), encodedBackupBaseline);
  assert.deepEqual(await readSnapshot(), backupBaseline);
  const binding = await readSharedFileBinding();
  assert.equal(binding.fileId, k_fileId);
  assert.equal(binding.lastSeenRevision, 'rev-1');
  assert.deepEqual(binding.knownSnapshots, [{ writeId: 'write-a', ledger: document.ledger }]);
});

test('no stored binding means not connected', async context => {
  installBrowserStorage(context);
  assert.equal(await readSharedFileBinding(), null);
});

test('an older-schema snapshot in a stored binding is migrated on read', async context => {
  const storage = installBrowserStorage(context);
  const legacyLedger = sharedLedgerOf(createFinancialState({ version: 2 }));
  storage.setItem('havensum-shared-file-binding-v1', JSON.stringify({
    version: 1, fileId: k_fileId, lastSeenRevision: null, knownSnapshots: [{ writeId: 'write-legacy', ledger: legacyLedger }]
  }));
  const binding = await readSharedFileBinding();
  assert.equal(binding.knownSnapshots[0].ledger.version, 5);
  assert.deepEqual(binding.knownSnapshots[0].ledger.plans, {});
});

test('an unreadable stored binding is kept as a recovery copy and treated as not connected', async context => {
  const storage = installBrowserStorage(context);
  const damagedBindings = ['{broken', JSON.stringify({ version: 1, fileId: '', lastSeenRevision: null, knownSnapshots: [] })];
  for (const damaged of damagedBindings) {
    storage.setItem('havensum-shared-file-binding-v1', damaged);
    assert.equal(await readSharedFileBinding(), null);
  }
  assert.equal(storage.getItem('havensum-shared-file-binding-v1:recovery:invalid'), damagedBindings[0]);
  assert.equal(storage.getItem('havensum-shared-file-binding-v1:recovery:invalid:1'), damagedBindings[1]);
});

test('an example session never stores a shared-file binding', async context => {
  const storage = installBrowserStorage(context, '?demo=1');
  await writeSharedFileBinding(createBinding(k_fileId, { revision: 'rev-1', snapshots: [] }));
  assert.equal(storage.getItem('havensum-shared-file-binding-v1'), null);
  assert.equal(await readSharedFileBinding(), null);
});
