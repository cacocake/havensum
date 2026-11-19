import { isSameLedger } from './sharedFileMerge.js';
import { k_syncStatuses } from './sharedFileRead.js';

// When sync runs and what the shared-file card shows (G04, G07, G09, G10).
// Sync is automatic on start, resume and shortly after edits when online,
// plus "Sync now". Conflicts, a join decision, a lost connection and an
// unreadable file always wait for the person.
export const k_syncTriggers = Object.freeze({
  start: 'start',
  resume: 'resume',
  edit: 'edit',
  syncNow: 'syncNow',
  reconnect: 'reconnect'
});

export const k_editSyncDelayMilliseconds = 4000;

const k_automaticTriggers = new Set([k_syncTriggers.start, k_syncTriggers.resume, k_syncTriggers.edit]);
const k_statusesWaitingForPerson = new Set([
  k_syncStatuses.needsReview,
  k_syncStatuses.needsJoin,
  k_syncStatuses.reconnect,
  k_syncStatuses.paused,
  k_syncStatuses.invalidRemote,
  k_syncStatuses.invalidMerge
]);
const k_statusesNeedingReconnect = new Set([k_syncStatuses.reconnect, k_syncStatuses.paused]);
// Sync now cannot replace signing in again or finishing a join.
const k_statusesBlockingSyncNow = new Set([k_syncStatuses.reconnect, k_syncStatuses.needsJoin]);
// A queued trigger the person asked for outranks an automatic one.
const k_triggerPriority = Object.freeze({
  [k_syncTriggers.reconnect]: 3,
  [k_syncTriggers.syncNow]: 2,
  [k_syncTriggers.start]: 1,
  [k_syncTriggers.resume]: 1,
  [k_syncTriggers.edit]: 0
});

export function shouldSyncForTrigger({ status, trigger, isOnline, isConnected }) {
  if (!isConnected) {
    return false;
  }
  if (trigger === k_syncTriggers.reconnect) {
    return k_statusesNeedingReconnect.has(status);
  }
  if (trigger === k_syncTriggers.syncNow) {
    return !k_statusesBlockingSyncNow.has(status);
  }
  if (!k_automaticTriggers.has(trigger)) {
    return false;
  }
  return isOnline && !k_statusesWaitingForPerson.has(status);
}

function higherPriorityTrigger(queuedTrigger, trigger) {
  if (!queuedTrigger) {
    return trigger;
  }
  return k_triggerPriority[trigger] > k_triggerPriority[queuedTrigger] ? trigger : queuedTrigger;
}

// Runs one sync at a time. Edits wait for a quiet moment; triggers that arrive
// during a sync run once after it, keeping the one the person asked for. A
// failing sync is reported through onError and never stops later syncs.
export function createSyncScheduler({ runSync, onError = () => {} }) {
  let editTimer = null;
  let isRunning = false;
  let queuedTrigger = null;

  async function run(trigger) {
    if (isRunning) {
      queuedTrigger = higherPriorityTrigger(queuedTrigger, trigger);
      return;
    }
    isRunning = true;
    try {
      await runSync(trigger);
    } catch (error) {
      onError(error);
    } finally {
      isRunning = false;
    }
    if (queuedTrigger) {
      const nextTrigger = queuedTrigger;
      queuedTrigger = null;
      await run(nextTrigger);
    }
  }

  function clearEditTimer() {
    if (editTimer !== null) {
      clearTimeout(editTimer);
      editTimer = null;
    }
  }

  return {
    trigger(trigger) {
      if (trigger !== k_syncTriggers.edit) {
        run(trigger);
        return;
      }
      clearEditTimer();
      editTimer = setTimeout(() => {
        editTimer = null;
        run(trigger);
      }, k_editSyncDelayMilliseconds);
    },
    cancel() {
      clearEditTimer();
      queuedTrigger = null;
    }
  };
}

export class StaleLedgerError extends Error {
  constructor() {
    super('The ledger changed during the sync. It will sync again shortly.');
    this.name = 'StaleLedgerError';
  }
}

// The saveProgress a sync uses: it refuses to save when the device ledger
// changed since the sync started (or since its last save), so an edit is
// never overwritten, and it saves the ledger and the link together.
export function createSyncProgressSaver({ storage, snapshotState, readCurrentState }) {
  let expectedState = snapshotState;
  return async function saveProgress({ state, binding }) {
    const currentState = await readCurrentState();
    if (!isSameLedger(currentState, expectedState)) {
      throw new StaleLedgerError();
    }
    await storage.writeStateWithSharedFileBinding(state, binding);
    expectedState = state;
  };
}

const k_action = Object.freeze({
  open: { id: 'open', label: 'Open shared file' },
  create: { id: 'create', label: 'Create shared file' },
  syncNow: { id: 'syncNow', label: 'Sync now' },
  reconnect: { id: 'reconnect', label: 'Reconnect' },
  review: { id: 'review', label: 'Review changes' },
  downloadRemote: { id: 'downloadRemote', label: 'Download shared file copy' }
});

const k_createHint = 'Check with your partner first: if they already created a shared file, open theirs instead.';
const k_exampleDataHint = 'Clear the example data first, so example records never reach your partner.';
const k_setupHint = 'Needs Google Drive setup in this build.';

const k_pausedDescriptions = Object.freeze({
  accessLost: 'Havensum lost access to the shared file. Everything stays on this device and waits until you reconnect.',
  fileMissing: 'The shared file was deleted or moved to the trash. Everything stays on this device. Restore the file from the trash, or open or create another one.'
});

const k_statusViews = Object.freeze({
  synced: { title: 'Up to date', description: 'Your shared file matches this device.', actions: [k_action.syncNow] },
  syncing: { title: 'Syncing…', description: 'Comparing this device with the shared file.', actions: [] },
  offline: { title: 'Offline', description: 'Changes wait on this device until you are back online.', actions: [k_action.syncNow] },
  retryLater: { title: 'Will try again', description: 'The shared file was busy or could not be reached. Nothing was lost.', actions: [k_action.syncNow] },
  reconnect: { title: 'Sign-in expired', description: 'Reconnect to Google Drive to keep syncing. Your changes stay on this device.', actions: [k_action.reconnect] },
  paused: { title: 'Paused', description: k_pausedDescriptions.accessLost, actions: [k_action.reconnect, k_action.open] },
  needsReview: { title: 'Changes to review', description: 'Both of you changed the same thing. Nothing is written until you choose.', actions: [k_action.review] },
  needsJoin: { title: 'Choose how to join', description: 'This file and this device share no history. Review the records found on only one side.', actions: [k_action.review] },
  invalidRemote: { title: 'Shared file unreadable', description: 'This version of Havensum cannot read the shared file, or it was changed outside Havensum. This device was not changed.', actions: [k_action.downloadRemote, k_action.syncNow] },
  invalidMerge: { title: 'Changes do not fit together', description: 'Combining both sides would break an entry, for example a payback larger than its expense. Nothing was written. Correct the entry on either device.', actions: [k_action.syncNow] }
});

function setupActions({ isDemo, isTransportAvailable }) {
  const open = { ...k_action.open, disabled: !isTransportAvailable, hint: isTransportAvailable ? '' : k_setupHint };
  let createHint = k_createHint;
  if (isDemo) {
    createHint = k_exampleDataHint;
  } else if (!isTransportAvailable) {
    createHint = k_setupHint;
  }
  const create = { ...k_action.create, disabled: isDemo || !isTransportAvailable, hint: createHint };
  return [open, create];
}

export function sharedFileStatusView({ status, reason = null, isDemo, isTransportAvailable }) {
  if (status === k_syncStatuses.notConnected || !k_statusViews[status]) {
    const description = isTransportAvailable
      ? 'Open the file your partner shared, or create one and share it.'
      : 'Google Drive sync is not set up in this build yet. Until then, exchange full backups manually.';
    return { title: 'Not connected', description, actions: setupActions({ isDemo, isTransportAvailable }) };
  }
  const view = k_statusViews[status];
  const description = status === k_syncStatuses.paused && k_pausedDescriptions[reason] ? k_pausedDescriptions[reason] : view.description;
  return { title: view.title, description, actions: view.actions.map(action => ({ ...action, disabled: false, hint: '' })) };
}
