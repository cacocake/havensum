import { clearMissingTransactionCategories, migrateState, UnsupportedStateVersionError } from './stateSchema.js';
import { plannedYears, planRevisions } from './planArchive.js';

const k_ledgerCollections = ['accounts', 'categories', 'transactions', 'loans', 'events'];
const k_restoreMessages = Object.freeze({
  unreadable: 'This file is not a readable JSON backup. Nothing was changed.',
  notLedger: 'This file is not a full Havensum backup. Use Import transactions for transaction lists. Nothing was changed.',
  futureVersion: 'This backup was made by a newer version of Havensum. Update the app before restoring it. Nothing was changed.',
  invalid: 'This backup could not be validated, so it cannot replace your ledger. Nothing was changed.'
});

function isLedgerBackup(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    && data.version !== undefined && k_ledgerCollections.every(collection => Array.isArray(data[collection]));
}

export function restoreSummary(state) {
  return {
    accounts: state.accounts.length,
    transactions: state.transactions.length,
    categories: state.categories.length,
    loans: state.loans.length,
    events: state.events.length,
    planYears: plannedYears(state).map(year => ({ year, revisions: planRevisions(state, year).length })),
    scheduledRateAccounts: state.accounts.filter(account => account.interestSchedule?.length).length
  };
}

// Reads a full JSON backup for preview. Nothing is written: the caller
// replaces the ledger only after explicit confirmation and a recovery copy.
export function prepareFullRestore(fileText, currentState = null) {
  let data;
  try {
    data = JSON.parse(fileText);
  } catch {
    throw new SyntaxError(k_restoreMessages.unreadable);
  }
  if (!isLedgerBackup(data)) {
    throw new SyntaxError(k_restoreMessages.notLedger);
  }
  let restoredState;
  let missingCategories;
  try {
    const reviewable = clearMissingTransactionCategories(data);
    missingCategories = reviewable.missingCategories;
    restoredState = migrateState(reviewable.state);
  } catch (error) {
    if (error instanceof UnsupportedStateVersionError) {
      throw new SyntaxError(k_restoreMessages.futureVersion);
    }
    throw new SyntaxError(k_restoreMessages.invalid);
  }
  return {
    restoredState,
    missingCategories,
    summary: restoreSummary(restoredState),
    basis: currentState === null ? null : JSON.stringify(currentState)
  };
}

// A preview only applies to the ledger it was compared with.
export function isRestorePreviewCurrent(preview, currentState) {
  return preview.basis === JSON.stringify(currentState);
}
