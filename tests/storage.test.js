import test from 'node:test';
import assert from 'node:assert/strict';
import { readState, writeState, readSnapshot, writeSnapshot } from '../src/storage.web.js';
import { installBrowserStorage } from './helpers/browserStorage.js';
import { createFinancialState } from './helpers/financialFixtures.js';

test('invalid payback metadata in a saved ledger is rejected and preserved', async context => {
  const storage = installBrowserStorage(context);
  const invalidState = createFinancialState({ paybackTasksVersion: 1, paybackTasks: [{ id: 'orphan', expenseId: 'missing' }] });
  const encoded = JSON.stringify(invalidState);
  storage.setItem('melo-state-v1', encoded);
  await assert.rejects(readState(), /existing expense/);
  assert.equal(storage.getItem('melo-state-v1'), encoded);
});

test('corrupt browser storage is reported instead of being treated as an empty ledger', async context => {
  const storage = installBrowserStorage(context);
  storage.setItem('melo-state-v1', '{broken-private-ledger');

  await assert.rejects(readState(), /stored data|JSON/i);
});

test('an absent browser ledger is distinguishable from corrupt saved data', async context => {
  installBrowserStorage(context);
  assert.equal(await readState(), null);
});

test('legacy state and merge baseline round-trip independently', async context => {
  const storage = installBrowserStorage(context);
  const state = createFinancialState();
  const baseline = createFinancialState({ theme: 'dark' });
  storage.setItem('melo-state-v1', JSON.stringify(state));
  storage.setItem('melo-sync-base', JSON.stringify(baseline));

  assert.deepEqual(await readState(), state);
  assert.deepEqual(await readSnapshot(), baseline);
  await writeState(baseline);
  await writeSnapshot(state);
  assert.deepEqual(await readState(), baseline);
  assert.deepEqual(await readSnapshot(), state);
});

test('demo mode does not read or overwrite a real ledger', async context => {
  const storage = installBrowserStorage(context, '?demo=1');
  const state = createFinancialState();
  storage.setItem('melo-state-v1', JSON.stringify(state));

  assert.equal(await readState(), null);
  await writeState(createFinancialState({ accounts: [] }));
  assert.equal(storage.getItem('melo-state-v1'), JSON.stringify(state));
});

test('browser quota failures reach the caller and retain the previous state', async context => {
  const storage = installBrowserStorage(context);
  const state = createFinancialState();
  await writeState(state);
  context.mock.method(storage, 'setItem', () => {
    throw Error('Storage quota exceeded');
  });

  await assert.rejects(writeState(createFinancialState({ accounts: [] })), /quota/);
  assert.deepEqual(await readState(), state);
});

test('a corrupt merge baseline is reported rather than silently discarded', async context => {
  const storage = installBrowserStorage(context);
  storage.setItem('melo-sync-base', '{broken-baseline');

  await assert.rejects(readSnapshot(), SyntaxError);
});

test('demo previews cannot read or overwrite the real merge baseline', async context => {
  const storage = installBrowserStorage(context, '?demo=1');
  const baseline = createFinancialState();
  storage.setItem('melo-sync-base', JSON.stringify(baseline));

  assert.equal(await readSnapshot(), null);
  await writeSnapshot(createFinancialState({ accounts: [] }));
  assert.equal(storage.getItem('melo-sync-base'), JSON.stringify(baseline));
});

test('storage access denial is reported distinctly and leaves the saved ledger intact', async context => {
  const storage = installBrowserStorage(context);
  const state = createFinancialState();
  await writeState(state);
  const unavailableRead = context.mock.method(storage, 'getItem', () => {
    throw new DOMException('Storage access is blocked', 'SecurityError');
  });

  await assert.rejects(readState(), { name: 'SecurityError' });
  unavailableRead.mock.restore();
  assert.deepEqual(await readState(), state);
});
