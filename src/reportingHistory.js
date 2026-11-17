import { k_transactionTypes } from './domainConstants.js';

const k_financialActivityTypes = new Set([k_transactionTypes.expense, k_transactionTypes.income]);

export function hasRecordedFinancialActivity(transactions, month) {
  return transactions.some(transaction => (
    transaction.date.startsWith(month) && k_financialActivityTypes.has(transaction.type)
  ));
}
