import { validateTransaction } from './transactionValidation.js';
import { isRecordIdentifier } from './recordIdentity.js';
import { bankTransferCounterparts, validateBankDraft } from './realBankReview.js';
import { k_transactionTypes } from './domainConstants.js';
import { validatePaybackState } from './paybackState.js';

const k_exchangeFields = [
  'type', 'title', 'amount', 'date', 'account', 'category', 'kind', 'note',
  'linkedId', 'toAccount', 'externalSource', 'externalId', 'sourceFingerprint', 'counterpartSourceFingerprint', 'loanId',
  'plannedCost', 'correctsInterestMonth'
];
const k_duplicateIgnoredFields = new Set(['externalSource', 'externalId', 'sourceFingerprint', 'counterpartSourceFingerprint', 'plannedCost']);

function comparableTransaction(transaction) {
  return k_exchangeFields.map(field => {
    if (field === 'plannedCost' && transaction.plannedCost) {
      const { eventId, month, singleOccurrence } = transaction.plannedCost;
      return [eventId, month, singleOccurrence === true];
    }
    return field === 'externalId' ? String(transaction[field] ?? '') : transaction[field] ?? '';
  });
}

function sameTransaction(first, second) {
  return JSON.stringify(comparableTransaction(first)) === JSON.stringify(comparableTransaction(second));
}

function updatedTransaction(existing, incoming) {
  const transaction = { ...existing };
  for (const field of k_exchangeFields) {
    delete transaction[field];
  }
  const updated = { ...transaction, ...incoming, id: existing.id };
  if (updated.type === k_transactionTypes.expense && !Object.hasOwn(incoming, 'plannedCost') && existing.plannedCost !== undefined) {
    updated.plannedCost = existing.plannedCost;
  }
  if (existing.counterpartSourceFingerprint && updated.counterpartSourceFingerprint === undefined
    && updated.type === k_transactionTypes.transfer
    && updated.account === existing.account && updated.toAccount === existing.toAccount
    && updated.externalSource === existing.externalSource && updated.sourceFingerprint === existing.sourceFingerprint) {
    updated.counterpartSourceFingerprint = existing.counterpartSourceFingerprint;
  }
  return updated;
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

function matchesTransferCredit(transfer, record) {
  const creditFingerprint = transfer.counterpartSourceFingerprint;
  if (transfer.type !== k_transactionTypes.transfer || !creditFingerprint) {
    return false;
  }
  const standaloneMatch = transfer.toAccount === record.account && creditFingerprint === record.sourceFingerprint;
  const pairedMatch = record.type === k_transactionTypes.transfer
    && transfer.toAccount === record.toAccount && creditFingerprint === record.counterpartSourceFingerprint;
  return standaloneMatch || pairedMatch;
}

function possibleDuplicate(first, second) {
  if (hasExternalIdentity(first) && hasExternalIdentity(second)) {
    return false;
  }
  if (first.externalSource && first.externalSource === second.externalSource) {
    const ownMovement = first.account === second.account
      && Boolean(second.sourceFingerprint) && first.sourceFingerprint === second.sourceFingerprint;
    if (ownMovement || matchesTransferCredit(first, second) || matchesTransferCredit(second, first)) {
      return true;
    }
  }
  const fields = k_exchangeFields.filter(field => !k_duplicateIgnoredFields.has(field));
  return fields.every(field => (first[field] ?? '') === (second[field] ?? ''));
}

function reviewStatus(existing, transaction, hasPossibleMatch) {
  if (existing) {
    return sameTransaction(existing, updatedTransaction(existing, transaction)) ? 'unchanged' : 'edited';
  }
  return hasPossibleMatch ? 'possible' : 'new';
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

function bankOverlapLookup(originals, bankRows) {
  const groups = new Map();
  const identities = new Map();
  for (const [index, original] of originals.entries()) {
    if (!bankRows[index] || !original.sourceFingerprint) {
      continue;
    }
    const identity = JSON.stringify([original.externalSource, original.account, original.sourceFingerprint]);
    const matches = groups.get(identity) ?? [];
    matches.push(index);
    groups.set(identity, matches);
    identities.set(index, identity);
  }
  return index => (groups.get(identities.get(index)) ?? [])
    .filter(match => bankRows[match].statementNumber !== bankRows[index].statementNumber);
}

export function previewTransactionImport(state, transactions, options = {}) {
  const { originals = transactions, bankRows = [], bankPairs = {}, pendingAccounts = [] } = options;
  const pairedCredits = new Map(Object.entries(bankPairs).map(([debit, pair]) => [pair.counterpartIndex, Number(debit)]));
  const overlappingBankRows = bankOverlapLookup(originals, bankRows);
  const rows = transactions.map((transaction, index) => {
    const bank = bankRows[index];
    const sourceRow = bank?.sourceRow ?? index + 1;
    const pairedBy = pairedCredits.get(index);
    if (pairedBy !== undefined) {
      return { index, sourceRow, bank, transaction, pairedBy, status: 'paired' };
    }
    if (bank?.error) {
      return { index, sourceRow, bank, transaction, status: 'invalid', normalizationError: bank.error, error: bank.error };
    }
    const hasLedgerId = isRecordIdentifier(transaction.id);
    const matchingRecords = state.transactions.filter(record =>
      (hasLedgerId && record.id === transaction.id) || hasSameExternalIdentity(record, transaction));
    if (matchingRecords.length > 1) {
      return {
        index, sourceRow, bank, transaction, status: 'invalid',
        error: 'The identifiers match different transactions. Correct the ledger ID or source reference before importing.'
      };
    }
    const [existing] = matchingRecords;
    const original = originals[index];
    const possibleMatches = state.transactions.filter(record => possibleDuplicate(record, transaction)
      || (original !== transaction && possibleDuplicate(record, original)));
    const possibleStatementMatches = overlappingBankRows(index)
      .filter(match => match < index || pairedCredits.has(match));
    const pair = bankPairs[index];
    if (pair) {
      const matchingPairedCredits = overlappingBankRows(pair.counterpartIndex)
        .filter(match => pairedCredits.get(match) < index);
      possibleStatementMatches.push(...matchingPairedCredits);
    }
    return {
      index, sourceRow, bank, transaction, existing, possibleMatches, possibleStatementMatches, pair,
      status: reviewStatus(existing, transaction, possibleMatches.length > 0 || possibleStatementMatches.length > 0)
    };
  });
  const candidateRows = rows.filter(row => row.status !== 'invalid' && row.status !== 'paired');
  markRepeatedIdentities(candidateRows);
  const candidates = new Map(candidateRows.filter(row => row.status !== 'invalid' && row.duplicateOf === undefined).map(row => [row.index,
    row.existing ? updatedTransaction(row.existing, row.transaction) : { ...row.transaction, id: row.transaction.id ?? Symbol('preview') }
  ]));
  const importedIds = new Set([...candidates.values()].map(transaction => transaction.id));
  const combinedState = {
    ...state,
    accounts: [...state.accounts, ...pendingAccounts],
    transactions: [
      ...state.transactions.filter(transaction => !importedIds.has(transaction.id)),
      ...candidates.values()
    ]
  };
  for (const row of rows) {
    if (row.status === 'invalid' || row.status === 'paired') {
      continue;
    }
    try {
      const transaction = candidates.get(row.duplicateOf ?? row.index);
      if (row.bank) {
        validateBankDraft(row.bank, transaction, row.pair);
      }
      validateTransaction(combinedState, transaction);
    } catch (error) {
      row.status = 'invalid';
      row.error = error.message;
    }
  }
  return { rows, originals, bankRows, bankPairs, pendingAccounts, baseline: JSON.stringify(state) };
}

export function reviseTransactionImport(state, review, rowIndex, { counterpartIndex, transferDate, ...changes }) {
  if (JSON.stringify(state) !== review.baseline) {
    throw Error('The ledger changed after preview. Preview this file again before editing.');
  }
  const bankPairs = { ...review.bankPairs };
  const editedRow = review.rows[rowIndex];
  if (editedRow.bank) {
    delete bankPairs[rowIndex];
    changes.counterpartSourceFingerprint = undefined;
    if (changes.type === k_transactionTypes.transfer) {
      const counterpart = bankTransferCounterparts(review, rowIndex).find(row => row.index === counterpartIndex);
      changes.toAccount = counterpart?.transaction.account;
      if (counterpart) {
        const sourceDates = [editedRow.bank.valueDate, counterpart.bank.valueDate];
        const sameDate = sourceDates[0] === sourceDates[1];
        const dateConfirmed = sameDate || sourceDates.includes(transferDate);
        changes.amount = review.originals[rowIndex].amount;
        changes.date = !sameDate && dateConfirmed ? transferDate : sourceDates[0];
        changes.counterpartSourceFingerprint = review.originals[counterpart.index].sourceFingerprint;
        bankPairs[rowIndex] = { counterpartIndex: counterpart.index, dateConfirmed };
      }
    }
  }
  const transactions = review.rows.map(row => row.index === rowIndex
    ? { ...row.transaction, ...changes }
    : row.transaction);
  const revised = previewTransactionImport(state, transactions, {
    originals: review.originals, bankRows: review.bankRows, bankPairs, pendingAccounts: review.pendingAccounts
  });
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
      if (choice === 'skip') {
        continue;
      }
      throw Error(`Row ${row.sourceRow}: ${row.error}`);
    }
    if (row.status === 'unchanged' || row.status === 'paired') {
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
  const accountIds = new Set(transactions.flatMap(transaction => [transaction.account, transaction.toAccount]));
  const accounts = [...state.accounts, ...(review.pendingAccounts ?? []).filter(account => accountIds.has(account.id))];
  const result = { ...state, accounts, transactions };
  for (const transaction of transactions) {
    try {
      validateTransaction(result, transaction);
    } catch (error) {
      const title = transaction.title || 'Untitled transaction';
      const origin = state.transactions.includes(transaction) ? 'Existing ledger transaction' : 'Imported transaction';
      throw Error(`${origin} ${title} (${transaction.date || 'unknown date'}): ${error.message}`, { cause: error });
    }
  }
  return validatePaybackState(result);
}
