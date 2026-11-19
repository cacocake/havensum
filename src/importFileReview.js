import { getImportMapping, normalizeImportRows } from './importNormalization.js';
import { previewTransactionImport, reviseTransactionImport } from './importReview.js';
import { k_transactionTypes } from './domainConstants.js';
import { getBankDrafts } from './realBankReview.js';
import { getCashewDrafts } from './cashewReview.js';

export function previewImportFile(state, data, options = {}) {
  if (data.cashew) {
    const { drafts, pendingAccounts, suggestedTransfers } = getCashewDrafts(state, data, options);
    const review = previewTransactionImport(state, drafts.map(draft => draft.transaction), {
      bankRows: drafts.map(draft => draft.bank), pendingAccounts
    });
    return suggestedTransfers.reduce((suggested, { debitIndex, creditIndex }) =>
      reviseTransactionImport(state, suggested, debitIndex, { type: k_transactionTypes.transfer, counterpartIndex: creditIndex }), review);
  }
  if (data.bank) {
    const statements = options.statements ?? [{ data, targetAccount: options.targetAccount }];
    const drafts = statements.flatMap((statement, index) =>
      getBankDrafts(state, statement.data, statement.targetAccount, index + 1));
    const transactions = drafts.map(draft => draft.transaction);
    return previewTransactionImport(state, transactions, { bankRows: drafts.map(draft => draft.bank) });
  }
  const mapping = options.mapping || getImportMapping(data);
  const errors = new Map();
  const transactions = data.rows.map((row, index) => {
    try {
      return normalizeImportRows(state, { ...data, rows: [row] }, { ...options, mapping })[0];
    } catch (error) {
      errors.set(index, error.message.replace(/^Row 1: /, ''));
      return { title: String(row[mapping.title] || 'Unmapped transaction') };
    }
  });
  const review = previewTransactionImport(state, transactions);
  for (const [index, error] of errors) {
    review.rows[index].normalizationError = error;
    review.rows[index].status = 'invalid';
    review.rows[index].error = error;
  }
  return review;
}
