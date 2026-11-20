import { monthKeyOf, monthNumberOf, monthOf, nextMonth, yearOfMonth } from './calendar.js';
import { latestPlan, plannedYears } from './planArchive.js';
import { k_monthsPerYear } from './domainConstants.js';
import { isLoanActive } from './expectedLoans.js';
import { loanPaymentInMonth } from './loanPaymentHistory.js';

function paymentWhileActive(loan, month) {
  return isLoanActive(loan, month) ? loanPaymentInMonth(loan, month) : 0;
}

// The first month a loan edit changes the monthly payment, from `from` to
// `to` when given, or null when it changed none there (a balance or name edit
// changes none, owner decision P15).
export function firstChangedPaymentMonth(loanBefore, loanAfter, { from = null, to = null } = {}) {
  const loanFirstMonth = [loanBefore.start, loanAfter.start].sort()[0];
  const loanLastMonth = [loanBefore.end, loanAfter.end].sort().at(-1);
  const firstMonth = from && from > loanFirstMonth ? from : loanFirstMonth;
  const lastMonth = to && to < loanLastMonth ? to : loanLastMonth;
  for (let month = firstMonth; month <= lastMonth; month = nextMonth(month)) {
    if (paymentWhileActive(loanBefore, month) !== paymentWhileActive(loanAfter, month)) {
      return month;
    }
  }
  return null;
}

// Owner decisions P09 and P24: after a payment change, offer to revise the
// first planned year, from this year on (past years stay read-only), that the
// change affects, from the first month it affects there. A change in a passed
// month of this year is revised from that month while the interview itself
// starts this month; there is no offer when no planned year is affected.
export function loanRevisionOffer(state, loanBefore, loanAfter, today) {
  const currentMonth = monthOf(today);
  const currentYear = yearOfMonth(currentMonth);
  for (const year of plannedYears(state).filter(plannedYear => plannedYear >= currentYear)) {
    const reviseFrom = firstChangedPaymentMonth(loanBefore, loanAfter, { from: monthKeyOf(year, 1), to: monthKeyOf(year, k_monthsPerYear) });
    if (!reviseFrom || !latestPlan(state, year)) {
      continue;
    }
    if (reviseFrom < currentMonth) {
      return { year, loanId: loanAfter.id, reviseFrom, interviewFromMonth: monthNumberOf(currentMonth), passedFrom: reviseFrom };
    }
    return { year, loanId: loanAfter.id, reviseFrom, interviewFromMonth: monthNumberOf(reviseFrom), passedFrom: null };
  }
  return null;
}

// Owner decisions P22 and P23: in passed months from the revision month, the
// new revision changes only the changed loan's part of the loan line, by the
// difference between its payment before the edit (`previousLoan`) and its
// history now, and the totals that line is part of; everything else stays as
// frozen, including other loans. The revision records where this starts.
export function revisionWithRestatedLoanLines(plan, state, offer, previousLoan) {
  if (!offer.passedFrom) {
    return plan;
  }
  const changedLoan = state.loans.find(loan => loan.id === offer.loanId);
  const interviewStart = monthKeyOf(offer.year, offer.interviewFromMonth);
  const months = { ...plan.months };
  for (let month = offer.passedFrom; month < interviewStart; month = nextMonth(month)) {
    const frozenMonth = months[month];
    if (!frozenMonth) {
      continue;
    }
    const paymentNow = changedLoan ? paymentWhileActive(changedLoan, month) : 0;
    const loan = frozenMonth.loan + paymentNow - paymentWhileActive(previousLoan, month);
    const expense = frozenMonth.expense - frozenMonth.loan + loan;
    months[month] = { ...frozenMonth, loan, expense, balance: frozenMonth.income - expense };
  }
  return { ...plan, months, loanRestatedFrom: offer.passedFrom };
}
