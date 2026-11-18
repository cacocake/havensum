import { monthOf, k_calendarDateLength } from './calendar.js';
import { k_spendingBehaviors, k_transactionTypes } from './domainConstants.js';
import { expenseReportingMonth } from './plannedCosts.js';

const k_allDatesCutoff = '9999-12-31';
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

export function monthStats(state, month) {
  const expenses = netExpenses(state.transactions, month);
  const income = state.transactions
    .filter(transaction => transaction.type === k_transactionTypes.income && monthOf(transaction.date) === month)
    .reduce((total, transaction) => total + transaction.amount, 0);
  const spent = expenses.reduce((total, expense) => total + expense.net, 0);
  const reimbursed = expenses.reduce((total, expense) => total + expense.refunded, 0);
  return { income, spent, balance: income - spent, expenses, reimbursed };
}

export function reportingMonthStats(state, month, today = new Date().toISOString().slice(0, k_calendarDateLength)) {
  // Future months show registered entries. Past/current reports use received cash
  // and expenses through the reporting date, including original-month paybacks.
  if (month > monthOf(today)) {
    return monthStats(state, month);
  }
  const recordedState = {
    ...state,
    transactions: state.transactions.filter(transaction => transaction.date <= today)
  };
  return monthStats(recordedState, month);
}

export function accountBalance(state, accountId, until = k_allDatesCutoff) {
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
