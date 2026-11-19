import { monthOf, nextMonth } from './calendar.js';
import { compoundSavings, isSavingsAccount } from './savingsInterest.js';
import { interestRateForMonth } from './interestSchedule.js';
import { sumCents } from './money.js';
import { k_systemCategoryIds, k_transactionTypes } from './domainConstants.js';

// Savings accounts with a scheduled rate for `month` (0% included) estimate
// that month's interest; their historical interest no longer informs it.
export function scheduledInterestAccounts(state, month) {
  return (state.accounts ?? []).filter(account => isSavingsAccount(account) && interestRateForMonth(account, month) !== null);
}

function isInterestIncome(transaction) {
  return transaction.type === k_transactionTypes.income && transaction.category === k_systemCategoryIds.interest;
}

// Interest recorded in `month` on the given accounts.
export function scheduledInterestIncome(transactions, month, accountIds) {
  const amounts = transactions
    .filter(transaction => isInterestIncome(transaction) && accountIds.has(transaction.account) && monthOf(transaction.date) === month)
    .map(transaction => transaction.amount);
  return sumCents(amounts);
}

// Estimated interest entries through `throughMonth` under the existing
// compounding convention, each compounding the earlier estimates. Recorded
// entries are excluded and nothing is written to the ledger. Compute it once
// and share it across the months of one outlook.
export function interestProjection(state, throughMonth) {
  const recordedIds = new Set(state.transactions.map(transaction => transaction.id));
  const projectedState = compoundSavings(state, nextMonth(throughMonth));
  return projectedState.transactions.filter(transaction => !recordedIds.has(transaction.id));
}

// Per scheduled account: recorded interest counts once and replaces the
// scheduled estimate; otherwise the estimate is expected.
export function expectedInterest(state, month, projectedInterest = null) {
  const accounts = scheduledInterestAccounts(state, month);
  if (!accounts.length) {
    return [];
  }
  const estimates = projectedInterest ?? interestProjection(state, month);
  return accounts.map(account => {
    const accountIds = new Set([account.id]);
    const recorded = scheduledInterestIncome(state.transactions, month, accountIds);
    const scheduledEstimate = scheduledInterestIncome(estimates, month, accountIds);
    return {
      account: account.id,
      name: account.name,
      rate: interestRateForMonth(account, month),
      recorded,
      scheduledEstimate,
      expected: recorded > 0 ? recorded : scheduledEstimate
    };
  });
}
