import { planRevisions, plannedYears } from './planArchive.js';
import { isTimestamp } from './paybackState.js';
import { loanPaymentInMonth, withNormalizedPayments } from './loanPaymentHistory.js';

const k_monthKeyLength = 7;

// Owner decision P05 (superseded by P09): a payment entered on the loan after
// a plan was approved is newer than that plan's changes up to the edit's month.
// Both times must be exact UTC instants, otherwise the plan's changes stand.
function isLoanPaymentNewerThanPlan(loan, plan) {
  if (!isTimestamp(loan.paymentEditedAt) || !isTimestamp(plan.createdAt)) {
    return false;
  }
  return Date.parse(loan.paymentEditedAt) > Date.parse(plan.createdAt);
}

// The edit's month in UTC, so every device migrates the same file alike.
function editedMonthOf(loan) {
  return loan.paymentEditedAt.slice(0, k_monthKeyLength);
}

function planChangesForLoan(loan, plan) {
  const changes = (plan.loanChanges ?? [])
    .filter(change => change.loanId === loan.id)
    .map(({ since, amount }) => ({ since, amount }));
  if (!isLoanPaymentNewerThanPlan(loan, plan)) {
    return changes;
  }
  return changes.filter(change => change.since > editedMonthOf(loan));
}

function firstDifferingMonth(plan, earlierPlan) {
  const months = [...new Set([...Object.keys(plan.months), ...Object.keys(earlierPlan.months)])].sort();
  return months.find(month => JSON.stringify(plan.months[month]) !== JSON.stringify(earlierPlan.months[month]));
}

// The first month a revision decides. A year's first revision decides its
// whole year. A later one copied every month before its start from the
// revision before it and stored loan changes only from its start, so it
// decides from the earliest of its first changed month, its first change and,
// for the years after it, the next January.
function firstDecidedMonth(loan, revisions, index) {
  const revision = revisions[index];
  if (index === 0) {
    return `${revision.year}-01`;
  }
  const nextJanuary = `${revision.year + 1}-01`;
  const candidates = [firstDifferingMonth(revision, revisions[index - 1]), ...planChangesForLoan(loan, revision).map(change => change.since), nextJanuary];
  return candidates.filter(Boolean).sort()[0];
}

// Drops entries that repeat the amount already in effect.
function withoutRepeatedAmounts(loan, changes) {
  const keptChanges = [];
  for (const change of [...changes].sort((first, second) => first.since.localeCompare(second.since))) {
    if (loanPaymentInMonth({ ...loan, paymentChanges: keptChanges }, change.since) !== change.amount) {
      keptChanges.push(change);
    }
  }
  return keptChanges;
}

// Schema version 5 (LOAN-1a): each loan's history starts from its saved
// payment and takes the scheduled changes of every approved revision, oldest
// first. Each revision decides from its first decided month onwards, so a
// change it dropped is not brought back and earlier months keep what earlier
// revisions planned. Plans keep their own changes untouched as frozen snapshots.
export function loanWithPaymentHistory(state, loan) {
  let changes = [];
  for (const year of plannedYears(state)) {
    const revisions = planRevisions(state, year);
    revisions.forEach((revision, index) => {
      const decidedFrom = firstDecidedMonth(loan, revisions, index);
      const earlierChanges = changes.filter(change => change.since < decidedFrom);
      changes = [...earlierChanges, ...planChangesForLoan(loan, revision)];
    });
  }
  return withNormalizedPayments({ ...loan, paymentChanges: withoutRepeatedAmounts(loan, changes) });
}
