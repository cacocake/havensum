// Owner decision L01: an entry counts in balances and monthly reports from its
// date, by the device's local date. Until then it is scheduled: it stays
// visible as upcoming and still feeds forecasts.

export function isScheduledEntry(transaction, today) {
  return transaction.date > today;
}

export function postedTransactions(transactions, today) {
  return transactions.filter(transaction => !isScheduledEntry(transaction, today));
}

export function scheduledTransactions(transactions, today) {
  return transactions.filter(transaction => isScheduledEntry(transaction, today));
}

// The ledger as it stands today: only entries that have posted.
export function postedLedger(state, today) {
  return { ...state, transactions: postedTransactions(state.transactions, today) };
}
