// Owner decision P09: a loan keeps a payment history. `payment` is the amount
// from the loan's start month; `paymentChanges` lists later amounts, each
// `{ since: 'YYYY-MM', amount }` in integer cents, with unique months.

function storedChanges(loan) {
  return [...(loan.paymentChanges ?? [])].sort((first, second) => first.since.localeCompare(second.since));
}

// The monthly payment the loan's history sets for `month`.
export function loanPaymentInMonth(loan, month) {
  const changeInEffect = storedChanges(loan).filter(change => change.since <= month).at(-1);
  return changeInEffect?.amount ?? loan.payment;
}

// The whole history, oldest first: the starting payment, then each change.
export function loanPaymentHistory(loan) {
  return [{ since: loan.start, amount: loan.payment }, ...storedChanges(loan).map(({ since, amount }) => ({ since, amount }))];
}

// Every payment from `since` on uses the new amount, so later entries no
// longer apply; earlier months are untouched. An amount already in effect
// adds no entry.
export function withLoanPaymentFrom(loan, { since, amount }) {
  if (since <= loan.start) {
    return { ...loan, payment: amount, paymentChanges: [] };
  }
  const earlierChanges = storedChanges(loan).filter(change => change.since < since);
  const earlierLoan = { ...loan, paymentChanges: earlierChanges };
  if (loanPaymentInMonth(earlierLoan, since) === amount) {
    return earlierLoan;
  }
  return { ...loan, paymentChanges: [...earlierChanges, { since, amount }] };
}

// Corrects a mistaken entry: only that change goes; the others stay.
export function withoutLoanPaymentChange(loan, since) {
  return { ...loan, paymentChanges: storedChanges(loan).filter(change => change.since !== since) };
}

// A plan's loan changes for the period starting `startMonth`, taken from each
// loan's history: the payment in effect at the start (when a change set it),
// then every later change. Loans that ended before the start add none.
export function loanChangesFromHistory(loans, startMonth) {
  return loans
    .filter(loan => loan.end >= startMonth)
    .flatMap(loan => {
      const changes = storedChanges(loan);
      const changeInEffect = changes.filter(change => change.since <= startMonth).at(-1);
      const startChange = changeInEffect ? [{ loanId: loan.id, since: startMonth, amount: changeInEffect.amount }] : [];
      const laterChanges = changes.filter(change => change.since > startMonth).map(({ since, amount }) => ({ loanId: loan.id, since, amount }));
      return [...startChange, ...laterChanges];
    });
}

const k_monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function isPaymentChange(change) {
  const isRecord = change !== null && typeof change === 'object' && !Array.isArray(change);
  return isRecord && k_monthPattern.test(change.since) && Number.isSafeInteger(change.amount) && change.amount >= 0;
}

// Current ledgers keep a list of dated, non-negative integer-cent payments
// with unique months on every loan; an empty list means no change.
export function isValidPaymentChanges(loan) {
  if (!Array.isArray(loan.paymentChanges) || !loan.paymentChanges.every(isPaymentChange)) {
    return false;
  }
  const months = new Set(loan.paymentChanges.map(change => change.since));
  return months.size === loan.paymentChanges.length;
}
