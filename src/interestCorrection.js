import { accountBalance } from './ledger.js';
import { monthOf, nextMonth } from './calendar.js';
import { k_transactionTypes } from './domainConstants.js';
import { sumCents } from './money.js';
import { shortMonthLabel } from './monthLabels.js';
import { firstInterestMonth, interestRateForMonth, requireCorrectableStart } from './interestSchedule.js';
import { appInterestEntry, interestPostingDate, monthlyInterestAmount } from './savingsInterest.js';
import {
  appInterestEntries, appInterestId, bankInterestEntries, interestCorrectionId, isAccountInterestCorrection, isAppInterestEntry,
  interestEntryMonth, isInterestCorrection, isInterestIncome, k_interestBankChoices
} from './interestEntries.js';

const k_correctionTitle = 'Interest correction';
const k_correctionSequencePattern = /-(\d+)$/;

function amountsOf(transactions) {
  return sumCents(transactions.map(transaction => transaction.amount));
}

function isAppOrCorrectionInterest(transaction, accountId) {
  return isInterestIncome(transaction) && transaction.account === accountId
    && (isAppInterestEntry(transaction, accountId) || isInterestCorrection(transaction));
}

// A transfer moves money into its target account; no other type does.
function isAccountTransaction(transaction, accountId) {
  if (transaction.account === accountId) {
    return true;
  }
  return transaction.type === k_transactionTypes.transfer && transaction.toAccount === accountId;
}

// App interest and corrections belong to the month they were earned in, even when re-dated.
function recordedInterestMonths(state, accountId) {
  return state.transactions
    .filter(transaction => isAppOrCorrectionInterest(transaction, accountId))
    .map(interestEntryMonth);
}

function earliestOf(months) {
  return months.filter(Boolean).sort()[0] ?? null;
}

// LEDGER-2a (L07): the earliest month a correction may start in is the
// account's first recorded entry (a transfer into it included) or its first
// stored rate period, whichever is earlier. An account with neither, or whose
// first entry is still scheduled, may start from the current month.
export function earliestCorrectableMonth(state, accountId, currentMonth) {
  const account = state.accounts.find(candidate => candidate.id === accountId);
  const firstStoredRateMonth = account ? firstInterestMonth(account) : null;
  const entryDateMonths = state.transactions
    .filter(transaction => isAccountTransaction(transaction, accountId))
    .map(transaction => monthOf(transaction.date));
  return earliestOf([currentMonth, firstStoredRateMonth, ...entryDateMonths, ...recordedInterestMonths(state, accountId)]);
}

// The first completed month the review looks at: the draft's first rate, or
// an earlier month that already holds app interest or a correction.
function firstReviewedMonth(state, draftAccount) {
  return earliestOf([firstInterestMonth(draftAccount), ...recordedInterestMonths(state, draftAccount.id)]);
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
  const firstDraftMonth = firstInterestMonth(draftAccount);
  if (firstDraftMonth) {
    requireCorrectableStart(firstDraftMonth, { earliestMonth: earliestCorrectableMonth(state, accountId, currentMonth), currentMonth });
  }
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


// The next free number after the highest kept correction for the month.
function nextCorrectionId(state, accountId, month) {
  const transactionIds = new Set(state.transactions.map(transaction => transaction.id));
  const usedSequences = state.transactions
    .filter(transaction => isAccountInterestCorrection(transaction, accountId, month))
    .map(transaction => Number(k_correctionSequencePattern.exec(String(transaction.id))?.[1] ?? 0));
  let sequence = Math.max(0, ...usedSequences) + 1;
  while (transactionIds.has(interestCorrectionId(accountId, month, sequence))) {
    sequence += 1;
  }
  return interestCorrectionId(accountId, month, sequence);
}

function correctionEntry(state, accountId, month, amount) {
  return {
    ...appInterestEntry(accountId, month, amount),
    id: nextCorrectionId(state, accountId, month),
    title: k_correctionTitle,
    note: `Reviewed correction of ${shortMonthLabel(month)} interest`,
    correctsInterestMonth: month
  };
}

// A month without app interest gets its ordinary entry; otherwise the
// difference is a marked correction and the recorded entries stay (L04).
function entryForMonth(state, accountId, reviewedMonth) {
  const appId = appInterestId(accountId, reviewedMonth.month);
  const hasAppInterest = state.transactions.some(transaction => transaction.id === appId)
    || appInterestEntries(state.transactions, accountId, reviewedMonth.month).length > 0;
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
    if (draft.schedule?.length) {
      // An account keeps either a schedule or an unscheduled legacy rate.
      correctedAccount.interestSchedule = draft.schedule;
      delete correctedAccount.unscheduledInterest;
    } else if (draft.schedule) {
      delete correctedAccount.interestSchedule;
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
