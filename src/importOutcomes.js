import { accountBalance } from './ledger.js';

export function formatReviewRowLabel(row, multipleStatements) {
  return multipleStatements && row.bank
    ? `Statement ${row.bank.statementNumber}, row ${row.sourceRow}`
    : `Row ${row.sourceRow}`;
}

export function getImportBalances(state, review, result) {
  const affectedAccountIds = new Set();
  for (const row of review.rows) {
    for (const transaction of [row.transaction, row.existing]) {
      if (transaction) {
        affectedAccountIds.add(transaction.account);
        affectedAccountIds.add(transaction.toAccount);
      }
    }
  }

  return state.accounts.filter(account => affectedAccountIds.has(account.id)).map(account => ({
    id: account.id,
    name: account.name,
    before: accountBalance(state, account.id),
    after: result ? accountBalance(result, account.id) : null
  }));
}

function describeRowOutcome(row, choice) {
  if (row.status === 'invalid' && choice === 'skip') {
    const label = row.normalizationError ? 'Skipped malformed source row' : 'Skipped invalid row';
    return { outcome: 'skipped', label };
  }
  if (row.status === 'paired') {
    return { outcome: 'skipped', label: 'Combined with its matching transfer debit' };
  }
  if (row.status === 'edited') {
    return choice === 'replace'
      ? { outcome: 'updated', label: 'Updated existing transaction' }
      : { outcome: 'skipped', label: 'Kept existing transaction' };
  }
  if (row.status === 'unchanged') {
    return { outcome: 'skipped', label: row.duplicateOf === undefined
      ? 'Skipped unchanged transaction'
      : 'Skipped repeated row in this file' };
  }
  if (row.status === 'possible' && choice === 'skip') {
    return { outcome: 'skipped', label: 'Skipped possible duplicate' };
  }
  return { outcome: 'added', label: 'Added transaction' };
}

export function getImportResults(state, result, review, choices) {
  const counts = { added: 0, updated: 0, skipped: 0 };
  const rows = review.rows.map(row => {
    const outcome = describeRowOutcome(row, choices[row.index]);
    counts[outcome.outcome] += 1;
    return { ...row, ...outcome };
  });
  return {
    counts,
    rows,
    balances: getImportBalances(state, review, result),
    changed: counts.added + counts.updated > 0
  };
}
