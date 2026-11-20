import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedDocument, parseSharedDocument, k_sharedStateKeys, k_deviceStateKeys, sharedLedgerOf, withDeviceKeys } from '../src/sharedFileDocument.js';
import { seed } from '../src/seed.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

const k_firstWriteId = 'write-first';

test('the shared file carries financial collections and leaves every device key out', () => {
  const state = createFinancialState({
    theme: 'dark',
    demo: false,
    preferences: { visibility: 'shared', cushion: true },
    transactions: [createTransaction()]
  });
  const encodedDocument = createSharedDocument(state, { writeId: k_firstWriteId, parent: null });
  const document = JSON.parse(encodedDocument);
  assert.equal(document.writeId, k_firstWriteId);
  assert.deepEqual(document.lineage, []);
  for (const deviceKey of ['theme', 'demo', 'preferences']) {
    assert.equal(Object.hasOwn(document.ledger, deviceKey), false, `${deviceKey} stays on the device`);
  }
  assert.deepEqual(document.ledger.transactions, [createTransaction()]);
});

test('every top-level key the app stores is classified as shared or device-only', () => {
  const exampleState = seed();
  const knownKeys = new Set([...k_sharedStateKeys, ...k_deviceStateKeys]);
  for (const key of Object.keys(exampleState)) {
    assert.ok(knownKeys.has(key), `${key} must be classified`);
  }
  for (const sharedKey of ['accounts', 'categories', 'transactions', 'loans', 'events', 'plans', 'outlook', 'paybackTasks', 'paybackTasksVersion', 'migrationCategoryWarnings']) {
    assert.ok(k_sharedStateKeys.includes(sharedKey), `${sharedKey} is shared`);
  }
  assert.deepEqual([...k_deviceStateKeys].sort(), ['demo', 'preferences', 'theme']);
});

test('an unclassified top-level key stays on the device instead of reaching the partner', () => {
  const state = { ...createFinancialState(), localExperiment: { secret: true } };
  const document = JSON.parse(createSharedDocument(state, { writeId: k_firstWriteId, parent: null }));
  assert.equal(Object.hasOwn(document.ledger, 'localExperiment'), false);
});

test('reading the file keeps the reading device theme, preferences and example flag', () => {
  const writer = createFinancialState({ theme: 'dark', preferences: { visibility: 'personal' } });
  const reader = createFinancialState({ theme: 'light', preferences: { cushion: false } });
  const { ledger } = parseSharedDocument(createSharedDocument(writer, { writeId: k_firstWriteId, parent: null }));
  const readerState = withDeviceKeys(ledger, reader);
  assert.equal(readerState.theme, 'light');
  assert.deepEqual(readerState.preferences, { cushion: false });
  assert.equal(readerState.demo, false);
});

test('the pending missing-category review travels with the shared file (owner answer)', () => {
  const transaction = createTransaction({ category: null });
  const state = createFinancialState({
    transactions: [transaction],
    migrationCategoryWarnings: [{ transactionId: transaction.id, categoryId: 'old-category' }]
  });
  const { ledger } = parseSharedDocument(createSharedDocument(state, { writeId: k_firstWriteId, parent: null }));
  assert.deepEqual(ledger.migrationCategoryWarnings, [{ transactionId: transaction.id, categoryId: 'old-category' }]);
});

test('each write records its parent so later readers can find a common ancestor', () => {
  const state = createFinancialState();
  const first = parseSharedDocument(createSharedDocument(state, { writeId: 'write-a', parent: null }));
  const second = parseSharedDocument(createSharedDocument(state, { writeId: 'write-b', parent: first }));
  const third = parseSharedDocument(createSharedDocument(state, { writeId: 'write-c', parent: second }));
  assert.deepEqual(third.lineage, ['write-a', 'write-b']);
});

test('an older-schema ledger in the file is migrated in memory', () => {
  const legacyLedger = createFinancialState({ version: 2, accounts: [{ id: 'savings', name: 'Savings', openingBalance: 1000, interest: 3, interestStart: '2026-01' }] });
  const encodedDocument = JSON.stringify({ format: 'havensum-shared-file', formatVersion: 1, writeId: 'write-legacy', lineage: [], ledger: sharedLedgerOf(legacyLedger) });
  const { ledger } = parseSharedDocument(encodedDocument);
  assert.equal(ledger.version, 5);
  assert.deepEqual(ledger.accounts[0].interestSchedule, [{ since: '2026-01', rate: 3 }]);
  assert.deepEqual(ledger.plans, {});
});

test('a hand-edited file with device keys is read without taking them', () => {
  const ledger = { ...sharedLedgerOf(createFinancialState()), theme: 'dark', demo: true };
  const encodedDocument = JSON.stringify({ format: 'havensum-shared-file', formatVersion: 1, writeId: 'write-hand', lineage: [], ledger });
  const parsed = parseSharedDocument(encodedDocument);
  assert.equal(Object.hasOwn(parsed.ledger, 'theme'), false);
  assert.equal(Object.hasOwn(parsed.ledger, 'demo'), false);
});

test('a transaction whose category is missing in the file opens uncategorized with a shared review', () => {
  const ledger = sharedLedgerOf(createFinancialState({ transactions: [createTransaction({ category: 'gone' })] }));
  const encodedDocument = JSON.stringify({ format: 'havensum-shared-file', formatVersion: 1, writeId: 'write-missing', lineage: [], ledger });
  const parsed = parseSharedDocument(encodedDocument);
  assert.equal(parsed.ledger.transactions[0].category, null);
  assert.deepEqual(parsed.ledger.migrationCategoryWarnings, [{ transactionId: 'weekly-shopping', categoryId: 'gone' }]);
});

test('unreadable, foreign, newer or invalid files are refused with a readable error', () => {
  const validLedger = sharedLedgerOf(createFinancialState());
  const invalidDocuments = [
    '{not json',
    JSON.stringify({ format: 'something-else', formatVersion: 1, writeId: 'w', lineage: [], ledger: validLedger }),
    JSON.stringify({ format: 'havensum-shared-file', formatVersion: 2, writeId: 'w', lineage: [], ledger: validLedger }),
    JSON.stringify({ format: 'havensum-shared-file', formatVersion: 1, writeId: '', lineage: [], ledger: validLedger }),
    JSON.stringify({ format: 'havensum-shared-file', formatVersion: 1, writeId: 'w', lineage: 'nope', ledger: validLedger }),
    JSON.stringify({ format: 'havensum-shared-file', formatVersion: 1, writeId: 'w', lineage: [], ledger: { ...validLedger, accounts: 'broken' } }),
    JSON.stringify({ format: 'havensum-shared-file', formatVersion: 1, writeId: 'w', lineage: [], ledger: { ...validLedger, version: 99 } })
  ];
  for (const encodedDocument of invalidDocuments) {
    assert.throws(() => parseSharedDocument(encodedDocument), SyntaxError, encodedDocument.slice(0, 60));
  }
});

test('the write history keeps the newest ancestors up to its limit', async () => {
  const { k_lineageLimit } = await import('../src/sharedFileDocument.js');
  const longHistory = Array.from({ length: k_lineageLimit }, (_, index) => `write-${index}`);
  const parent = { writeId: 'write-parent', lineage: longHistory };
  const child = parseSharedDocument(createSharedDocument(createFinancialState(), { writeId: 'write-child', parent }));
  assert.equal(child.lineage.length, k_lineageLimit);
  assert.equal(child.lineage.at(-1), 'write-parent');
  assert.equal(child.lineage[0], 'write-1');
  assert.ok(k_lineageLimit >= 1000);
});
