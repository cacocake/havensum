import { mergeThreeWay } from './engine.js';
import { sharedLedgerOf } from './sharedFileDocument.js';
import { k_mergeConflictFields } from './mergeReview.js';

// References the ledger validation requires to resolve. A record deleted on one
// side while the other side started using it must be reviewed, not merged into
// a ledger that no longer validates.
const k_references = Object.freeze([
  { collection: 'transactions', target: 'accounts', idsOf: transaction => [transaction.account, transaction.toAccount] },
  { collection: 'transactions', target: 'categories', idsOf: transaction => [transaction.category] },
  { collection: 'transactions', target: 'transactions', idsOf: transaction => [transaction.linkedId] },
  { collection: 'transactions', target: 'events', idsOf: transaction => [transaction.plannedCost?.eventId] },
  { collection: 'loans', target: 'accounts', idsOf: loan => [loan.account] },
  { collection: 'categories', target: 'categories', idsOf: category => [category.parentId] }
]);

function isReference(value) {
  return value !== undefined && value !== null && value !== '';
}

function findRecord(ledger, collection, id) {
  return (ledger[collection] ?? []).find(record => record.id === id);
}

// Puts back each referenced record that one side deleted and offers the
// deletion for review. Repeats until every reference resolves, so restoring a
// subcategory also restores its parent.
function reviewDeletedReferences(base, local, remote, result, conflicts) {
  for (let restoredAny = true; restoredAny; ) {
    restoredAny = false;
    for (const { collection, target, idsOf } of k_references) {
      const presentIds = new Set((result[target] ?? []).map(record => record.id));
      for (const record of result[collection] ?? []) {
        for (const id of idsOf(record).filter(isReference)) {
          if (presentIds.has(id)) {
            continue;
          }
          const localRecord = findRecord(local, target, id);
          const remoteRecord = findRecord(remote, target, id);
          const keptRecord = localRecord ?? remoteRecord;
          if (!keptRecord) {
            continue;
          }
          result[target] = [...result[target], keptRecord];
          presentIds.add(id);
          restoredAny = true;
          const alreadyOffered = conflicts.some(conflict => conflict.collection === target && conflict.id === id);
          if (!alreadyOffered) {
            conflicts.push({ collection: target, id, field: k_mergeConflictFields.record, base: findRecord(base, target, id), local: localRecord, remote: remoteRecord });
          }
        }
      }
    }
  }
}

const k_warningsKey = 'migrationCategoryWarnings';

function warningsByTransaction(ledger) {
  return new Map((ledger[k_warningsKey] ?? []).map(warning => [warning.transactionId, warning]));
}

// The shared missing-category review is a to-do list: a warning either side
// accepted stays accepted, and a warning either side added is kept while its
// transaction exists.
function mergeCategoryWarnings(base, local, remote, mergedTransactions) {
  const baseWarnings = warningsByTransaction(base);
  const localWarnings = warningsByTransaction(local);
  const remoteWarnings = warningsByTransaction(remote);
  const existingTransactionIds = new Set(mergedTransactions.map(transaction => transaction.id));
  const merged = [];
  for (const transactionId of new Set([...localWarnings.keys(), ...remoteWarnings.keys()])) {
    const wasPending = baseWarnings.has(transactionId);
    const stillPending = wasPending
      ? localWarnings.has(transactionId) && remoteWarnings.has(transactionId)
      : true;
    if (stillPending && existingTransactionIds.has(transactionId)) {
      merged.push(localWarnings.get(transactionId) ?? remoteWarnings.get(transactionId));
    }
  }
  return merged.length ? merged : undefined;
}

// Three-way merge of shared ledgers only, so no device key can be copied
// from one side into the merged file.
export function mergeSharedLedgers(base, local, remote, representation = {}) {
  const sharedBase = sharedLedgerOf(base);
  const sharedLocal = sharedLedgerOf(local);
  const sharedRemote = sharedLedgerOf(remote);
  const { result, conflicts } = mergeThreeWay(sharedBase, sharedLocal, sharedRemote, representation);
  const merged = sharedLedgerOf(result);
  reviewDeletedReferences(sharedBase, sharedLocal, sharedRemote, merged, conflicts);
  const warnings = mergeCategoryWarnings(sharedBase, sharedLocal, sharedRemote, merged.transactions);
  if (warnings) {
    merged[k_warningsKey] = warnings;
  } else {
    delete merged[k_warningsKey];
  }
  return { result: merged, conflicts };
}

// Key order differs between merged and parsed ledgers, so compare canonically.
function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value).sort()
      .filter(key => value[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function isSameValue(first, second) {
  return canonicalJson(first) === canonicalJson(second);
}

export function isSameLedger(first, second) {
  return isSameValue(sharedLedgerOf(first), sharedLedgerOf(second));
}
