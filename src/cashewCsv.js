import { normalizeImportDate, parseImportAmount } from './importNormalization.js';

export const k_cashewCsvProfile = 'cashew-csv-v1';
export const k_cashewOrdinaryType = 'null';
const k_headers = [
  'account', 'amount', 'currency', 'title', 'note', 'date', 'income', 'type',
  'category name', 'subcategory name', 'color', 'icon', 'emoji', 'budget', 'objective'
];
const k_signedAmount = /^[+-]?\d+(?:[.,]\d{1,2})?$/;
const k_datePattern = /^\d{4}-\d{2}-\d{2}$/;
const k_cashewMarkers = ['account', 'income', 'category name', 'subcategory name', 'emoji', 'objective'];

function readMovement(amountText, currency, timestamp) {
  if (currency !== 'EUR') {
    throw Error('Only EUR is supported.');
  }
  if (!k_signedAmount.test(amountText)) {
    throw Error('Use a signed EUR amount with at most two decimals and no thousands separator.');
  }
  const date = normalizeImportDate(timestamp, false);
  const parsedDate = new Date(date);
  if (!k_datePattern.test(date) || !Number.isFinite(parsedDate.getTime())
    || !parsedDate.toISOString().startsWith(date)) {
    throw Error('The Cashew transaction date is invalid.');
  }
  return {
    amount: parseImportAmount(amountText.replace(/^[+-]/, ''), 'euros'),
    date,
    direction: amountText.startsWith('-') ? 'debit' : 'credit'
  };
}

export function readCashewCsv(rows) {
  const headerIndex = rows.findIndex(row => row.some(cell => cell.trim()));
  const [headerRow = [], ...records] = headerIndex === -1 ? [] : rows.slice(headerIndex);
  const headers = headerRow.map(header => header.trim().toLowerCase());
  while (headers.at(-1) === '') {
    headers.pop();
  }
  if (!k_cashewMarkers.every(name => headers.includes(name))) {
    return null;
  }
  if (headers.length !== k_headers.length || !k_headers.every((header, index) => header === headers[index])) {
    throw Error('Unsupported Cashew CSV header. Use the original transaction export.');
  }
  const transactions = records.flatMap((record, index) => {
    if (record.every(cell => cell === '')) {
      return [];
    }
    const [account = '', amount = '', currency = '', title = '', note = '', timestamp = '',
      income = '', specialType = '', category, subcategory] = record;
    const row = {
      sourceRow: headerIndex + index + 2, account: account.trim(), title, note, income, specialType, timestamp: timestamp.trim(),
      category: [category, subcategory].filter(Boolean).join(' / ')
    };
    try {
      if (record.slice(k_headers.length).some(Boolean)) {
        throw Error('This row has extra values beyond the Cashew header.');
      }
      return [{ ...row, movement: readMovement(amount.trim(), currency.trim(), row.timestamp) }];
    } catch (error) {
      return [{ ...row, error: error.message }];
    }
  });
  return { cashew: { profile: k_cashewCsvProfile }, rows: transactions };
}
