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

// Rewrites overlapping temporary changes as back-to-back ones with the same
// payment in every month: each month keeps the change that wins it.
function flattenedTemporaryChanges(changes) {
  const temporaryChanges = changes.filter(isTemporary);
  const lastMonth = temporaryChanges.map(change => change.until).sort().at(-1);
  const segments = [];
  for (let month = temporaryChanges[0].since; month <= lastMonth; month = nextMonth(month)) {
    const winner = temporaryChangeCovering(temporaryChanges, month);
    const currentSegment = segments.at(-1);
    if (winner && currentSegment?.winner === winner && currentSegment.until === monthBefore(month)) {
      currentSegment.until = month;
    } else if (winner) {
      segments.push({ winner, since: month, until: month, amount: winner.amount });
    }
  }
  return [...changes.filter(change => !isTemporary(change)), ...segments.map(storedChange)];
}

// Folds what lies at or before the loan's start into its starting payment:
// lasting changes become the starting payment, temporary changes that ended
// are dropped, and the one still running starts with the loan.
export function withNormalizedPayments(loan) {
  let changes = storedChanges(loan);
  const runningAtStart = changes.filter(change => isTemporary(change) && change.since < loan.start && change.until >= loan.start);
  if (runningAtStart.length > 1 || (runningAtStart.length === 1 && temporaryChangeCovering(changes, loan.start) !== runningAtStart[0])) {
    changes = flattenedTemporaryChanges(changes).sort(byStartMonth);
  }
  const lastingAtStart = changes.filter(change => !isTemporary(change) && change.since <= loan.start).at(-1);
  const keptChanges = changes
    .filter(change => change.since > loan.start || (isTemporary(change) && change.until >= loan.start))
    .map(change => change.since > loan.start ? change : { ...change, since: loan.start });
  return { ...loan, payment: lastingAtStart?.amount ?? loan.payment, paymentChanges: keptChanges.map(storedChange) };
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

// A temporary payment leaves the other changes untouched, except a temporary
// one that starts in the same month, which it replaces.
function withTemporaryPayment(loan, { since, until, amount }) {
  const startMonth = since < loan.start ? loan.start : since;
  if (until < startMonth) {
    return withNormalizedPayments(loan);
  }
  const newChange = { since: startMonth, until, amount };
  const otherChanges = storedChanges(loan).filter(change => !isSameEntry(change, newChange));
  return { ...loan, paymentChanges: [...otherChanges, newChange].sort(byStartMonth) };
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
