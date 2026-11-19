import { createSharedDocument, parseSharedDocument, sharedLedgerOf, validateSharedLedger, withDeviceKeys } from './sharedFileDocument.js';
import { createBinding, recordIncorporatedSnapshots, selectBaseline } from './sharedFileBinding.js';
import { isSameLedger, mergeSharedLedgers } from './sharedFileMerge.js';
import { failureOutcome, k_syncStatuses, readSharedDocument } from './sharedFileRead.js';
import { createJoinReview, k_joinStatuses } from './sharedFileJoin.js';
import { applyMergeChoices, hasChosenEveryConflict } from './mergeReview.js';
import { validateState } from './stateSchema.js';

export { k_syncStatuses } from './sharedFileRead.js';

// Read → validate/migrate → three-way merge → review → save → write → verify.
//
// Drive cannot refuse a stale write, so every write is followed by a read: if
// another device's write replaced ours, the loop merges again against the
// snapshot that newer write descends from. Every write records its ancestors,
// so a later sync can also recover a write that was overwritten after we
// verified it.
//
// Write-ahead: before each write, the merged ledger and the link (with the
// remote snapshot just merged and the outgoing snapshot) are saved together
// through `saveProgress`. If the write then lands but its reply is lost, or
// the app stops, the link already knows the written snapshot, so the next
// sync uses it as the baseline and never reverts the partner's later changes.
// An outgoing snapshot that never landed is never in any remote's ancestry,
// so it is never used.
//
// `saveProgress({ state, binding })` must save both atomically, or throw
// (for example when the person edited the ledger since this sync started);
// a throw stops the sync before anything is written.
export const k_maximumWriteAttempts = 3;

export const k_reviewOutcomes = Object.freeze({
  incomplete: 'incomplete',
  stale: 'stale',
  invalid: 'invalid',
  resolved: 'resolved'
});

export const k_createdStatus = 'created';
const k_busyReason = 'busy';
const k_progressNotSavedReason = 'progressNotSaved';
const k_exampleDataCreateMessage = 'Clear the example data before creating a shared file, so example records never reach your partner.';

export async function createSharedFile({ transport, localState, partnerEmail, createWriteId }) {
  if (localState.demo) {
    throw new Error(k_exampleDataCreateMessage);
  }
  const encodedDocument = createSharedDocument(localState, { writeId: createWriteId(), parent: null });
  let created;
  try {
    created = await transport.create({ content: encodedDocument, partnerEmail });
  } catch (error) {
    return failureOutcome(error);
  }
  const snapshots = [parseSharedDocument(encodedDocument)];
  return { status: k_createdStatus, binding: createBinding(created.fileId, { revision: created.revision, snapshots }) };
}

// The merged ledger in the exact form that is written, or why it cannot be.
function validatedMergeResult(mergedLedger) {
  try {
    return { ledger: validateSharedLedger(mergedLedger) };
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    return { outcome: { status: k_syncStatuses.invalidMerge, message: error.message } };
  }
}

async function saveOrStop(saveProgress, progress) {
  try {
    await saveProgress(progress);
    return null;
  } catch (error) {
    return { status: k_syncStatuses.retryLater, reason: k_progressNotSavedReason, message: error.message };
  }
}

export async function syncSharedFile({ transport, binding, localState, createWriteId, saveProgress }) {
  if (!binding) {
    return { status: k_syncStatuses.notConnected };
  }
  const { fileId } = binding;
  let localLedger = sharedLedgerOf(localState);
  let workingBinding = binding;
  for (let writeCount = 0; ; writeCount += 1) {
    const read = await readSharedDocument(transport, fileId);
    if (read.outcome) {
      return read.outcome;
    }
    const { document: remoteDocument, revision } = read;
    const baseline = selectBaseline(workingBinding, fileId, remoteDocument);
    if (!baseline) {
      const review = createJoinReview(localLedger, remoteDocument.ledger);
      return { status: k_syncStatuses.needsJoin, opened: { status: k_joinStatuses.choose, fileId, revision, document: remoteDocument, review } };
    }
    const pinned = { pinnedWriteId: baseline.writeId };
    const merge = mergeSharedLedgers(baseline.ledger, localLedger, remoteDocument.ledger, remoteDocument.representation);
    if (merge.conflicts.length) {
      const bindingOnApply = recordIncorporatedSnapshots(workingBinding, [remoteDocument], revision, pinned);
      return { status: k_syncStatuses.needsReview, review: { fileId, merge, localLedger, bindingOnApply } };
    }
    const validated = validatedMergeResult(merge.result);
    if (validated.outcome) {
      return validated.outcome;
    }
    localLedger = validated.ledger;
    workingBinding = recordIncorporatedSnapshots(workingBinding, [remoteDocument], revision, pinned);
    if (isSameLedger(localLedger, remoteDocument.ledger)) {
      const stopped = await saveOrStop(saveProgress, { state: withDeviceKeys(localLedger, localState), binding: workingBinding });
      return stopped ?? { status: k_syncStatuses.synced };
    }
    if (writeCount === k_maximumWriteAttempts) {
      return { status: k_syncStatuses.retryLater, reason: k_busyReason };
    }
    const encodedDocument = createSharedDocument(withDeviceKeys(localLedger, localState), { writeId: createWriteId(), parent: remoteDocument });
    workingBinding = recordIncorporatedSnapshots(workingBinding, [parseSharedDocument(encodedDocument)], revision, pinned);
    const stopped = await saveOrStop(saveProgress, { state: withDeviceKeys(localLedger, localState), binding: workingBinding });
    if (stopped) {
      return stopped;
    }
    try {
      await transport.write(fileId, encodedDocument);
    } catch (error) {
      return failureOutcome(error);
    }
  }
}

// Applies the person's choices. The review is refused if it was prepared for
// another file or if this device's ledger changed since, so an edit made
// meanwhile is never dropped. A choice that leaves a broken reference (for
// example removing an account an entry still uses) is refused with its reason.
export function applySyncReview({ review, choices, currentState, binding }) {
  if (!hasChosenEveryConflict(review.merge.conflicts, choices)) {
    return { status: k_reviewOutcomes.incomplete };
  }
  const isSameFile = binding?.fileId === review.fileId;
  if (!isSameFile || !isSameLedger(sharedLedgerOf(currentState), review.localLedger)) {
    return { status: k_reviewOutcomes.stale };
  }
  const resolvedLedger = applyMergeChoices(review.merge.result, review.merge.conflicts, choices);
  try {
    const state = validateState(withDeviceKeys(validateSharedLedger(resolvedLedger), currentState));
    return { status: k_reviewOutcomes.resolved, state, binding: review.bindingOnApply };
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    return { status: k_reviewOutcomes.invalid, message: error.message };
  }
}
