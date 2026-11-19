import { monthOf, nextMonth } from './calendar.js';
import { compoundSavings, isSavingsAccount } from './savingsInterest.js';
import { firstInterestMonth, interestRateForMonth } from './interestSchedule.js';
import { k_systemCategoryIds, k_transactionTypes } from './domainConstants.js';

// Savings accounts with a rate schedule estimate their own interest; their
// historical interest no longer informs expected income.
export function scheduledInterestAccounts(state) {
  return (state.accounts ?? []).filter(account => isSavingsAccount(account) && firstInterestMonth(account));
}

export function isScheduledInterest(transaction, scheduledAccountIds) {
  return transaction.type === k_transactionTypes.income
    && transaction.category === k_systemCategoryIds.interest
    && scheduledAccountIds.has(transaction.account);
}

// Interest recorded in `month` on accounts whose rates are scheduled.
export function scheduledInterestIncome(transactions, month, scheduledAccountIds) {
  return transactions
    .filter(transaction => monthOf(transaction.date) === month && isScheduledInterest(transaction, scheduledAccountIds))
    .reduce((total, transaction) => total + transaction.amount, 0);
}

function interestInMonth(transactions, accountId, month) {
  return transactions
    .filter(transaction => transaction.account === accountId && monthOf(transaction.date) === month
      && transaction.type === k_transactionTypes.income && transaction.category === k_systemCategoryIds.interest)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

// Per scheduled account: recorded interest counts once; otherwise the
// existing compounding convention estimates the month from projected
// balances, compounding earlier estimates. Nothing is written to the ledger.
export function expectedInterest(state, month) {
  const accounts = scheduledInterestAccounts(state);
  if (!accounts.length) {
    return [];
  }
  const recordedIds = new Set(state.transactions.map(transaction => transaction.id));
  const projectedState = compoundSavings(state, nextMonth(month));
  const estimates = projectedState.transactions.filter(transaction => !recordedIds.has(transaction.id));
  return accounts.map(account => {
    const recorded = interestInMonth(state.transactions, account.id, month);
    const estimated = interestInMonth(estimates, account.id, month);
    return {
      account: account.id,
      name: account.name,
      rate: interestRateForMonth(account, month),
      recorded,
      estimated,
      expected: recorded > 0 ? recorded : estimated
    };
  });
}
