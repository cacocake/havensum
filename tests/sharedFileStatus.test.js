import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSyncForTrigger, sharedFileStatusView, createSyncScheduler, k_syncTriggers, k_editSyncDelayMilliseconds, commitSyncOutcome } from '../src/sharedFileStatus.js';
import * as webStorage from '../src/storage.web.js';
import { createBinding } from '../src/sharedFileBinding.js';
import { installBrowserStorage } from './helpers/browserStorage.js';
import { createFinancialState, createTransaction } from './helpers/financialFixtures.js';

const k_automaticTriggers = [k_syncTriggers.start, k_syncTriggers.resume, k_syncTriggers.edit];

test('automatic triggers sync when connected and online, and never bypass a review or a lost connection (G10)', () => {
  for (const trigger of k_automaticTriggers) {
    assert.equal(shouldSyncForTrigger({ status: 'synced', trigger, isOnline: true, isConnected: true }), true, trigger);
    assert.equal(shouldSyncForTrigger({ status: 'synced', trigger, isOnline: false, isConnected: true }), false, `${trigger} offline`);
    assert.equal(shouldSyncForTrigger({ status: 'synced', trigger, isOnline: true, isConnected: false }), false, `${trigger} not connected`);
    for (const waitingStatus of ['needsReview', 'needsJoin', 'reconnect', 'paused', 'invalidRemote']) {
      assert.equal(shouldSyncForTrigger({ status: waitingStatus, trigger, isOnline: true, isConnected: true }), false, `${trigger} ${waitingStatus}`);
    }
  }
});

test('Sync now retries a pause, an offline device or an unreadable file, but an expired session must reconnect first', () => {
  for (const status of ['synced', 'offline', 'paused', 'invalidRemote', 'retryLater', 'needsReview']) {
    assert.equal(shouldSyncForTrigger({ status, trigger: k_syncTriggers.syncNow, isOnline: true, isConnected: true }), true, status);
  }
  assert.equal(shouldSyncForTrigger({ status: 'reconnect', trigger: k_syncTriggers.syncNow, isOnline: true, isConnected: true }), false);
  assert.equal(shouldSyncForTrigger({ status: 'needsJoin', trigger: k_syncTriggers.syncNow, isOnline: true, isConnected: true }), false);
  assert.equal(shouldSyncForTrigger({ status: 'reconnect', trigger: k_syncTriggers.reconnect, isOnline: true, isConnected: true }), true);
  assert.equal(shouldSyncForTrigger({ status: 'paused', trigger: k_syncTriggers.reconnect, isOnline: true, isConnected: true }), true);
  assert.equal(shouldSyncForTrigger({ status: 'synced', trigger: k_syncTriggers.reconnect, isOnline: true, isConnected: true }), false);
});

test('without a Drive connection the card says so honestly and offers Open before Create', () => {
  const view = sharedFileStatusView({ status: 'notConnected', isDemo: false, isTransportAvailable: false });
  assert.equal(view.title, 'Not connected');
  assert.deepEqual(view.actions.map(action => action.id), ['open', 'create']);
  assert.ok(view.actions.every(action => action.disabled));
  assert.match(view.description, /not set up/);
});

test('Create warns to check with the partner and is blocked while example data is loaded (G07, G09)', () => {
  const ready = sharedFileStatusView({ status: 'notConnected', isDemo: false, isTransportAvailable: true });
  const create = ready.actions.find(action => action.id === 'create');
  assert.equal(create.disabled, false);
  assert.match(create.hint, /partner/);
  const example = sharedFileStatusView({ status: 'notConnected', isDemo: true, isTransportAvailable: true });
  const blockedCreate = example.actions.find(action => action.id === 'create');
  assert.equal(blockedCreate.disabled, true);
  assert.match(blockedCreate.hint, /example data/);
  assert.equal(example.actions.find(action => action.id === 'open').disabled, false);
});

test('each connected status names what the person can do next', () => {
  const actionsFor = (status, reason) => sharedFileStatusView({ status, reason, isDemo: false, isTransportAvailable: true }).actions.map(action => action.id);
  assert.deepEqual(actionsFor('synced'), ['syncNow']);
  assert.deepEqual(actionsFor('syncing'), []);
  assert.deepEqual(actionsFor('offline'), ['syncNow']);
  assert.deepEqual(actionsFor('retryLater'), ['syncNow']);
  assert.deepEqual(actionsFor('reconnect'), ['reconnect']);
  assert.deepEqual(actionsFor('paused', 'accessLost'), ['reconnect', 'open']);
  assert.deepEqual(actionsFor('needsReview'), ['review']);
  assert.deepEqual(actionsFor('needsJoin'), ['review']);
  assert.deepEqual(actionsFor('invalidRemote'), ['downloadRemote', 'syncNow']);
  assert.match(sharedFileStatusView({ status: 'paused', reason: 'fileMissing', isDemo: false, isTransportAvailable: true }).description, /trash/);
  assert.match(sharedFileStatusView({ status: 'paused', reason: 'accessLost', isDemo: false, isTransportAvailable: true }).description, /stays on this device/);
});

test('edits are synced shortly after the last one, and a trigger during a sync runs once afterwards', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const runs = [];
  let finishRun;
  const scheduler = createSyncScheduler({
    runSync: trigger => {
      runs.push(trigger);
      return new Promise(resolve => {
        finishRun = resolve;
      });
    }
  });
  scheduler.trigger(k_syncTriggers.edit);
  context.mock.timers.tick(k_editSyncDelayMilliseconds - 1);
  scheduler.trigger(k_syncTriggers.edit);
  context.mock.timers.tick(k_editSyncDelayMilliseconds - 1);
  assert.deepEqual(runs, []);
  context.mock.timers.tick(1);
  assert.deepEqual(runs, [k_syncTriggers.edit]);
  scheduler.trigger(k_syncTriggers.syncNow);
  scheduler.trigger(k_syncTriggers.resume);
  assert.equal(runs.length, 1);
  finishRun();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(runs, [k_syncTriggers.edit, k_syncTriggers.syncNow]);
  finishRun();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runs.length, 2);
  scheduler.trigger(k_syncTriggers.edit);
  scheduler.cancel();
  context.mock.timers.tick(k_editSyncDelayMilliseconds);
  assert.equal(runs.length, 2);
});

test('a sync outcome saves the ledger before the link, so the link never gets ahead of the ledger', async context => {
  const storage = installBrowserStorage(context);
  const previous = createFinancialState();
  await webStorage.writeState(previous);
  const synced = { ...previous, transactions: [createTransaction()] };
  const binding = createBinding('file-1', { revision: 'rev-2', snapshots: [] });
  const originalSetItem = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === 'melo-state-v1') {
      throw new Error('Quota exceeded');
    }
    originalSetItem(key, value);
  };
  await assert.rejects(commitSyncOutcome(webStorage, { state: synced, binding }), /Quota/);
  assert.equal(await webStorage.readSharedFileBinding(), null);
  storage.setItem = originalSetItem;
  await commitSyncOutcome(webStorage, { state: synced, binding });
  assert.deepEqual((await webStorage.readState()).transactions, [createTransaction()]);
  assert.equal((await webStorage.readSharedFileBinding()).lastSeenRevision, 'rev-2');
  await commitSyncOutcome(webStorage, { status: 'offline' });
  assert.equal((await webStorage.readSharedFileBinding()).lastSeenRevision, 'rev-2');
});
