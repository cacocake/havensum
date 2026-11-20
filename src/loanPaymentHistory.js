import { isMonthKey, nextMonth, previousMonths } from './calendar.js';

// Owner decisions P09/P10: a loan keeps a payment history. `payment` is the
// amount from the loan's start month; `paymentChanges` lists later amounts,
// each `{ since: 'YYYY-MM', amount }` in integer cents. A change with
// `until: 'YYYY-MM'` is temporary: after its until month the payment returns
// to what applies without it. Without `until` it lasts. Lasting changes have
// unique start months, and so do temporary ones; one of each may share a month.

function isTemporary(change) {
  return change.until !== undefined;
}

// Oldest first; in a shared month the lasting change comes first.
function byStartMonth(first, second) {
  return first.since.localeCompare(second.since) || Number(isTemporary(first)) - Number(isTemporary(second));
}

function storedChanges(loan) {
  return [...(loan.paymentChanges ?? [])].sort(byStartMonth);
}

function isSameEntry(change, entry) {
  return change.since === entry.since && isTemporary(change) === isTemporary(entry);
}

function monthBefore(month) {
  return previousMonths(month, 1)[0];
}

function storedChange({ since, until, amount }) {
  return until === undefined ? { since, amount } : { since, until, amount };
}

function temporaryChangeCovering(changes, month) {
  return changes.filter(change => isTemporary(change) && change.since <= month && change.until >= month).at(-1);
}

// The monthly payment the loan's history sets for `month`: a temporary change
// covering it (the latest one to start), otherwise the latest lasting change.
export function loanPaymentInMonth(loan, month) {
  const changes = storedChanges(loan).filter(change => change.since <= month);
  const coveringTemporaryChange = temporaryChangeCovering(changes, month);
  if (coveringTemporaryChange) {
    return coveringTemporaryChange.amount;
  }
  return changes.filter(change => !isTemporary(change)).at(-1)?.amount ?? loan.payment;
}

// Rewrites a temporary change from `fromMonth` on as the entry from the
// first to the last month it still wins. Every change winning a month in
// between started later than that first month, so it keeps winning; months it
// never wins drop out.
function winningEntries(change, temporaryChanges, fromMonth) {
  const wonMonths = [];
  for (let month = fromMonth > change.since ? fromMonth : change.since; month <= change.until; month = nextMonth(month)) {
    if (temporaryChangeCovering(temporaryChanges, month) === change) {
      wonMonths.push(month);
    }
  }
  if (!wonMonths.length) {
    return [];
  }
  return [{ since: wonMonths[0], until: wonMonths.at(-1), amount: change.amount }];
}

// Folds what lies at or before the loan's start into its starting payment:
// lasting changes become the starting payment, temporary changes that ended
// are dropped, and those still running restart at the start, each keeping the
// months it wins.
export function withNormalizedPayments(loan) {
  const changes = storedChanges(loan);
  const temporaryChanges = changes.filter(isTemporary);
  const lastingAtStart = changes.filter(change => !isTemporary(change) && change.since <= loan.start).at(-1);
  const keptChanges = changes.flatMap(change => {
    if (change.since > loan.start) {
      return [change];
    }
    if (!isTemporary(change) || change.until < loan.start) {
      return [];
    }
    return winningEntries(change, temporaryChanges, loan.start);
  });
  return { ...loan, payment: lastingAtStart?.amount ?? loan.payment, paymentChanges: keptChanges.map(storedChange).sort(byStartMonth) };
}

// The whole history, oldest first: the starting payment, then each change.
export function loanPaymentHistory(loan) {
  const normalizedLoan = withNormalizedPayments(loan);
  return [{ since: normalizedLoan.start, amount: normalizedLoan.payment }, ...normalizedLoan.paymentChanges.map(storedChange)];
}

// A lasting payment from `since` replaces every later change and ends a
// temporary one still running; earlier months are untouched. An amount
// already in effect adds no entry.
function withLastingPaymentFrom(loan, { since, amount }) {
  if (since <= loan.start) {
    return { ...loan, payment: amount, paymentChanges: [] };
  }
  const earlierChanges = storedChanges(loan)
    .filter(change => change.since < since)
    .map(change => isTemporary(change) && change.until >= since ? { ...change, until: monthBefore(since) } : change);
  const earlierLoan = { ...loan, paymentChanges: earlierChanges };
  if (loanPaymentInMonth(earlierLoan, since) === amount) {
    return earlierLoan;
  }
  return { ...loan, paymentChanges: [...earlierChanges, { since, amount }] };
}

// Owner decision P21: the newest temporary payment wins every month of its
// window. Older temporary changes keep only their months outside it; lasting
// changes stay untouched and apply again afterwards.
function withTemporaryPayment(loan, { since, until, amount }) {
  const startMonth = since < loan.start ? loan.start : since;
  if (until < startMonth) {
    return withNormalizedPayments(loan);
  }
  const changes = storedChanges(loan);
  const temporaryChanges = changes.filter(isTemporary);
  const overlaps = change => isTemporary(change) && change.since <= until && change.until >= startMonth;
  const outsideWindow = changes.filter(change => !overlaps(change));
  const trimmed = changes.filter(overlaps).flatMap(change => {
    const beforeWindow = change.since < startMonth ? [{ since: change.since, until: monthBefore(startMonth), amount: change.amount }] : [];
    const afterWindow = change.until > until ? winningEntries(change, temporaryChanges, nextMonth(until)) : [];
    return [...beforeWindow, ...afterWindow];
  });
  return { ...loan, paymentChanges: [...outsideWindow, ...trimmed, { since: startMonth, until, amount }].map(storedChange).sort(byStartMonth) };
}

export function withLoanPaymentFrom(loan, { since, until, amount }) {
  if (until === undefined) {
    return withLastingPaymentFrom(loan, { since, amount });
  }
  return withTemporaryPayment(loan, { since, until, amount });
}

// Corrects a mistaken entry (its start month, and its until month when it is
// temporary): only that change goes; the others stay.
export function withoutLoanPaymentChange(loan, entry) {
  return { ...loan, paymentChanges: storedChanges(loan).filter(change => !isSameEntry(change, entry)) };
}

// A plan's loan changes for the period starting `startMonth`, as the months
// each loan's payment steps to a new amount from the history: in effect at the
// start, then each later start and the month after each temporary change.
// Loans that ended before the start add none.
export function loanChangesFromHistory(loans, startMonth) {
  return loans
    .filter(loan => loan.end >= startMonth)
    .flatMap(loan => {
      const normalizedLoan = withNormalizedPayments(loan);
      const stepMonths = new Set([startMonth]);
      for (const change of normalizedLoan.paymentChanges) {
        stepMonths.add(change.since);
        if (isTemporary(change)) {
          stepMonths.add(nextMonth(change.until));
        }
      }
      const planChanges = [];
      // Plans start each loan from its saved payment, so steps are measured from it.
      let previousAmount = loan.payment;
      for (const month of [...stepMonths].filter(stepMonth => stepMonth >= startMonth).sort()) {
        const amount = loanPaymentInMonth(normalizedLoan, month);
        if (amount !== previousAmount) {
          planChanges.push({ loanId: loan.id, since: month, amount });
          previousAmount = amount;
        }
      }
      return planChanges;
    });
}

function isPaymentChange(change) {
  const isRecord = change !== null && typeof change === 'object' && !Array.isArray(change);
  if (!isRecord || !isMonthKey(change.since) || !Number.isSafeInteger(change.amount) || change.amount < 0) {
    return false;
  }
  return change.until === undefined || (isMonthKey(change.until) && change.until >= change.since);
}

// Current ledgers keep a list of dated, non-negative integer-cent payments on
// every loan, lasting and temporary changes each with unique start months; an
// empty list means no change.
export function isValidPaymentChanges(loan) {
  if (!Array.isArray(loan.paymentChanges) || !loan.paymentChanges.every(isPaymentChange)) {
    return false;
  }
  const entries = new Set(loan.paymentChanges.map(change => `${change.since}:${isTemporary(change)}`));
  return entries.size === loan.paymentChanges.length;
}

// Applies a loan form's save to the loan as it is now. The form's history
// replaces the saved one only when the form changed it (`paymentChanges`), so
// a change synced while the form was open survives otherwise.
export function withLoanFormEdits(currentLoan, { loanFields, paymentChanges = null, newPayment = null }) {
  const loan = { ...currentLoan, ...loanFields, paymentChanges: paymentChanges ?? currentLoan.paymentChanges };
  if (!newPayment) {
    return withNormalizedPayments(loan);
  }
  return withNormalizedPayments(withLoanPaymentFrom(loan, newPayment));
}
