export function categoryReviewRows(state, warnings) {
  const missingByTransaction = new Map(warnings.map(warning => [warning.transactionId, warning.categoryId]));
  return state.transactions
    .filter(transaction => transaction.category == null && missingByTransaction.has(transaction.id))
    .map(transaction => ({ transaction, categoryId: missingByTransaction.get(transaction.id) }));
}

export function applyCategoryReviewEdits(state, rows, edits) {
  const affectedIds = new Set(rows.map(row => row.transaction.id));
  const transactions = state.transactions.map(transaction => {
    const edit = edits[JSON.stringify(transaction.id)];
    if (!edit || !affectedIds.has(transaction.id)) {
      return transaction;
    }
    return {
      ...transaction,
      title: edit.title?.trim() ?? transaction.title,
      category: edit.category ? JSON.parse(edit.category) : null
    };
  });
  return { ...state, transactions };
}
