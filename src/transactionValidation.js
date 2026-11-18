import { euro, isPositiveCentAmount } from './money.js';
import { k_transactionTypes } from './domainConstants.js';
import { k_calendarDateLength } from './calendar.js';

const k_supportedTransactionTypes = new Set(Object.values(k_transactionTypes));
const k_isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const k_errors = {
  type: 'Choose a valid transaction type.',
  title: 'Add a title.',
  amount: 'Enter an amount greater than zero with at most two decimals.',
  category: 'Choose a valid category.',
  account: 'Choose an account.',
  date: 'Choose a valid date.',
  destination: 'Choose a different destination account.',
  missingExpense: 'The linked expense no longer exists.',
  receivedPaybacks: 'This expense has linked reimbursements. Adjust those first.'
};

function hasIdentifier(value) {
  return value !== undefined && value !== null && value !== '';
}

export function validateTransaction(state, transaction) {
  if (!k_supportedTransactionTypes.has(transaction?.type)) {
    throw Error(k_errors.type);
  }
  if (typeof transaction.title !== 'string' || !transaction.title.trim()) {
    throw Error(k_errors.title);
  }
  if (!isPositiveCentAmount(transaction.amount)) {
    throw Error(k_errors.amount);
  }

  const isTransfer = transaction.type === k_transactionTypes.transfer;
  const categoryExists = state.categories.some(category => category.id === transaction.category);
  if (!isTransfer && transaction.category && !categoryExists) {
    throw Error(k_errors.category);
  }
  if (!state.accounts.some(account => account.id === transaction.account)) {
    throw Error(k_errors.account);
  }

  const parsedDate = new Date(transaction.date);
  if (!k_isoDatePattern.test(transaction.date) || Number.isNaN(parsedDate.getTime())) {
    throw Error(k_errors.date);
  }
  if (parsedDate.toISOString().slice(0, k_calendarDateLength) !== transaction.date) {
    throw Error(k_errors.date);
  }

  const destinationExists = state.accounts.some(account => account.id === transaction.toAccount);
  if (isTransfer && (!destinationExists || transaction.account === transaction.toAccount)) {
    throw Error(k_errors.destination);
  }

  const receivedPaybacks = state.transactions
    .filter(record => hasIdentifier(transaction.id) && record.type === k_transactionTypes.reimbursement && record.linkedId === transaction.id)
    .reduce((total, reimbursement) => total + reimbursement.amount, 0);
  if (receivedPaybacks > 0 && (transaction.type !== k_transactionTypes.expense || transaction.amount < receivedPaybacks)) {
    throw Error(k_errors.receivedPaybacks);
  }

  if (transaction.type !== k_transactionTypes.reimbursement || !hasIdentifier(transaction.linkedId)) {
    return transaction;
  }

  const expense = state.transactions.find(record => record.id === transaction.linkedId && record.type === k_transactionTypes.expense);
  if (!expense) {
    throw Error(k_errors.missingExpense);
  }

  const otherPaybacks = state.transactions
    .filter(record => record.id !== transaction.id && record.type === k_transactionTypes.reimbursement && record.linkedId === expense.id)
    .reduce((total, reimbursement) => total + reimbursement.amount, 0);
  if (otherPaybacks + transaction.amount > expense.amount) {
    throw Error(`Only ${euro(expense.amount - otherPaybacks)} remains to reimburse.`);
  }
  return transaction;
}
