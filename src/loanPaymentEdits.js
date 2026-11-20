import { isTimestamp } from './paybackState.js';

// A loan may record when its monthly payment was last edited, as an exact UTC
// instant (`paymentEditedAt`). Loans saved before it existed simply lack it.
export function isValidPaymentEditedAt(loan) {
  return loan.paymentEditedAt === undefined || isTimestamp(loan.paymentEditedAt);
}

// Saving the loan form records the edit time only when the monthly payment
// changes; renaming a loan or changing its other details is not a payment edit.
export function editedLoan(loan, loanFields, savedAt) {
  const editedFields = { ...loan, ...loanFields };
  if (loanFields.payment === loan.payment) {
    return editedFields;
  }
  return { ...editedFields, paymentEditedAt: savedAt };
}
