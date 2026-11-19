import test from 'node:test';
import assert from 'node:assert/strict';
import { readInvalidSnapshotCopy, readState, writeState, readSnapshot, writeSnapshot } from '../src/storage.web.js';
import { installBrowserStorage } from './helpers/browserStorage.js';
import { createFinancialState, createTransaction, expectedMigratedLedger } from './helpers/financialFixtures.js';
import { buildPlan } from '../src/engine.js';

test('exporting a new baseline retains the original corrupt baseline bytes', async context => {
  const storage = installBrowserStorage(context);
  const baselineKey = 'melo-sync-base';
  const damaged = '{broken-baseline';
  storage.setItem(baselineKey, damaged);
  const state = createFinancialState();
  await writeSnapshot(state);
  assert.deepEqual(await readSnapshot(), state);
  assert.equal(storage.getItem(`${baselineKey}:recovery:invalid`), damaged);
});

test('saving a replacement baseline selects the bytes just recovered even if they are already archived', async context => {
  const storage = installBrowserStorage(context);
  const baselineKey = 'melo-sync-base';
  const first = '{first damaged baseline';
  const second = '{second damaged baseline';
  const state = createFinancialState();
  for (const damaged of [first, second, first]) {
    storage.setItem(baselineKey, damaged);
    await writeSnapshot(state);
  }
  assert.equal(await readInvalidSnapshotCopy(), first);
  assert.equal(storage.getItem(`${baselineKey}:recovery:invalid:1`), second);
  assert.equal(storage.getItem(`${baselineKey}:recovery:invalid:2`), null);
});

test('a merged deletion cannot persist while a transaction still uses the numeric zero category', async context => {
  installBrowserStorage(context);
  const initial = createFinancialState({
    categories: [{ id: 0, name: 'Household' }],
    transactions: [createTransaction({ category: 0 })]
  });
  await writeState(initial);
  await assert.rejects(writeState({ ...initial, categories: [] }), /valid category/);
  assert.deepEqual(await readState(), initial);
});

test('legacy ledger migration preserves original bytes, identities and frozen targets across subsequent saves', async context => {
  const storage = installBrowserStorage(context);
  const legacyState = createFinancialState({
    version: 1,
    transactions: [createTransaction(), createTransaction({
      id: 'late-payback', type: 'reimbursement', linkedId: 'weekly-shopping', amount: 400, date: '2026-12-01'
    })],
    customMetadata: { retained: true }
  });
  legacyState.plan = buildPlan(legacyState, {
    year: 2026, fromMonth: 11, income: 245000, cushion: 12000, overrides: { groceries: 43210 }
  });
  const originalBytes = JSON.stringify(legacyState, null, 2);
  storage.setItem('melo-state-v1', originalBytes);

  const migratedState = await readState();
  assert.deepEqual(migratedState, expectedMigratedLedger(legacyState, migratedState));
  assert.equal(storage.getItem('melo-state-v1:recovery:v1'), originalBytes);
  await writeState({ ...migratedState, theme: 'dark' });
  assert.equal((await readState()).theme, 'dark');
  assert.equal(storage.getItem('melo-state-v1:recovery:v1'), originalBytes);
});

test('failed recovery writes leave legacy ledger and baseline bytes untouched and can be retried', async context => {
  const storage = installBrowserStorage(context);
  const originalBytes = JSON.stringify(createFinancialState({ version: 1 }), null, 2);
  storage.setItem('melo-state-v1', originalBytes);
  storage.setItem('melo-sync-base', originalBytes);
  const failedWrite = context.mock.method(storage, 'setItem', () => {
    throw Error('Recovery storage quota exceeded');
  });

  await assert.rejects(readState(), /quota/);
  await assert.rejects(readSnapshot(), /quota/);
  assert.equal(storage.getItem('melo-state-v1'), originalBytes);
  assert.equal(storage.getItem('melo-sync-base'), originalBytes);

  failedWrite.mock.restore();
  assert.equal((await readState()).version, 4);
  assert.equal((await readSnapshot()).version, 4);
  assert.equal(storage.getItem('melo-state-v1:recovery:v1'), originalBytes);
  assert.equal(storage.getItem('melo-sync-base:recovery:v1'), originalBytes);
});

test('migration interrupted after recovery creation retries without overwriting original recovery bytes', async context => {
  const storage = installBrowserStorage(context);
  const originalBytes = JSON.stringify(createFinancialState({ version: 1 }), null, 2);
  storage.setItem('melo-state-v1', originalBytes);
  const setItem = storage.setItem;
  const interruptedWrite = context.mock.method(storage, 'setItem', (key, value) => {
    if (key === 'melo-state-v1') {
      throw Error('Interrupted migration');
    }
    setItem(key, value);
  });

  await assert.rejects(readState(), /Interrupted/);
  assert.equal(storage.getItem('melo-state-v1'), originalBytes);
  assert.equal(storage.getItem('melo-state-v1:recovery:v1'), originalBytes);
  interruptedWrite.mock.restore();
  assert.equal((await readState()).version, 4);
  assert.equal(storage.getItem('melo-state-v1:recovery:v1'), originalBytes);

  context.mock.method(storage, 'setItem', () => {
    throw Error('Read must not need another write');
  });
  assert.equal((await readState()).version, 4);
});

test('invalid saves and unsupported saved versions cannot replace an existing ledger or baseline', async context => {
  const storage = installBrowserStorage(context);
  const state = createFinancialState();
  await writeState(state);
  await writeSnapshot(state);
  await assert.rejects(writeState({ ...state, transactions: [createTransaction({ amount: -10 })] }), SyntaxError);
  await assert.rejects(writeSnapshot({ ...state, version: 99 }), SyntaxError);
  assert.deepEqual(await readState(), state);
  assert.deepEqual(await readSnapshot(), state);

  const futureBytes = JSON.stringify({ ...state, version: 99 });
  storage.setItem('melo-state-v1', futureBytes);
  await assert.rejects(writeState(state), SyntaxError);
  assert.equal(storage.getItem('melo-state-v1'), futureBytes);
});

test('unknown, malformed and invalid ledgers are rejected without altering any stored bytes', async context => {
  const storage = installBrowserStorage(context);
  const invalidStates = [
    null, [], {},
    createFinancialState({ version: 99 }),
    createFinancialState({ version: '1' }),
    createFinancialState({ accounts: null }),
    createFinancialState({ accounts: [{ id: 'everyday', openingBalance: 1.5 }] }),
    createFinancialState({ transactions: [createTransaction({ account: 'missing' })] }),
    createFinancialState({ transactions: [createTransaction({ amount: 12.34 })] }),
    createFinancialState({ transactions: [createTransaction(), createTransaction()] }),
    createFinancialState({ categories: [{ id: 'loop', parentId: 'loop', name: 'Loop' }] }),
    createFinancialState({ version: 2, plan: { year: 2026, months: { '2026-11': { income: 'bad' } } } })
  ];
  for (const invalidState of invalidStates) {
    const originalBytes = JSON.stringify(invalidState);
    storage.setItem('melo-state-v1', originalBytes);
    await assert.rejects(readState(), SyntaxError);
    assert.equal(storage.getItem('melo-state-v1'), originalBytes);
    assert.equal(storage.getItem('melo-state-v1:recovery:v1'), null);
  }
});

test('malformed saved plan assumptions and transaction behaviours cannot pass schema validation', async context => {
  const storage = installBrowserStorage(context);
  const state = createFinancialState();
  const plan = { ...buildPlan(state, { year: 2026 }), id: 'plan-2026-first' };
  const archived = revision => ({ ...state, plans: { 2026: [revision] } });
  const invalidStates = [
    archived({ ...plan, incomeChanges: 'not a list' }),
    archived({ ...plan, loanChanges: [{ loanId: 'car', since: '2026-13', amount: 100 }] }),
    archived({ ...plan, window: 'six' }),
    archived({ ...plan, tolerance: 1.5 }),
    { ...state, transactions: [createTransaction({ kind: 'Unknown' })] }
  ];
  for (const invalidState of invalidStates) {
    const originalBytes = JSON.stringify(invalidState);
    storage.setItem('melo-state-v1', originalBytes);
    await assert.rejects(readState(), SyntaxError);
    assert.equal(storage.getItem('melo-state-v1'), originalBytes);
  }
});

test('migration retains savings, loans, scheduled changes and per-field category inheritance without financial edits', async context => {
  const storage = installBrowserStorage(context);
  const legacyState = createFinancialState({
    version: 1,
    accounts: [{ id: 'savings', name: 'Reserve', tag: 'Savings', openingBalance: 420000, interest: 3, interestStart: '2026-05' }],
    categories: [
      { id: 'home', name: 'Custom home', kind: 'Fixed', color: '#123456', icon: 'House', budget: 50000 },
      { id: 'rent', parentId: 'home', name: 'My rent', kind: null, color: null, icon: 'KeyRound', budget: 0 }
    ],
    loans: [{ id: 'car', name: 'Car', account: 'savings', remaining: 610500, original: 888000, payment: 18500, start: '2025-09', end: '2029-08' }],
    events: [{ id: 'trip', name: 'Trip', year: 2027, month: 7, amount: 25000 }]
  });
  legacyState.plan = buildPlan(legacyState, {
    year: 2027,
    incomeChanges: [{ since: '2027-06', amount: 260000 }],
    loanChanges: [{ loanId: 'car', since: '2027-06', amount: 19000 }],
    overrides: { home: 99999 }
  });
  storage.setItem('melo-state-v1', JSON.stringify(legacyState));
  const migratedState = await readState();
  assert.deepEqual(migratedState, expectedMigratedLedger(legacyState, migratedState));
});

test('legacy numeric imported transaction IDs and their reimbursement links survive migration unchanged', async context => {
  const storage = installBrowserStorage(context);
  const legacyState = createFinancialState({ version: 1, transactions: [
    createTransaction({ id: 123 }),
    createTransaction({ id: 124, type: 'reimbursement', linkedId: 123, amount: 400 })
  ] });
  storage.setItem('melo-state-v1', JSON.stringify(legacyState));
  const migratedState = await readState();
  assert.deepEqual(migratedState, expectedMigratedLedger(legacyState, migratedState));
});

test('legacy merge baselines migrate independently and retain their first original copy', async context => {
  const storage = installBrowserStorage(context);
  const legacyBaseline = createFinancialState({ version: 1, theme: 'dark' });
  const originalBytes = JSON.stringify(legacyBaseline, null, 2);
  storage.setItem('melo-sync-base', originalBytes);

  assert.deepEqual(await readSnapshot(), expectedMigratedLedger(legacyBaseline));
  assert.equal(storage.getItem('melo-sync-base:recovery:v1'), originalBytes);
  await writeSnapshot(createFinancialState());
  assert.equal(storage.getItem('melo-sync-base:recovery:v1'), originalBytes);
  assert.equal(storage.getItem('melo-state-v1'), null);
});

test('saving before reading protects both original legacy values before replacement', async context => {
  const storage = installBrowserStorage(context);
  const originalState = JSON.stringify(createFinancialState({ version: 1 }));
  const originalBaseline = JSON.stringify(createFinancialState({ version: 1, theme: 'dark' }));
  storage.setItem('melo-state-v1', originalState);
  storage.setItem('melo-sync-base', originalBaseline);

  await writeState(createFinancialState({ theme: 'dark' }));
  await writeSnapshot(createFinancialState());

  assert.equal(storage.getItem('melo-state-v1:recovery:v1'), originalState);
  assert.equal(storage.getItem('melo-sync-base:recovery:v1'), originalBaseline);
  assert.equal((await readState()).theme, 'dark');
  assert.equal((await readSnapshot()).theme, 'light');
});

test('invalid outlook cents cannot replace a saved ledger', async context => {
  const storage = installBrowserStorage(context);
  const state = createFinancialState();
  await writeState(state);
  const invalidState = { ...state, outlook: { incomeChanges: [{ since: '2026-11', amount: 1.5 }] } };
  await assert.rejects(writeState(invalidState), /outlook/i);
  assert.equal(storage.getItem('melo-state-v1'), JSON.stringify(state));
});

test('a pre-import recovery copy is retained separately from the ledger and shared merge baseline', async context => {
  const { writeImportRecovery, readImportRecovery } = await import('../src/storage.web.js');
  const storage = installBrowserStorage(context);
  const original = createFinancialState();
  storage.setItem('melo-state-v1', JSON.stringify(original));
  storage.setItem('melo-sync-base', 'existing-shared-baseline');
  await writeImportRecovery(original);
  await writeState(createFinancialState({ theme: 'dark' }));
  assert.deepEqual(await readImportRecovery(), original);
  assert.equal(storage.getItem('melo-sync-base'), 'existing-shared-baseline');
});

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

  await assert.rejects(readSnapshot(), {
    name: 'SyntaxError',
    message: 'Your saved merge baseline is unreadable. Keep this device data while recovering a verified backup.'
  });
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
