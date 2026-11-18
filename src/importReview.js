import { validateTransaction } from './transactionValidation.js';

const k_exchangeFields = [
  'type', 'title', 'amount', 'date', 'account', 'category', 'kind', 'note',
  'linkedId', 'toAccount', 'externalSource', 'externalId', 'loanId'
];

function comparableTransaction(transaction) {
  return k_exchangeFields.map(field => field === 'externalId' ? String(transaction[field] ?? '') : transaction[field] ?? '');
}

function sameTransaction(first, second) {
  return JSON.stringify(comparableTransaction(first)) === JSON.stringify(comparableTransaction(second));
}

function updatedTransaction(existing, incoming) {
  const transaction = { ...existing };
  for (const field of k_exchangeFields) {
    delete transaction[field];
  }
  return { ...transaction, ...incoming, id: existing.id };
}

function hasSameExternalIdentity(first, second) {
  return hasExternalIdentity(first) && hasExternalIdentity(second)
    && first.externalSource === second.externalSource
    && String(first.externalId) === String(second.externalId)
    && first.account === second.account;
}

function hasExternalIdentity(transaction) {
  return Boolean(transaction.externalSource) && transaction.externalId !== undefined && transaction.externalId !== null && transaction.externalId !== '';
}

function possibleDuplicate(first, second) {
  if (hasExternalIdentity(first) && hasExternalIdentity(second)) {
    return false;
  }
  const fields = k_exchangeFields.filter(field => !['externalSource', 'externalId'].includes(field));
  return fields.every(field => (first[field] ?? '') === (second[field] ?? ''));
}

function reviewStatus(existing, transaction, possibleMatches) {
  if (existing) {
    return sameTransaction(existing, transaction) ? 'unchanged' : 'edited';
  }
  return possibleMatches.length ? 'possible' : 'new';
}

function markRepeatedIdentities(rows) {
  const identityGroups = new Map();
  for (const row of rows) {
    const transaction = row.transaction;
    const identities = [];
    const ledgerIds = new Set([transaction.id, row.existing?.id]);
    ledgerIds.delete(undefined);
    for (const ledgerId of ledgerIds) {
      identities.push(JSON.stringify(['id', ledgerId]));
    }
    if (hasExternalIdentity(transaction)) {
      identities.push(JSON.stringify(['source', transaction.externalSource, transaction.account, String(transaction.externalId)]));
    }
    for (const identity of identities) {
      const group = identityGroups.get(identity) || [];
      group.push(row);
      identityGroups.set(identity, group);
    }
  }
  for (const group of identityGroups.values()) {
    if (group.length < 2) {
      continue;
    }
    const first = group[0];
    const firstLedgerId = first.existing?.id ?? first.transaction.id;
    if (group.every(row => (row.existing?.id ?? row.transaction.id) === firstLedgerId && sameTransaction(row.transaction, first.transaction))) {
      for (const row of group.slice(1)) {
        if (row.status === 'invalid') {
          continue;
        }
        row.status = 'unchanged';
        row.duplicateOf = first.index;
      }
      continue;
    }
    for (const row of group) {
      row.status = 'invalid';
      row.error = 'Conflicting duplicate transaction ID or source identity in this file.';
    }
  }
}

export function previewTransactionImport(state, transactions, originals = transactions) {
  const rows = transactions.map((transaction, index) => {
    const matchingRecords = state.transactions.filter(record => record.id === transaction.id || hasSameExternalIdentity(record, transaction));
    if (matchingRecords.length > 1) {
      return {
        index, transaction, status: 'invalid',
        error: 'The identifiers match different transactions. Correct the ledger ID or source reference before importing.'
      };
    }
    const [existing] = matchingRecords;
    const original = originals[index];
    const possibleMatches = state.transactions.filter(record => possibleDuplicate(record, transaction)
      || (original !== transaction && possibleDuplicate(record, original)));
    return {
      index, transaction, existing, possibleMatches,
      status: reviewStatus(existing, transaction, possibleMatches)
    };
  });
  markRepeatedIdentities(rows.filter(row => row.status !== 'invalid'));
  const candidates = new Map(rows.filter(row => row.status !== 'invalid' && row.duplicateOf === undefined).map(row => [row.index,
    row.existing ? updatedTransaction(row.existing, row.transaction) : { ...row.transaction, id: row.transaction.id ?? Symbol('preview') }
  ]));
  const importedIds = new Set([...candidates.values()].map(transaction => transaction.id));
  const combinedState = {
    ...state,
    transactions: [
      ...state.transactions.filter(transaction => !importedIds.has(transaction.id)),
      ...candidates.values()
    ]
  };
  for (const row of rows) {
    if (row.status === 'invalid') {
      continue;
    }
    try {
      const transaction = candidates.get(row.duplicateOf ?? row.index);
      validateTransaction(combinedState, transaction);
    } catch (error) {
      row.status = 'invalid';
      row.error = error.message;
    }
  }
  return { rows, originals, baseline: JSON.stringify(state) };
}

export function reviseTransactionImport(state, review, rowIndex, changes) {
  if (JSON.stringify(state) !== review.baseline) {
    throw Error('The ledger changed after preview. Preview this file again before editing.');
  }
  const transactions = review.rows.map(row => row.index === rowIndex
    ? { ...row.transaction, ...changes }
    : row.transaction);
  const revised = previewTransactionImport(state, transactions, review.originals);
  for (const row of review.rows) {
    if (row.normalizationError) {
      const revisedRow = revised.rows[row.index];
      revisedRow.normalizationError = row.normalizationError;
      revisedRow.status = 'invalid';
      revisedRow.error = row.normalizationError;
    }
  }
  return revised;
}

export function applyTransactionImport(state, review, choices, createIdentifier) {
  if (JSON.stringify(state) !== review.baseline) {
    throw Error('The ledger changed after preview. Preview this file again before importing.');
  }
  const transactions = [...state.transactions];
  for (const row of review.rows) {
    const choice = choices[row.index];
    if (row.status === 'invalid') {
      if (row.normalizationError && choice === 'skip') {
        continue;
      }
      throw Error(`Row ${row.index + 1}: ${row.error}`);
    }
    if (row.status === 'unchanged') {
      continue;
    }
    if (row.status === 'edited') {
      if (choice !== 'keep' && choice !== 'replace') {
        throw Error(`Row ${row.index + 1}: make a review choice before importing.`);
      }
      if (choice === 'replace') {
        const transactionIndex = transactions.findIndex(record => record.id === row.existing.id);
        transactions[transactionIndex] = updatedTransaction(row.existing, row.transaction);
      }
      continue;
    }
    if (row.status === 'possible') {
      if (choice !== 'skip' && choice !== 'add') {
        throw Error(`Row ${row.index + 1}: make a review choice before importing.`);
      }
      if (choice === 'skip') {
        continue;
      }
    }
    const id = row.transaction.id ?? createIdentifier();
    if (transactions.some(transaction => transaction.id === id)) {
      throw Error(`Row ${row.index + 1}: duplicate transaction ID.`);
    }
    transactions.push({ ...row.transaction, id });
  }
  const result = { ...state, transactions };
  for (const transaction of transactions) {
    validateTransaction(result, transaction);
  }
  return result;
}
