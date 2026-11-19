import { createSharedDocument, parseSharedDocument, sharedLedgerOf, withDeviceKeys } from './sharedFileDocument.js';
import { createBinding, recordIncorporatedSnapshots, selectBaseline } from './sharedFileBinding.js';
import { isSameLedger, mergeSharedLedgers } from './sharedFileMerge.js';
import { SharedFileTransportError, k_transportFailureReasons } from './sharedFileTransport.js';
import { applyMergeChoices, hasChosenEveryConflict } from './mergeReview.js';
import { validateState } from './stateSchema.js';

// Read → validate/migrate → three-way merge → review → write → verify.
// Drive cannot refuse a stale write, so every write is followed by a read: if
// another device's write replaced ours, the loop merges again against the
// snapshot that write descends from. Every write records its ancestors, so a
// later sync can also recover a write that was overwritten after we verified it.
export const k_maximumWriteAttempts = 3;

export const k_syncStatuses = Object.freeze({
  notConnected: 'notConnected',
  synced: 'synced',
  needsReview: 'needsReview',
  needsJoin: 'needsJoin',
  invalidRemote: 'invalidRemote',
  offline: 'offline',
  reconnect: 'reconnect',
  paused: 'paused',
  retryLater: 'retryLater'
});

const k_statusByFailureReason = Object.freeze({
  [k_transportFailureReasons.offline]: k_syncStatuses.offline,
  [k_transportFailureReasons.expiredSession]: k_syncStatuses.reconnect,
  [k_transportFailureReasons.accessLost]: k_syncStatuses.paused,
  [k_transportFailureReasons.fileMissing]: k_syncStatuses.paused
});

const k_exampleDataCreateMessage = 'Clear the example data before creating a shared file, so example records never reach your partner.';

// A transport failure the person can act on keeps its own status; anything
// else is temporary.
export function failureOutcome(error) {
  if (error instanceof SharedFileTransportError && k_statusByFailureReason[error.reason]) {
    return { status: k_statusByFailureReason[error.reason], reason: error.reason };
  }
  return { status: k_syncStatuses.retryLater, reason: 'temporary', message: error.message };
}

export async function readSharedDocument(transport, fileId) {
  let remote;
  try {
    remote = await transport.read(fileId);
  } catch (error) {
    return { outcome: failureOutcome(error) };
  }
  try {
    return { revision: remote.revision, document: parseSharedDocument(remote.content) };
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    // An invalid remote never overwrites local data; its bytes stay downloadable.
    return { outcome: { status: k_syncStatuses.invalidRemote, message: error.message, remoteContent: remote.content } };
  }
}

export async function createSharedFile({ transport, localState, partnerEmail, createWriteId }) {
  if (localState.demo) {
    throw new Error(k_exampleDataCreateMessage);
  }
  const encodedDocument = createSharedDocument(localState, { writeId: createWriteId(), parent: null });
  const { fileId, revision } = await transport.create({ content: encodedDocument, partnerEmail });
  return { binding: createBinding(fileId, { revision, snapshots: [parseSharedDocument(encodedDocument)] }) };
}

// Progress is reported only after a write has landed: until then this
// device's ledger and link stay exactly as they were.
function withProgress(outcome, progress) {
  return progress ? { ...outcome, ...progress } : outcome;
}

export async function syncSharedFile({ transport, binding, localState, createWriteId }) {
  if (!binding) {
    return { status: k_syncStatuses.notConnected };
  }
  const { fileId } = binding;
  let localLedger = sharedLedgerOf(localState);
  let workingBinding = binding;
  let progress = null;
  for (let writeCount = 0; ; writeCount += 1) {
    const read = await readSharedDocument(transport, fileId);
    if (read.outcome) {
      return withProgress(read.outcome, progress);
    }
    const { document: remoteDocument, revision } = read;
    const baseline = selectBaseline(workingBinding, fileId, remoteDocument);
    if (!baseline) {
      return withProgress({ status: k_syncStatuses.needsJoin, opened: { fileId, revision, document: remoteDocument } }, progress);
    }
    const merge = mergeSharedLedgers(baseline.ledger, localLedger, remoteDocument.ledger, remoteDocument.representation);
    const pinned = { pinnedWriteId: baseline.writeId };
    if (merge.conflicts.length) {
      const review = {
        fileId,
        merge,
        localLedger,
        bindingOnApply: recordIncorporatedSnapshots(workingBinding, [remoteDocument], revision, pinned)
      };
      return withProgress({ status: k_syncStatuses.needsReview, review }, progress);
    }
    workingBinding = recordIncorporatedSnapshots(workingBinding, [remoteDocument], revision, pinned);
    localLedger = merge.result;
    if (isSameLedger(merge.result, remoteDocument.ledger)) {
      return { status: k_syncStatuses.synced, state: withDeviceKeys(localLedger, localState), binding: workingBinding };
    }
    if (writeCount === k_maximumWriteAttempts) {
      return withProgress({ status: k_syncStatuses.retryLater, reason: 'busy' }, progress);
    }
    const encodedDocument = createSharedDocument(withDeviceKeys(localLedger, localState), { writeId: createWriteId(), parent: remoteDocument });
    let written;
    try {
      written = await transport.write(fileId, encodedDocument);
    } catch (error) {
      return withProgress(failureOutcome(error), progress);
    }
    workingBinding = recordIncorporatedSnapshots(workingBinding, [parseSharedDocument(encodedDocument)], written.revision, pinned);
    progress = { state: withDeviceKeys(localLedger, localState), binding: workingBinding };
  }
}

// Applies the person's choices. The review is refused if this device's ledger
// changed since it was prepared, so an edit made meanwhile is never dropped.
export function applySyncReview({ review, choices, currentState }) {
  if (!hasChosenEveryConflict(review.merge.conflicts, choices)) {
    return { status: 'incomplete' };
  }
  if (!isSameLedger(sharedLedgerOf(currentState), review.localLedger)) {
    return { status: 'stale' };
  }
  const resolvedLedger = applyMergeChoices(review.merge.result, review.merge.conflicts, choices);
  const state = validateState(withDeviceKeys(resolvedLedger, currentState));
  return { status: 'resolved', state, binding: review.bindingOnApply };
}

// A sync works on a snapshot of the ledger. If the person edited meanwhile,
// their edits are merged with the synced result instead of being replaced;
// a collision waits for review like any other conflict.
export function reconcileAfterSync({ snapshotState, currentState, syncedState, syncedBinding = null }) {
  if (isSameLedger(snapshotState, currentState)) {
    return { status: 'merged', state: withDeviceKeys(syncedState, currentState), binding: syncedBinding };
  }
  const merge = mergeSharedLedgers(snapshotState, currentState, syncedState);
  if (merge.conflicts.length) {
    return { status: 'needsReview', review: { fileId: syncedBinding?.fileId ?? null, merge, localLedger: sharedLedgerOf(currentState), bindingOnApply: syncedBinding } };
  }
  return { status: 'merged', state: withDeviceKeys(merge.result, currentState), binding: syncedBinding };
}
