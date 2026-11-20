import { monthKeyOf, monthNumberOf, monthOf, nextMonth, yearOfMonth } from './calendar.js';
import { latestPlan } from './planArchive.js';
import { isLoanActive } from './expectedLoans.js';
import { loanPaymentInMonth } from './loanPaymentHistory.js';

function paymentWhileActive(loan, month) {
  return isLoanActive(loan, month) ? loanPaymentInMonth(loan, month) : 0;
}

// The first month a loan edit changes the monthly payment, or null when it
// changed none (a balance or name edit, owner decision P15).
export function firstChangedPaymentMonth(loanBefore, loanAfter) {
  const firstMonth = [loanBefore.start, loanAfter.start].sort()[0];
  const lastMonth = [loanBefore.end, loanAfter.end].sort().at(-1);
  for (let month = firstMonth; month <= lastMonth; month = nextMonth(month)) {
    if (paymentWhileActive(loanBefore, month) !== paymentWhileActive(loanAfter, month)) {
      return month;
    }
  }
  return null;
}

// Owner decision P09: after a payment change, offer to revise the plan of the
// year it changes in (this year at the earliest, as past years stay
// read-only) from the month it changes. A change in a passed month of this
// year is revised from that month, while the interview itself starts this
// month; there is no offer without a plan for that year.
export function loanRevisionOffer(state, changedMonth, today) {
  const currentMonth = monthOf(today);
  const currentYear = yearOfMonth(currentMonth);
  const year = Math.max(yearOfMonth(changedMonth), currentYear);
  if (!latestPlan(state, year)) {
    return null;
  }
  const reviseFrom = yearOfMonth(changedMonth) < year ? monthKeyOf(year, 1) : changedMonth;
  if (reviseFrom < currentMonth) {
    return { year, reviseFrom, interviewFromMonth: monthNumberOf(currentMonth), passedFrom: reviseFrom };
  }
  return { year, reviseFrom, interviewFromMonth: monthNumberOf(reviseFrom), passedFrom: null };
}

function loanTotalInMonth(loans, month) {
  return loans.reduce((total, loan) => total + paymentWhileActive(loan, month), 0);
}

// Owner decision P22: in passed months from the revision month, the new
// revision changes only the loan line, from each loan's payment history, and
// the totals it is part of; everything else stays as frozen. The revision
// records where that restatement starts.
export function revisionWithRestatedLoanLines(plan, state, offer) {
  if (!offer.passedFrom) {
    return plan;
  }
  const interviewStart = monthKeyOf(offer.year, offer.interviewFromMonth);
  const months = { ...plan.months };
  for (let month = offer.passedFrom; month < interviewStart; month = nextMonth(month)) {
    const frozenMonth = months[month];
    if (!frozenMonth) {
      continue;
    }
    const loan = loanTotalInMonth(state.loans, month);
    const expense = frozenMonth.expense - frozenMonth.loan + loan;
    months[month] = { ...frozenMonth, loan, expense, balance: frozenMonth.income - expense };
  }
  return { ...plan, months, loanRestatedFrom: offer.passedFrom };
}
