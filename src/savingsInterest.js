import { accountBalance } from './ledger.js';
import { daysInMonth, nextMonth } from './calendar.js';
import { firstInterestMonth, interestRateForMonth } from './interestSchedule.js';
import { k_spendingBehaviors, k_systemCategoryIds, k_transactionTypes } from './domainConstants.js';
import { appInterestAllowed, appInterestId, hasInterestCorrection } from './interestEntries.js';

const k_savingsTag = 'Savings';
const k_percentageScale = 100;
const k_monthsPerYear = 12;
const k_interestTitle = 'Savings interest';
const k_interestNote = 'Monthly compounding · effective annual rate';

// Effective annual rate converted to monthly compounding.
function monthlyRate(annualPercentage) {
  return Math.pow(1 + annualPercentage / k_percentageScale, 1 / k_monthsPerYear) - 1;
}

// One completed month's interest in integer cents; a non-positive balance earns nothing.
export function monthlyInterestAmount(closingBalance, annualPercentage) {
  if (!annualPercentage) {
    return 0;
  }
  return Math.round(Math.max(0, closingBalance) * monthlyRate(annualPercentage));
}

// Interest is dated on the last day of the month it was earned in.
export function interestPostingDate(month) {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
}

export function appInterestEntry(accountId, month, amount) {
  return {
    id: appInterestId(accountId, month), type: k_transactionTypes.income, title: k_interestTitle, amount, date: interestPostingDate(month),
    account: accountId, category: k_systemCategoryIds.interest, kind: k_spendingBehaviors.fixed, note: k_interestNote
  };
}

export function isSavingsAccount(account) {
  return account.tag === k_savingsTag;
}

// Posts at most one interest entry per savings account and completed month
// before `through`. Recorded interest entries are never regenerated, and a
// month holding bank interest waits for the owner's choice (L05), and a month
// with reviewed corrections is left as reviewed.
export function compoundSavings(state, through) {
  const transactions = [...state.transactions];
  const transactionIds = new Set(transactions.map(transaction => transaction.id));
  for (const account of state.accounts.filter(isSavingsAccount)) {
    const startMonth = firstInterestMonth(account);
    if (!startMonth) {
      continue;
    }
    for (let month = startMonth; month < through; month = nextMonth(month)) {
      const id = appInterestId(account.id, month);
      const rate = interestRateForMonth(account, month);
      // A month holding corrections was reviewed; startup never adds to it.
      const isReviewedMonth = hasInterestCorrection(transactions, account.id, month);
      if (!rate || transactionIds.has(id) || isReviewedMonth || !appInterestAllowed(transactions, account, month)) {
        continue;
      }
      const closingBalance = accountBalance({ ...state, transactions }, account.id, interestPostingDate(month));
      const amount = monthlyInterestAmount(closingBalance, rate);
      if (amount <= 0) {
        continue;
      }
      transactionIds.add(id);
      transactions.push(appInterestEntry(account.id, month, amount));
    }
  }
  return { ...state, transactions };
}
