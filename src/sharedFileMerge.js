import { mergeThreeWay } from './engine.js';
import { sharedLedgerOf } from './sharedFileDocument.js';

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
