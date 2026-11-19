import { monthOf } from './calendar.js';
import { k_systemCategoryIds, k_transactionTypes } from './domainConstants.js';

// Interest income on a savings account comes from three sources: the app's
// own monthly entry, reviewed correction entries (LEDGER-2) and interest the
// bank posted, imported or typed by the owner.
export const k_interestBankChoices = Object.freeze({ bankOnly: 'bank', keepBoth: 'both' });

const k_appInterestIdPrefix = 'interest-';
const k_interestCorrectionIdPrefix = 'interest-correction-';
const k_monthKeyLength = 'YYYY-MM'.length;

export function appInterestId(accountId, month) {
  return `${k_appInterestIdPrefix}${accountId}-${month}`;
}

export function interestCorrectionId(accountId, month, sequence) {
  return `${k_interestCorrectionIdPrefix}${accountId}-${month}-${sequence}`;
}

export function isInterestIncome(transaction) {
  return transaction.type === k_transactionTypes.income && transaction.category === k_systemCategoryIds.interest;
}

export function isInterestCorrection(transaction) {
  return transaction.correctsInterestMonth !== undefined;
}

function isAccountInterestInMonth(transaction, accountId, month) {
  return isInterestIncome(transaction) && transaction.account === accountId && monthOf(transaction.date) === month;
}

// An app entry is recognised by its ID, even if it was later re-dated.
export function isAppInterestEntry(transaction, accountId) {
  const idMonth = String(transaction.id).slice(-k_monthKeyLength);
  return transaction.account === accountId && transaction.id === appInterestId(accountId, idMonth);
}

export function isAccountInterestCorrection(transaction, accountId, month) {
  return isInterestCorrection(transaction) && transaction.account === accountId && transaction.correctsInterestMonth === month;
}

export function hasInterestCorrection(transactions, accountId, month) {
  return transactions.some(transaction => isAccountInterestCorrection(transaction, accountId, month));
}

// The app entry and its corrections for one account and month.
export function appInterestEntries(transactions, accountId, month) {
  const appId = appInterestId(accountId, month);
  return transactions.filter(transaction => (transaction.id === appId && transaction.account === accountId)
    || isAccountInterestCorrection(transaction, accountId, month));
}

export function bankInterestEntries(transactions, accountId, month) {
  return transactions.filter(transaction => isAccountInterestInMonth(transaction, accountId, month)
    && !isAppInterestEntry(transaction, accountId) && !isInterestCorrection(transaction));
}

export function interestBankChoice(account, month) {
  return (account.interestBankChoices ?? []).find(choice => choice.month === month)?.choice ?? null;
}

// L05: with bank interest in a month, the app adds its own only when the
// owner chose to keep both.
export function appInterestAllowed(transactions, account, month) {
  if (!bankInterestEntries(transactions, account.id, month).length) {
    return true;
  }
  return interestBankChoice(account, month) === k_interestBankChoices.keepBoth;
}
