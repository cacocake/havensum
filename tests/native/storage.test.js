import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFinancialState } from '../helpers/financialFixtures.js';

const g_values = new Map();
const g_storageAdapter = {
  async getItem(key) {
    return g_values.get(key) ?? null;
  },
  async setItem(key, value) {
    g_values.set(key, value);
  }
};

// AsyncStorage is the device boundary. All application storage code stays real.
mock.module('@react-native-async-storage/async-storage', { exports: { default: g_storageAdapter } });
const { readState, writeState, readSnapshot, writeSnapshot } = await import('../../src/storage.native.js');

beforeEach(() => {
  g_values.clear();
});

test('native storage retains outlook inputs and rejects invalid replacements', async () => {
  const state = createFinancialState({ outlook: { completeMonths: ['2026-10'], incomeChanges: [{ since: '2026-11', amount: 200000 }] } });
  await writeState(state);
  await writeSnapshot(state);
  assert.deepEqual(await readState(), state);
  assert.deepEqual(await readSnapshot(), state);
  assert.throws(() => writeState({ ...state, outlook: { window: 0 } }), /outlook/i);
  assert.deepEqual(await readState(), state);
});

test('native storage retains legacy state and baseline independently', async () => {
  const state = createFinancialState();
  const snapshot = createFinancialState({ theme: 'dark' });
  g_values.set('melo-state-v1', JSON.stringify(state));
  g_values.set('melo-sync-base', JSON.stringify(snapshot));

  assert.deepEqual(await readState(), state);
  assert.deepEqual(await readSnapshot(), snapshot);
  await writeState(snapshot);
  await writeSnapshot(state);
  assert.deepEqual(await readState(), snapshot);
  assert.deepEqual(await readSnapshot(), state);
});

test('a slow native save cannot overwrite a newer saved state', async context => {
  const firstState = createFinancialState();
  const latestState = createFinancialState({ theme: 'dark' });
  let releaseFirstSave;
  const firstSaveGate = new Promise(resolve => {
    releaseFirstSave = resolve;
  });
  context.mock.method(g_storageAdapter, 'setItem', async (key, value) => {
    if (JSON.parse(value).theme === 'light') {
      await firstSaveGate;
    }
    g_values.set(key, value);
  });

  const firstSave = writeState(firstState);
  const latestSave = writeState(latestState);
  releaseFirstSave();
  await Promise.all([firstSave, latestSave]);

  assert.deepEqual(await readState(), latestState);
});

test('a failed native save is reported and the queue accepts the next save', async context => {
  const originalSetItem = g_storageAdapter.setItem;
  context.mock.method(g_storageAdapter, 'setItem', async () => {
    throw Error('Device storage unavailable');
  });
  await assert.rejects(writeState(createFinancialState()), /unavailable/);
  g_storageAdapter.setItem = originalSetItem;
  const recoveredState = createFinancialState({ theme: 'dark' });
  await writeState(recoveredState);

  assert.deepEqual(await readState(), recoveredState);
});

test('a native save captures the state before later in-memory changes', async () => {
  const state = createFinancialState();
  const savedState = structuredClone(state);
  const saving = writeState(state);
  state.theme = 'dark';
  await saving;

  assert.deepEqual(await readState(), savedState);
});

test('native corrupt data fails visibly and absent data returns null', async () => {
  assert.equal(await readState(), null);
  assert.equal(await readSnapshot(), null);
  g_values.set('melo-state-v1', '{corrupt');
  g_values.set('melo-sync-base', '{corrupt');

  await assert.rejects(readState(), SyntaxError);
  await assert.rejects(readSnapshot(), SyntaxError);
});

test('native read failures are not mistaken for absent state and retain the saved ledger', async context => {
  const state = createFinancialState();
  await writeState(state);
  const unavailableRead = context.mock.method(g_storageAdapter, 'getItem', async () => {
    throw Error('Device storage unavailable');
  });

  await assert.rejects(readState(), /storage unavailable/);
  unavailableRead.mock.restore();
  assert.deepEqual(await readState(), state);
});
