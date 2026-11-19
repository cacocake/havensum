import { accountBalance } from './ledger.js';
import { daysInMonth, nextMonth } from './calendar.js';
import { firstInterestMonth, interestRateForMonth } from './interestSchedule.js';
import { k_spendingBehaviors, k_systemCategoryIds, k_transactionTypes } from './domainConstants.js';

const k_savingsTag = 'Savings';
const k_percentageScale = 100;
const k_monthsPerYear = 12;
const k_interestTitle = 'Savings interest';
const k_interestNote = 'Monthly compounding · effective annual rate';

// Effective annual rate converted to monthly compounding.
function monthlyRate(annualPercentage) {
  return Math.pow(1 + annualPercentage / k_percentageScale, 1 / k_monthsPerYear) - 1;
}

export function isSavingsAccount(account) {
  return account.tag === k_savingsTag;
}

// Posts at most one interest entry per savings account and completed month
// before `through`. Recorded interest entries are never regenerated.
export function compoundSavings(state, through) {
  const transactions = [...state.transactions];
  for (const account of state.accounts.filter(isSavingsAccount)) {
    const startMonth = firstInterestMonth(account);
    if (!startMonth) {
      continue;
    }
    for (let month = startMonth; month < through; month = nextMonth(month)) {
      const id = `interest-${account.id}-${month}`;
      const rate = interestRateForMonth(account, month);
      if (!rate || transactions.some(transaction => transaction.id === id)) {
        continue;
      }
      const date = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
      const eligibleBalance = Math.max(0, accountBalance({ ...state, transactions }, account.id, date));
      const amount = Math.round(eligibleBalance * monthlyRate(rate));
      if (amount <= 0) {
        continue;
      }
      transactions.push({
        id, type: k_transactionTypes.income, title: k_interestTitle, amount, date,
        account: account.id, category: k_systemCategoryIds.interest, kind: k_spendingBehaviors.fixed, note: k_interestNote
      });
    }
  }
  return { ...state, transactions };
}
