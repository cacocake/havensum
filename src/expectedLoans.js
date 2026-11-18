import { isLoanExpense, hasLoanLink } from './expectedBills.js';

export function expectedLoanSpending(state, month, registered) {
  const payments = registered.expenses.filter(expense => isLoanExpense(state, expense));
  const matchedIds = new Set();
  let expected = 0;
  for (const loan of state.loans || []) {
    const matches = payments.filter(expense => {
      if (hasLoanLink(expense)) {
        return expense.loanId === loan.id;
      }
      // Legacy payment shortcuts already used this exact title/account match.
      const candidates = (state.loans || []).filter(candidate => candidate.name === expense.title && candidate.account === expense.account);
      return candidates.length === 1 && candidates[0].id === loan.id;
    });
    for (const expense of matches) {
      matchedIds.add(expense.id);
    }
    const gross = matches.reduce((total, expense) => total + expense.amount, 0);
    const refunded = matches.reduce((total, expense) => total + expense.refunded, 0);
    const active = loan.start <= month && loan.end >= month;
    const changes = (state.outlook?.loanChanges || []).filter(change => change.loanId === loan.id && change.since <= month)
      .sort((first, second) => first.since.localeCompare(second.since));
    const obligation = active ? (changes.at(-1)?.amount ?? loan.payment) : 0;
    expected += Math.max(gross, obligation) - refunded;
  }
  return expected + payments.filter(expense => !matchedIds.has(expense.id)).reduce((total, expense) => total + expense.net, 0);
}
