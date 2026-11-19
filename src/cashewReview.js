import { categoryPath } from './csvExchange.js';
import { isRecordIdentifier } from './recordIdentity.js';
import { movementFingerprint } from './movementFingerprint.js';
import { k_systemCategoryIds, k_transactionTypes } from './domainConstants.js';

const k_cashewSource = 'cashew';
const k_lendingType = 'credit';
const k_borrowingType = 'debt';
const k_scheduledTypes = new Set(['upcoming', 'subscription', 'repetitive']);
const k_lendingMessage = 'Cashew lending cannot be imported. Review it outside the import.';
const k_borrowingMessages = Object.freeze({
  loan: 'Choose the Havensum loan for this Cashew borrowing entry.',
  proceeds: 'Record borrowed money as loan proceeds: an unlinked balance adjustment.',
  repayment: 'Record a borrowing repayment as an expense in the loan category.'
});
const k_scheduledNote = 'From a scheduled Cashew entry exported as paid. Unverified against a real export.';
const k_balanceCorrectionCategory = 'balance correction';
const k_readOnlySourceFields = ['budget', 'objective', 'extra'];
const k_newAccountDefaults = { openingBalance: 0, tag: 'Personal', icon: 'Wallet', color: '#91A4CE' };

function sourceWarning(row) {
  if (!row.movement) {
    return undefined;
  }
  const income = row.income.trim().toLowerCase();
  if (income !== 'true' && income !== 'false') {
    return 'The Cashew income flag is missing or unrecognized. Review the classification.';
  }
  if ((income === 'true') !== (row.movement.direction === 'credit')) {
    return 'The Cashew income flag and amount sign disagree. Review the classification.';
  }
  return undefined;
}

// K07/K10: budget, objective and extra are read-only source information.
function sourceDetails(row) {
  const details = Object.fromEntries(k_readOnlySourceFields.filter(name => row[name]).map(name => [name, row[name]]));
  return Object.keys(details).length > 0 ? details : undefined;
}

function isTransferLeg(row, draft) {
  return Boolean(row.movement) && !draft.bank.error && !draft.bank.loanRequired && draft.transaction.account !== undefined
    && row.category.trim().toLowerCase() === k_balanceCorrectionCategory;
}

function oppositeLegs(rows, drafts, index) {
  const leg = rows[index];
  return rows.flatMap((candidate, candidateIndex) => {
    const isOpposite = isTransferLeg(candidate, drafts[candidateIndex])
      && candidate.movement.direction !== leg.movement.direction
      && candidate.movement.amount === leg.movement.amount
      && candidate.timestamp === leg.timestamp
      && candidate.account !== leg.account
      && String(drafts[candidateIndex].transaction.account) !== String(drafts[index].transaction.account);
    return isOpposite ? [candidateIndex] : [];
  });
}

// K05: Cashew writes a transfer as two Balance Correction rows. Suggest a
// pair only when each leg has exactly one opposite leg; the owner can change it.
function markSuggestedTransferPairs(rows, drafts) {
  const pairs = [];
  for (const [debitIndex, debit] of rows.entries()) {
    if (debit.movement?.direction !== 'debit' || !isTransferLeg(debit, drafts[debitIndex])) {
      continue;
    }
    const credits = oppositeLegs(rows, drafts, debitIndex);
    if (credits.length !== 1 || oppositeLegs(rows, drafts, credits[0]).length !== 1) {
      continue;
    }
    const [creditIndex] = credits;
    drafts[debitIndex].bank.suggestedCounterpartRow = rows[creditIndex].sourceRow;
    drafts[creditIndex].bank.suggestedCounterpartRow = debit.sourceRow;
    pairs.push({ debitIndex, creditIndex });
  }
  return pairs;
}

export function getCashewDrafts(state, data, { accounts = {}, newAccounts = [] } = {}) {
  const names = new Set(data.rows.map(row => row.account).filter(Boolean));
  const usedIds = new Set(state.accounts.map(account => String(account.id)));
  const usedNames = new Set(state.accounts.map(account => account.name.trim()));
  const pendingAccounts = newAccounts.map(({ sourceName, id }) => {
    if (!names.delete(sourceName) || !isRecordIdentifier(id) || usedIds.has(String(id)) || usedNames.has(sourceName)) {
      throw Error('Choose a distinct new account for each unmatched Cashew account.');
    }
    usedIds.add(String(id));
    usedNames.add(sourceName);
    return { ...k_newAccountDefaults, id, name: sourceName };
  });
  const drafts = data.rows.map(row => {
    const mapped = Object.hasOwn(accounts, row.account);
    const matching = state.accounts.filter(account => mapped
      ? String(account.id) === String(accounts[row.account])
      : account.name === row.account);
    const pending = pendingAccounts.find(account => account.name === row.account);
    const account = mapped ? matching[0] : pending ?? matching[0];
    const categories = state.categories.filter(category => categoryPath(state.categories, category.id) === row.category);
    const specialType = row.specialType.trim().toLowerCase().split('.').at(-1);
    const specialTypeError = specialType === k_lendingType ? k_lendingMessage : undefined;
    return {
      bank: {
        profile: data.cashew.profile, sourceRow: row.sourceRow, statementNumber: 1,
        statementName: data.name, category: row.category, direction: row.movement?.direction,
        valueDate: row.movement?.date, amount: row.movement?.amount,
        specialType: row.specialType, sourceWarning: sourceWarning(row),
        sourceDetails: sourceDetails(row),
        loanRequired: specialType === k_borrowingType ? true : undefined,
        scheduledNote: k_scheduledTypes.has(specialType) ? k_scheduledNote : undefined,
        error: row.error ?? specialTypeError ?? (!row.account || matching.length > 1 || !account
          ? 'Map this Cashew account or approve creating it.' : undefined)
      },
      transaction: {
        title: row.title, note: row.note, account: account?.id,
        amount: row.movement?.amount, date: row.movement?.date,
        category: categories.length === 1 ? categories[0].id : undefined,
        externalSource: k_cashewSource,
        sourceFingerprint: row.movement ? movementFingerprint(row, [row.account, row.timestamp]) : undefined
      }
    };
  });
  const suggestedTransfers = markSuggestedTransferPairs(data.rows, drafts);
  return { drafts, pendingAccounts, suggestedTransfers };
}

// K02/K03: a Cashew borrowing row needs an existing Havensum loan. A credit is
// loan proceeds (an unlinked balance adjustment); a debit is a repayment expense.
export function validateCashewLoanDraft(state, bank, transaction) {
  if (!bank.loanRequired) {
    return;
  }
  if (!state.loans.some(loan => loan.id === transaction.loanId)) {
    throw Error(k_borrowingMessages.loan);
  }
  if (bank.direction === 'credit') {
    if (transaction.type !== k_transactionTypes.reimbursement || transaction.linkedId !== null) {
      throw Error(k_borrowingMessages.proceeds);
    }
    return;
  }
  if (transaction.type !== k_transactionTypes.expense || transaction.category !== k_systemCategoryIds.loan) {
    throw Error(k_borrowingMessages.repayment);
  }
}

// A suggestion note applies only while its row is still paired with the
// suggested counterpart; after the owner changes the pair it no longer shows.
export function isSuggestedTransferActive(review, row) {
  const suggestedRow = row.bank?.suggestedCounterpartRow;
  if (suggestedRow === undefined) {
    return false;
  }
  const counterpartIndex = row.pair?.counterpartIndex ?? row.pairedBy;
  if (counterpartIndex === undefined) {
    return false;
  }
  return review.rows[counterpartIndex]?.sourceRow === suggestedRow;
}
