import { localCalendarDate, monthOf } from './calendar.js';
import { k_spendingBehaviors, k_transactionTypes } from './domainConstants.js';
import { expenseReportingMonth } from './plannedCosts.js';
import { isScheduledEntry, postedLedger, scheduledTransactions } from './posting.js';

const k_lastCalendarDate = '9999-12-31';
const k_defaultCategory = {
  name: 'Uncategorized', color: '#aa9ca5', icon: 'Shapes', kind: k_spendingBehaviors.variable
};

export function hasCategoryParent(category) {
  return category.parentId !== undefined && category.parentId !== null && category.parentId !== '';
}

export function categorySettings(categories, categoryId) {
  const category = categories.find(category => category.id === categoryId);
  if (!category) {
    return { ...k_defaultCategory };
  }
  const parentSettings = hasCategoryParent(category) ? categorySettings(categories, category.parentId) : {};
  const explicitSettings = Object.entries(category).filter(([, value]) => value !== null && value !== undefined && value !== '');
  return { ...parentSettings, ...Object.fromEntries(explicitSettings) };
}

export function netExpenses(transactions, month) {
  return transactions
    .filter(transaction => transaction.type === k_transactionTypes.expense && expenseReportingMonth(transaction) === month)
    .map(expense => {
      const refunded = transactions
        .filter(transaction => transaction.type === k_transactionTypes.reimbursement && transaction.linkedId === expense.id)
        .reduce((total, reimbursement) => total + reimbursement.amount, 0);
      return { ...expense, net: Math.max(0, expense.amount - refunded), refunded };
    });
}

// The month whose report an entry changes: income by its date, an expense by
// its reporting month and a linked payback by its original expense's month.
// Transfers and unlinked balance adjustments change no report.
function reportsInMonth(state, transaction, month) {
  if (transaction.type === k_transactionTypes.income) {
    return monthOf(transaction.date) === month;
  }
  if (transaction.type === k_transactionTypes.expense) {
    return expenseReportingMonth(transaction) === month;
  }
  if (transaction.type !== k_transactionTypes.reimbursement) {
    return false;
  }
  const original = state.transactions.find(candidate => candidate.type === k_transactionTypes.expense && candidate.id === transaction.linkedId);
  return Boolean(original) && expenseReportingMonth(original) === month;
}

export function monthStats(state, month) {
  const expenses = netExpenses(state.transactions, month);
  const income = state.transactions
    .filter(transaction => transaction.type === k_transactionTypes.income && monthOf(transaction.date) === month)
    .reduce((total, transaction) => total + transaction.amount, 0);
  const spent = expenses.reduce((total, expense) => total + expense.net, 0);
  const reimbursed = expenses.reduce((total, expense) => total + expense.refunded, 0);
  return { income, spent, balance: income - spent, expenses, reimbursed };
}

export function reportingMonthStats(state, month, today = localCalendarDate()) {
  // L01: every month reports the entries posted by today, including
  // original-month paybacks received by then and early payments linked to a
  // later occurrence. Scheduled entries count from their date.
  return monthStats(postedLedger(state, today), month);
}

// What the month's report will gain once its scheduled entries post: income,
// net spending (a scheduled payback lowers it) and their balance.
export function scheduledMonthStats(state, month, today = localCalendarDate()) {
  const posted = monthStats(postedLedger(state, today), month);
  const registered = monthStats(state, month);
  const count = scheduledTransactions(state.transactions, today).filter(transaction => reportsInMonth(state, transaction, month)).length;
  return {
    income: registered.income - posted.income,
    spent: registered.spent - posted.spent,
    balance: registered.balance - posted.balance,
    count
  };
}

// L01: the current balance counts entries dated through today, by the device's
// local date. Later entries are scheduled and count from their date.
export function accountBalance(state, accountId, until = localCalendarDate()) {
  const account = state.accounts.find(account => account.id === accountId);
  if (!account) {
    return 0;
  }
  return state.transactions.filter(transaction => transaction.date <= until).reduce((balance, transaction) => {
    if (transaction.type === k_transactionTypes.transfer) {
      const received = transaction.toAccount === accountId ? transaction.amount : 0;
      const sent = transaction.account === accountId ? transaction.amount : 0;
      return balance + received - sent;
    }
    if (transaction.account !== accountId) {
      return balance;
    }
    return transaction.type === k_transactionTypes.expense ? balance - transaction.amount : balance + transaction.amount;
  }, account.openingBalance);
}

// What an account's balance gains (or loses) once its scheduled entries post.
export function scheduledAccountMovement(state, accountId, today = localCalendarDate()) {
  return accountBalance(state, accountId, k_lastCalendarDate) - accountBalance(state, accountId, today);
}

// An expense's linked paybacks: received by today, and scheduled for later.
export function expensePaybacks(transactions, expenseId, today = localCalendarDate()) {
  const paybacks = transactions.filter(transaction => transaction.type === k_transactionTypes.reimbursement && transaction.linkedId === expenseId);
  const received = paybacks.filter(payback => !isScheduledEntry(payback, today));
  const scheduled = paybacks.filter(payback => isScheduledEntry(payback, today));
  return {
    received,
    scheduled,
    receivedTotal: received.reduce((total, payback) => total + payback.amount, 0),
    scheduledTotal: scheduled.reduce((total, payback) => total + payback.amount, 0)
  };
}
