import { accountBalance } from './ledger.js';
import { monthOf, nextMonth } from './calendar.js';
import { sumCents } from './money.js';
import { shortMonthLabel } from './monthLabels.js';
import { firstInterestMonth, interestRateForMonth } from './interestSchedule.js';
import { appInterestEntry, interestPostingDate, monthlyInterestAmount } from './savingsInterest.js';
import {
  appInterestEntries, bankInterestEntries, interestCorrectionId, isInterestCorrection, isInterestIncome, k_interestBankChoices
} from './interestEntries.js';

function amountsOf(transactions) {
  return sumCents(transactions.map(transaction => transaction.amount));
}

function isAppOrCorrectionInterest(transaction, accountId) {
  return isInterestIncome(transaction) && transaction.account === accountId
    && appInterestEntries([transaction], accountId, monthOf(transaction.date)).length > 0;
}

// The first completed month the review looks at: the draft's first rate, or
// an earlier month that already holds app interest or a correction.
function firstReviewedMonth(state, draftAccount) {
  const recordedMonths = state.transactions
    .filter(transaction => isAppOrCorrectionInterest(transaction, draftAccount.id))
    .map(transaction => monthOf(transaction.date));
  const candidates = [firstInterestMonth(draftAccount), ...recordedMonths].filter(Boolean).sort();
  return candidates[0] ?? null;
}

function closingBalanceWithoutOwnInterest(state, transactions, accountId, month) {
  const ownInterest = appInterestEntries(transactions, accountId, month);
  const otherTransactions = transactions.filter(transaction => !ownInterest.includes(transaction));
  return accountBalance({ ...state, transactions: otherTransactions }, accountId, interestPostingDate(month));
}

// L05: with bank interest, the app's share is nothing unless both are kept.
function correctedAppInterest(computed, hasBankInterest, choice) {
  if (!hasBankInterest || choice === k_interestBankChoices.keepBoth) {
    return computed;
  }
  return 0;
}

// Draft choices replace stored ones for the same month.
function mergedChoices(storedChoices, draftChoices) {
  const draftMonths = new Set(draftChoices.map(choice => choice.month));
  return [...storedChoices.filter(choice => !draftMonths.has(choice.month)), ...draftChoices]
    .sort((first, second) => first.month.localeCompare(second.month));
}

function choiceFor(choices, month) {
  return choices.find(choice => choice.month === month)?.choice ?? null;
}

// L03–L06: compares every completed month's recorded app interest (its app
// entry plus earlier corrections) with what the balances and the draft rates
// earn, compounding month by month on the corrected amounts. Only months that
// change or need a bank-interest choice are listed. Nothing is written.
export function interestCorrectionReview(state, accountId, { currentMonth, schedule, choices } = {}) {
  const account = state.accounts.find(candidate => candidate.id === accountId);
  if (!account) {
    throw new Error('The savings account is no longer available.');
  }
  const draftAccount = {
    ...account,
    interestSchedule: schedule ?? account.interestSchedule ?? [],
    interestBankChoices: mergedChoices(account.interestBankChoices ?? [], choices ?? [])
  };
  const months = [];
  const bankInterestMonths = [];
  const startMonth = firstReviewedMonth(state, draftAccount);
  let correctedTransactions = state.transactions.filter(transaction => !isAppOrCorrectionInterest(transaction, accountId));
  for (let month = startMonth; month && month < currentMonth; month = nextMonth(month)) {
    const recorded = amountsOf(appInterestEntries(state.transactions, accountId, month));
    const bank = amountsOf(bankInterestEntries(state.transactions, accountId, month));
    const hasBankInterest = bankInterestEntries(state.transactions, accountId, month).length > 0;
    const rate = interestRateForMonth(draftAccount, month);
    const choice = choiceFor(draftAccount.interestBankChoices, month);
    const computed = monthlyInterestAmount(closingBalanceWithoutOwnInterest(state, correctedTransactions, accountId, month), rate);
    const needsChoice = hasBankInterest && !choice && (recorded !== 0 || computed > 0);
    const corrected = needsChoice ? recorded : correctedAppInterest(computed, hasBankInterest, choice);
    const computedOnRecordedHistory = monthlyInterestAmount(closingBalanceWithoutOwnInterest(state, state.transactions, accountId, month), rate);
    const directCorrection = correctedAppInterest(computedOnRecordedHistory, hasBankInterest, choice);
    const difference = corrected - recorded;
    if (hasBankInterest && (recorded !== 0 || computed > 0 || choice)) {
      bankInterestMonths.push({ month, bank, appInterest: computed, recorded, choice, needsChoice });
    }
    if (corrected !== 0) {
      correctedTransactions = [...correctedTransactions, appInterestEntry(accountId, month, corrected)];
    }
    if (difference === 0 && !needsChoice) {
      continue;
    }
    months.push({
      month, rate, recorded, bank, corrected, difference, needsChoice, choice,
      compoundingEffect: difference !== 0 && directCorrection === recorded
    });
  }
  return {
    accountId, currentMonth, months, bankInterestMonths,
    total: sumCents(months.map(month => month.difference)),
    needsChoice: months.some(month => month.needsChoice)
  };
}

export class StaleInterestCorrectionError extends Error {
  constructor() {
    super('The ledger changed since this review. Review the corrections again.');
  }
}

export class InterestChoiceRequiredError extends Error {
  constructor() {
    super('Choose how to treat the bank interest in each listed month first.');
  }
}

const k_correctionTitle = 'Interest correction';

function correctionEntry(state, accountId, month, amount) {
  const sequence = state.transactions.filter(transaction => transaction.account === accountId
    && isInterestCorrection(transaction) && transaction.correctsInterestMonth === month).length + 1;
  return {
    ...appInterestEntry(accountId, month, amount),
    id: interestCorrectionId(accountId, month, sequence),
    title: k_correctionTitle,
    note: `Reviewed correction of ${shortMonthLabel(month)} interest`,
    correctsInterestMonth: month
  };
}

// A month without app interest gets its ordinary entry; otherwise the
// difference is a marked correction and the recorded entries stay (L04).
function entryForMonth(state, accountId, reviewedMonth) {
  const hasAppInterest = appInterestEntries(state.transactions, accountId, reviewedMonth.month).length > 0;
  if (!hasAppInterest && reviewedMonth.difference > 0) {
    return appInterestEntry(accountId, reviewedMonth.month, reviewedMonth.difference);
  }
  return correctionEntry(state, accountId, reviewedMonth.month, reviewedMonth.difference);
}

function sameReview(first, second) {
  return JSON.stringify(first.months) === JSON.stringify(second.months) && first.currentMonth === second.currentMonth;
}

// Applies a reviewed correction exactly as previewed. The ledger is checked
// again first, so a stale or repeated apply never duplicates a correction.
export function applyInterestCorrection(state, accountId, review, draft) {
  const currentReview = interestCorrectionReview(state, accountId, draft);
  if (!sameReview(review, currentReview)) {
    throw new StaleInterestCorrectionError();
  }
  if (currentReview.needsChoice) {
    throw new InterestChoiceRequiredError();
  }
  const accounts = state.accounts.map(account => {
    if (account.id !== accountId) {
      return account;
    }
    const correctedAccount = { ...account };
    if (draft.schedule) {
      correctedAccount.interestSchedule = draft.schedule;
    }
    const choices = mergedChoices(account.interestBankChoices ?? [], draft.choices ?? []);
    if (choices.length) {
      correctedAccount.interestBankChoices = choices;
    }
    return correctedAccount;
  });
  let transactions = state.transactions;
  for (const reviewedMonth of currentReview.months.filter(month => month.difference !== 0)) {
    transactions = [...transactions, entryForMonth({ ...state, transactions }, accountId, reviewedMonth)];
  }
  return { ...state, accounts, transactions };
}
