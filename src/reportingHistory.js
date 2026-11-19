import { k_reportingPeriods, k_transactionTypes } from './domainConstants.js';
import { expenseReportingMonth } from './plannedCosts.js';

const k_financialActivityTypes = new Set([k_transactionTypes.expense, k_transactionTypes.income]);

export function hasRecordedFinancialActivity(transactions, month) {
  return transactions.some(transaction => (
    k_financialActivityTypes.has(transaction.type)
    && (transaction.type === k_transactionTypes.expense ? expenseReportingMonth(transaction) === month : transaction.date.startsWith(month))
  ));
}

export function reportingPeriod(month, currentMonth) {
  if (month < currentMonth) {
    return k_reportingPeriods.past;
  }
  if (month > currentMonth) {
    return k_reportingPeriods.future;
  }
  return k_reportingPeriods.current;
}
