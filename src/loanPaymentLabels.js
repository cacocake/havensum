import { euro } from './money.js';
import { longMonthLabel } from './monthLabels.js';
import { loanPaymentHistory } from './loanPaymentHistory.js';

export const k_loanPaymentChangesField = 'paymentChanges';

// "€1,050.00 from September 2026", "€900.00 from January 2027 until May 2027"
// or, for a single month, "€1,500.00 in March 2027 only".
export function paymentEntryText(entry) {
  if (entry.until === undefined) {
    return `${euro(entry.amount)} from ${longMonthLabel(entry.since)}`;
  }
  if (entry.until === entry.since) {
    return `${euro(entry.amount)} in ${longMonthLabel(entry.since)} only`;
  }
  return `${euro(entry.amount)} from ${longMonthLabel(entry.since)} until ${longMonthLabel(entry.until)}`;
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
