import { latestPlan, plannedYears } from './planArchive.js';
import { localDateOfTimestamp, monthOf } from './calendar.js';
import { isTimestamp } from './paybackState.js';
import { loanPaymentInMonth } from './loanPaymentHistory.js';

// Owner decision P05 (superseded by P09): a payment entered on the loan after
// a plan was approved is newer than that plan's changes up to the edit's month.
// Both times must be exact UTC instants, otherwise the plan's changes stand.
function isLoanPaymentNewerThanPlan(loan, plan) {
  if (!isTimestamp(loan.paymentEditedAt) || !isTimestamp(plan.createdAt)) {
    return false;
  }
  return Date.parse(loan.paymentEditedAt) > Date.parse(plan.createdAt);
}

function planChangesForLoan(loan, plan) {
  const changes = (plan.loanChanges ?? [])
    .filter(change => change.loanId === loan.id)
    .map(({ since, amount }) => ({ since, amount }));
  if (!isLoanPaymentNewerThanPlan(loan, plan)) {
    return changes;
  }
  const editedMonth = monthOf(localDateOfTimestamp(loan.paymentEditedAt));
  return changes.filter(change => change.since > editedMonth);
}

// Drops entries that repeat the amount already in effect.
function withoutRepeatedAmounts(loan, changes) {
  const sortedChanges = [...changes].sort((first, second) => first.since.localeCompare(second.since));
  const keptChanges = [];
  for (const change of sortedChanges) {
    if (loanPaymentInMonth({ ...loan, paymentChanges: keptChanges }, change.since) !== change.amount) {
      keptChanges.push(change);
    }
  }
  return keptChanges;
}

// Schema version 5 (LOAN-1a): each loan's history starts from its saved
// payment, and takes the scheduled changes of each year's latest approved
// plan, oldest year first. A later year's plan decides its own months and
// beyond, so a change it dropped is not brought back. Plans keep their own
// changes untouched as frozen snapshots.
export function loanWithPaymentHistory(state, loan) {
  if (Array.isArray(loan.paymentChanges)) {
    return loan;
  }
  let changes = [];
  for (const year of plannedYears(state)) {
    const firstMonthOfYear = `${year}-01`;
    const earlierChanges = changes.filter(change => change.since < firstMonthOfYear);
    changes = [...earlierChanges, ...planChangesForLoan(loan, latestPlan(state, year))];
  }
  return { ...loan, paymentChanges: withoutRepeatedAmounts(loan, changes) };
}
