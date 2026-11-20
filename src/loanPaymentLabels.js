import { euro } from './money.js';
import { longMonthLabel } from './monthLabels.js';
import { loanPaymentHistory } from './loanPaymentHistory.js';

export const k_loanPaymentChangesField = 'paymentChanges';

// "€1,050.00 from September 2026"
export function paymentEntryText(entry) {
  return `${euro(entry.amount)} from ${longMonthLabel(entry.since)}`;
}

// "€1,200.00 from January 2026 · €1,050.00 from September 2026"
export function paymentHistoryText(loan) {
  return loanPaymentHistory(loan).map(paymentEntryText).join(' · ');
}

// One side of a merge conflict over a loan's payment changes, oldest first.
export function paymentChangeConflictLines(changes) {
  if (!changes?.length) {
    return ['No payment changes'];
  }
  return [...changes].sort((first, second) => first.since.localeCompare(second.since)).map(paymentEntryText);
}
