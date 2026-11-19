import { readSharedDocument } from './sharedFileSync.js';
import { sharedLedgerOf, withDeviceKeys } from './sharedFileDocument.js';
import { createBinding } from './sharedFileBinding.js';
import { isSameValue } from './sharedFileMerge.js';
import { withPaybackTasks } from './paybackState.js';
import { validateState } from './stateSchema.js';
import { applyMergeChoices, hasChosenEveryConflict } from './mergeReview.js';
import { k_planYearConflictField } from './planMerge.js';

// First join (G08) and merging a second file in (G09). Two ledgers with no
// common baseline cannot be merged three-way: the same real expense entered on
// both devices has two IDs. So every record found on only one side is listed
// for the person to keep or drop, and a record whose ID exists on both sides
// with different content is a choice between the two.
const k_paybackTasksCollection = 'paybackTasks';
const k_recordCollections = ['accounts', 'categories', 'transactions', 'loans', 'events', k_paybackTasksCollection];
const k_plansCollection = 'plans';
const k_outlookCollection = 'outlook';
const k_wholeRecordField = '$record';
export const k_joinSides = Object.freeze({ local: 'local', remote: 'remote' });

export function joinItemKey(item) {
  return `${item.collection}|${item.id}`;
}

function isEmptyRecord(value) {
  return value === undefined || value === null || (typeof value === 'object' && Object.keys(value).length === 0);
}

function recordsById(records) {
  return new Map((records ?? []).map(record => [record.id, record]));
}

function planYearsOf(ledger) {
  return new Map(Object.entries(ledger.plans ?? {}).map(([year, history]) => [year, { id: year, history }]));
}

function differingRecordConflict(collection, id, localRecord, remoteRecord) {
  if (collection === k_plansCollection) {
    // A year planned on both sides is chosen as a whole revision history.
    return { collection, id, field: k_planYearConflictField, base: undefined, local: localRecord.history, remote: remoteRecord.history };
  }
  return { collection, id, field: k_wholeRecordField, base: undefined, local: localRecord, remote: remoteRecord };
}

function compareKeyedRecords(collection, localRecords, remoteRecords, review) {
  for (const id of new Set([...localRecords.keys(), ...remoteRecords.keys()])) {
    const localRecord = localRecords.get(id);
    const remoteRecord = remoteRecords.get(id);
    if (localRecord && remoteRecord) {
      if (!isSameValue(localRecord, remoteRecord)) {
        review.conflicts.push(differingRecordConflict(collection, id, localRecord, remoteRecord));
      }
      continue;
    }
    const side = localRecord ? k_joinSides.local : k_joinSides.remote;
    review.oneSided.push({ collection, id, side, record: localRecord ?? remoteRecord });
  }
}

export function createJoinReview(localLedger, remoteLedger) {
  const review = { oneSided: [], conflicts: [], local: sharedLedgerOf(localLedger), remote: sharedLedgerOf(remoteLedger) };
  for (const collection of k_recordCollections) {
    compareKeyedRecords(collection, recordsById(localLedger[collection]), recordsById(remoteLedger[collection]), review);
  }
  compareKeyedRecords(k_plansCollection, planYearsOf(localLedger), planYearsOf(remoteLedger), review);
  const localOutlook = localLedger.outlook;
  const remoteOutlook = remoteLedger.outlook;
  if (!isEmptyRecord(localOutlook) && !isEmptyRecord(remoteOutlook) && !isSameValue(localOutlook, remoteOutlook)) {
    review.conflicts.push({ collection: k_outlookCollection, id: k_outlookCollection, field: '$outlook', base: undefined, local: localOutlook, remote: remoteOutlook });
  }
  return review;
}

// Adopting loses nothing when this device holds only example data (owner
// answer, 19 November 2026) or nothing the file lacks.
export function canAdoptWithoutChoice(localState, review) {
  if (localState.demo) {
    return true;
  }
  const hasLocalOnlyRecords = review.oneSided.some(item => item.side === k_joinSides.local);
  const hasLocalOnlyOutlook = isEmptyRecord(review.remote.outlook) && !isEmptyRecord(review.local.outlook);
  return !hasLocalOnlyRecords && !hasLocalOnlyOutlook && !review.conflicts.length;
}

export async function openSharedFile({ transport, fileId, localState }) {
  const read = await readSharedDocument(transport, fileId);
  if (read.outcome) {
    return read.outcome;
  }
  const review = createJoinReview(sharedLedgerOf(localState), read.document.ledger);
  const status = canAdoptWithoutChoice(localState, review) ? 'adopt' : 'choose';
  return { status, fileId, revision: read.revision, document: read.document, review };
}

// Replaces this device's ledger with the file. A device with entries of its
// own must save a recovery copy first (commitSharedFileJoin does).
export function adoptSharedFile(opened, localState) {
  const state = validateState({ ...withDeviceKeys(opened.document.ledger, localState), demo: false });
  return { state, binding: createBinding(opened.fileId, { revision: opened.revision, snapshots: [opened.document] }), needsRecoveryCopy: !localState.demo };
}

function keptRecords(review, collection, droppedKeys) {
  return review.oneSided
    .filter(item => item.collection === collection && !droppedKeys.has(joinItemKey(item)))
    .map(item => item.record);
}

function sharedRecords(review, collection) {
  const remoteRecords = recordsById(review.remote[collection]);
  return (review.local[collection] ?? []).filter(record => remoteRecords.has(record.id) && isSameValue(record, remoteRecords.get(record.id)));
}

// Builds the joined ledger from the person's decisions: one-sided records are
// kept unless dropped, and every two-sided difference needs a chosen side.
export function buildJoinedLedger(review, { droppedKeys = new Set(), choices = {} } = {}) {
  if (!hasChosenEveryConflict(review.conflicts, choices)) {
    throw new Error('Choose a side for every record that differs before joining.');
  }
  let ledger = { ...review.remote };
  for (const collection of k_recordCollections) {
    const records = [...sharedRecords(review, collection), ...keptRecords(review, collection, droppedKeys)];
    if (collection !== k_paybackTasksCollection) {
      ledger[collection] = records;
      continue;
    }
    const eitherSideTracksPaybacks = review.remote.paybackTasks !== undefined || review.local.paybackTasks !== undefined;
    ledger = withPaybackTasks(ledger, eitherSideTracksPaybacks ? records : undefined);
  }
  const plans = {};
  for (const [year, { history }] of planYearsOf(review.local)) {
    if (review.remote.plans?.[year] && isSameValue(history, review.remote.plans[year])) {
      plans[year] = history;
    }
  }
  for (const item of keptRecords(review, k_plansCollection, droppedKeys)) {
    plans[item.id] = item.history;
  }
  ledger.plans = plans;
  ledger.outlook = isEmptyRecord(review.remote.outlook) ? review.local.outlook : review.remote.outlook;
  const warnings = [...(review.local.migrationCategoryWarnings ?? []), ...(review.remote.migrationCategoryWarnings ?? [])];
  ledger.migrationCategoryWarnings = warnings.length ? warnings : undefined;
  return applyMergeChoices(withConflictPlaceholders(ledger, review.conflicts), review.conflicts, choices);
}

// A two-sided record starts from the remote copy so choosing either side
// replaces it whole. Plan years and the outlook are set by the choice itself.
function withConflictPlaceholders(ledger, conflicts) {
  const result = { ...ledger };
  for (const conflict of conflicts) {
    if (conflict.collection === k_plansCollection || conflict.collection === k_outlookCollection) {
      continue;
    }
    result[conflict.collection] = [...(result[conflict.collection] ?? []), conflict.remote];
  }
  return result;
}

// The joined ledger becomes this device's ledger; the file is the baseline,
// so the next sync writes this device's additions to it.
export function mergeIntoSharedFile(opened, localState, decisions) {
  const ledger = buildJoinedLedger(opened.review, decisions);
  const state = validateState({ ...withDeviceKeys(ledger, localState), demo: false });
  return { state, binding: createBinding(opened.fileId, { revision: opened.revision, snapshots: [opened.document] }), needsRecoveryCopy: true };
}

// G09: a second file is merged into the ledger of the file being kept. The
// link stays on the kept file and the other file is never changed or deleted.
export async function openSecondSharedFile({ transport, fileId, localState }) {
  const read = await readSharedDocument(transport, fileId);
  if (read.outcome) {
    return read.outcome;
  }
  return { status: 'choose', fileId, revision: read.revision, document: read.document, review: createJoinReview(sharedLedgerOf(localState), read.document.ledger) };
}

export function mergeSecondSharedFile(opened, localState, decisions) {
  const ledger = buildJoinedLedger(opened.review, decisions);
  return { state: validateState(withDeviceKeys(ledger, localState)), needsRecoveryCopy: true };
}

// Saves a join in a safe order: recovery copy first (a failure blocks the
// join), then the ledger, then the link, so a link never points at
// snapshots the saved ledger does not contain.
export async function commitSharedFileJoin(storage, { state, binding, needsRecoveryCopy }, previousState) {
  if (needsRecoveryCopy) {
    await storage.writeSharedFileJoinRecovery(previousState);
  }
  await storage.writeState(state);
  if (binding) {
    await storage.writeSharedFileBinding(binding);
  }
}
