import { categoryPath } from './csvExchange.js';
import { isRecordIdentifier } from './recordIdentity.js';
import { movementFingerprint } from './movementFingerprint.js';

const k_loanTypes = new Set(['credit', 'debt']);
const k_reviewLoanMessage = 'Review this outside the import. Cashew borrowing and lending cannot be brought in as ordinary transactions.';
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
    const requiresLoanReview = k_loanTypes.has(specialType);
    return {
      bank: {
        profile: data.cashew.profile, sourceRow: row.sourceRow, statementNumber: 1,
        statementName: data.name, category: row.category, direction: row.movement?.direction,
        valueDate: row.movement?.date, amount: row.movement?.amount,
        specialType: row.specialType, sourceWarning: sourceWarning(row),
        error: row.error ?? (requiresLoanReview ? k_reviewLoanMessage : undefined) ?? (!row.account || matching.length > 1 || !account
          ? 'Map this Cashew account or approve creating it.' : undefined)
      },
      transaction: {
        title: row.title, note: row.note, account: account?.id,
        amount: row.movement?.amount, date: row.movement?.date,
        category: categories.length === 1 ? categories[0].id : undefined,
        externalSource: data.cashew.profile,
        sourceFingerprint: row.movement ? movementFingerprint(row, [row.account, row.timestamp]) : undefined
      }
    };
  });
  return { drafts, pendingAccounts };
}
