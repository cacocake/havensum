import { categoryPath } from './csvExchange.js';
import { k_transactionTypes } from './domainConstants.js';
import { movementFingerprint } from './movementFingerprint.js';

export function getBankDrafts(state, statement, targetAccount, statementNumber) {
  const accounts = state.accounts.filter(account => String(account.id) === String(targetAccount));
  if (accounts.length !== 1) {
    throw Error('Choose the account for this statement.');
  }
  const [account] = accounts;
  return statement.rows.map(row => {
    const bank = {
      sourceRow: row.sourceRow,
      statementNumber,
      statementName: statement.name,
      category: row.category,
      direction: row.movement?.direction,
      valueDate: row.movement?.date,
      amount: row.movement?.amount,
      error: row.error
    };
    const categories = row.category ? state.categories.filter(category =>
      category.name === row.category || categoryPath(state.categories, category.id) === row.category) : [];
    const transaction = {
      title: row.title,
      account: account.id,
      amount: row.movement?.amount,
      date: row.movement?.date,
      category: categories.length === 1 ? categories[0].id : undefined,
      externalSource: statement.bank.profile,
      sourceFingerprint: row.movement ? movementFingerprint(row) : undefined
    };
    return { bank, transaction };
  });
}

export function bankClassificationAllows(direction, type) {
  return direction === 'debit'
    ? type === k_transactionTypes.expense || type === k_transactionTypes.transfer
    : type === k_transactionTypes.income || type === k_transactionTypes.reimbursement;
}

export function validateBankDraft(bank, transaction, pair) {
  if (!bankClassificationAllows(bank.direction, transaction.type)) {
    throw Error('Choose a classification for this bank movement.');
  }
  if (transaction.type === k_transactionTypes.expense && transaction.category === undefined) {
    throw Error('Choose a category for this expense.');
  }
  if (transaction.type === k_transactionTypes.reimbursement && transaction.linkedId === undefined) {
    throw Error('Choose the original expense or explicitly record an unlinked balance adjustment.');
  }
  if (transaction.type === k_transactionTypes.transfer) {
    if (!pair) {
      throw Error('Choose the matching credit from another account to record this transfer.');
    }
    if (!pair.dateConfirmed) {
      throw Error('Choose which value date to use for this transfer.');
    }
  }
}

export function bankTransferCounterparts(review, index) {
  const outgoing = review.originals[index];
  return review.rows.filter(row => {
    const incoming = review.originals[row.index];
    return row.bank?.direction === 'credit'
      && !row.normalizationError
      && !row.bank.loanRequired
      && !row.transaction.type
      && (row.pairedBy === undefined || row.pairedBy === index)
      && incoming.account !== outgoing.account
      && incoming.amount === outgoing.amount;
  });
}
