import { isTimestamp } from './paybackState.js';

// Before loans kept a payment history (LOAN-1a), a loan could record when its
// monthly payment was last edited, as an exact UTC instant (`paymentEditedAt`).
// The field is kept on loans that have it and no longer written.
export function isValidPaymentEditedAt(loan) {
  return loan.paymentEditedAt === undefined || isTimestamp(loan.paymentEditedAt);
}
