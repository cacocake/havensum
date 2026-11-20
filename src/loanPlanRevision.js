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

// The changed loan's share of a frozen month's loan line: as the plan recorded
// it, otherwise (plans from before shares were recorded) its earlier payment,
// never more than the line held (owner decision P25).
function heldPayment(frozenMonth, loanId, previousPayment) {
  if (frozenMonth.loanPayments) {
    return frozenMonth.loanPayments[loanId] ?? 0;
  }
  return Math.min(previousPayment, frozenMonth.loan);
}

// Owner decisions P22, P23 and P25: in passed months from the revision month,
// the new revision replaces only the changed loan's share of the loan line
// with its history now, and the totals that line is part of; everything else
// stays as frozen, including other loans. A loan the plan never held is only
// added. The revision records the first month restated.
export function revisionWithRestatedLoanLines(plan, state, offer, previousLoan) {
  if (!offer.passedFrom) {
    return plan;
  }
  const changedLoan = state.loans.find(loan => loan.id === offer.loanId);
  const interviewStart = monthKeyOf(offer.year, offer.interviewFromMonth);
  const months = { ...plan.months };
  let firstRestatedMonth = null;
  for (let month = offer.passedFrom; month < interviewStart; month = nextMonth(month)) {
    const frozenMonth = months[month];
    if (!frozenMonth) {
      continue;
    }
    firstRestatedMonth ??= month;
    const paymentNow = changedLoan ? paymentWhileActive(changedLoan, month) : 0;
    const loan = frozenMonth.loan - heldPayment(frozenMonth, offer.loanId, paymentWhileActive(previousLoan, month)) + paymentNow;
    const expense = frozenMonth.expense - frozenMonth.loan + loan;
    const loanPayments = frozenMonth.loanPayments ? { ...frozenMonth.loanPayments, [offer.loanId]: paymentNow } : undefined;
    months[month] = { ...frozenMonth, loan, ...(loanPayments ? { loanPayments } : {}), expense, balance: frozenMonth.income - expense };
  }
  return { ...plan, months, loanRestatedFrom: firstRestatedMonth ?? offer.passedFrom };
}

// On save the interview rechecks its offer: a calendar move refreshes it, and
// an offer that vanished or now points to another year cannot be saved.
export function loanRevisionRecheck(shownOffer, currentOffer) {
  if (!currentOffer || currentOffer.year !== shownOffer.year) {
    return { kind: 'gone' };
  }
  const isUnchanged = currentOffer.interviewFromMonth === shownOffer.interviewFromMonth && currentOffer.passedFrom === shownOffer.passedFrom;
  return isUnchanged ? { kind: 'unchanged' } : { kind: 'moved', offer: currentOffer };
}
