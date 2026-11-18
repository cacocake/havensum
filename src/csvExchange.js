import { validateTransaction } from './transactionValidation.js';
import { k_spendingBehaviors } from './domainConstants.js';
import { isRecordIdentifier } from './recordIdentity.js';

const k_csvColumns = [
  'schema_version', 'text_encoding', 'id', 'type', 'date', 'title', 'amount', 'currency',
  'account_id', 'account_name', 'category_id', 'category_path', 'to_account_id',
  'to_account_name', 'linked_id', 'kind', 'note', 'external_source', 'external_id', 'loan_id'
];
const k_textColumns = new Set([
  'id', 'title', 'account_id', 'account_name', 'category_id', 'category_path',
  'to_account_id', 'to_account_name', 'linked_id', 'note', 'external_source', 'external_id', 'loan_id'
]);
const k_centsPerEuro = 100n;

export function createQuickEntryTemplate() {
  return 'Date,Title,Amount,Account,Category,Note\r\n';
}

export const k_csvQuickGuide = `Havensum quick entry

Keep the header row. The blank template contains no example purchases.
Date: YYYY-MM-DD, for example 2026-11-10.
Title: a short description.
Amount: positive EUR with at most two decimals, for example 12.34.
Account: the exact account name, or map it during import.
Category: the exact category name or Parent / Child path.
Note: optional; quote text containing commas, quotes or newlines.
Type defaults to expense. An optional Type column can contain expense, income,
reimbursement or transfer. Positive amounts are never automatically earnings.
Semicolon files with decimal commas are accepted. Thousands separators are not.
Preview every row. Choose what to do with edited IDs and possible duplicates.
Cancel to leave the ledger unchanged. Import appends approved new rows.

Canonical exports include IDs, links, EUR and a text_encoding marker.
apostrophe-v1 prefixes textual cells with one apostrophe to prevent formulas and
identifier guessing. Keep these prefixes; Havensum removes exactly one on import.
Ordinary template text has no marker and is preserved literally.
Spreadsheet programs may alter dates or IDs. Check the preview after editing.
CSV contains transactions only. Use full JSON backup for settings and frozen plans.
Bank-specific adapters and expected-payback task fields are separate pending work.
`;

function quoteCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function formatEuroAmount(amount) {
  const integerAmount = BigInt(amount);
  return `${integerAmount / k_centsPerEuro}.${String(integerAmount % k_centsPerEuro).padStart(2, '0')}`;
}

export function categoryPath(categories, categoryId) {
  const category = categories.find(record => record.id === categoryId);
  if (!category) {
    return '';
  }
  const parent = categories.find(record => record.id === category.parentId);
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

export function createTransactionCsv(state) {
  const rows = state.transactions.map(transaction => {
    if (!isRecordIdentifier(transaction.id)) {
      throw Error('CSV export requires valid transaction identifiers.');
    }
    validateTransaction(state, transaction);
    if (transaction.kind && !Object.values(k_spendingBehaviors).includes(transaction.kind)) {
      throw Error('CSV export requires a supported spending behaviour.');
    }
    const record = {
      schema_version: '1', text_encoding: 'apostrophe-v1',
      id: transaction.id, type: transaction.type, date: transaction.date,
      title: transaction.title, amount: formatEuroAmount(transaction.amount), currency: 'EUR',
      account_id: transaction.account,
      account_name: state.accounts.find(account => account.id === transaction.account)?.name,
      category_id: transaction.category,
      category_path: categoryPath(state.categories, transaction.category),
      to_account_id: transaction.toAccount,
      to_account_name: state.accounts.find(account => account.id === transaction.toAccount)?.name,
      linked_id: transaction.linkedId, kind: transaction.kind, note: transaction.note,
      external_source: transaction.externalSource, external_id: transaction.externalId, loan_id: transaction.loanId
    };
    return k_csvColumns.map(column => {
      const value = record[column] ?? '';
      // Explicit per-row encoding makes prefix removal reversible even for a
      // literal apostrophe. It also protects numeric-looking IDs from guessing.
      const encodedValue = k_textColumns.has(column) && value !== '' ? `'${value}` : value;
      return quoteCell(encodedValue);
    }).join(',');
  });
  return [k_csvColumns.join(','), ...rows].join('\r\n') + '\r\n';
}
