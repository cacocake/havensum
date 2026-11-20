import { isPositiveCentAmount } from './money.js';
import { k_systemCategoryIds, k_transactionTypes } from './domainConstants.js';

const k_advanceTitleSuffix = ' · advance payment';

export class InvalidAdvancePaymentError extends Error {}

// Owner decision P14: an advance or down-payment is recorded as a payment on
// the loan, marked as an advance, and lowers the recorded remaining balance in
// the same save (never below zero). It changes neither the payment history nor
// any plan; whether the monthly payment changed is the owner's next answer.
export function withAdvancePayment(state, { loanId, id, amount, date, account }) {
  const loan = state.loans.find(candidate => candidate.id === loanId);
  if (!loan) {
    throw new InvalidAdvancePaymentError('This loan no longer exists.');
  }
  if (!isPositiveCentAmount(amount)) {
    throw new InvalidAdvancePaymentError('Enter a positive advance payment.');
  }
  const advance = {
    id, type: k_transactionTypes.expense, title: `${loan.name}${k_advanceTitleSuffix}`,
    amount, date, account, category: k_systemCategoryIds.loan, loanId, loanAdvance: true
  };
  const remaining = Math.max(0, loan.remaining - amount);
  return {
    ...state,
    loans: state.loans.map(candidate => candidate.id === loanId ? { ...candidate, remaining } : candidate),
    transactions: [...state.transactions, advance]
  };
}
