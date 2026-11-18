import { normalizeImportDate, parseImportAmount } from './importNormalization.js';

const k_headers = [
  'account', 'amount', 'currency', 'title', 'note', 'date', 'income', 'type',
  'category name', 'subcategory name', 'color', 'icon', 'emoji', 'budget', 'objective'
];
const k_signedAmount = /^[+-]?\d+(?:[.,]\d{1,2})?$/;

function readMovement(amountText, currency, timestamp) {
  if (currency !== 'EUR') {
    throw Error('Only EUR is supported.');
  }
  if (!k_signedAmount.test(amountText)) {
    throw Error('Use a signed EUR amount with at most two decimals and no thousands separator.');
  }
  const date = normalizeImportDate(timestamp, false);
  const parsedDate = new Date(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime())
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
  const [headerRow = [], ...records] = rows;
  const headers = headerRow.map(header => header.trim().toLowerCase());
  while (headers.at(-1) === '') {
    headers.pop();
  }
  if (!['account', 'income', 'category name', 'subcategory name', 'emoji', 'objective']
    .every(name => headers.includes(name))) {
    return null;
  }
  if (headers.length !== k_headers.length || !k_headers.every((header, index) => header === headers[index])) {
    throw Error('Unsupported Cashew CSV header. Use the original transaction export.');
  }
  const profile = 'cashew-csv-v1';
  const transactions = records.flatMap((record, index) => {
    if (record.every(cell => cell === '')) {
      return [];
    }
    const [account = '', amount = '', currency = '', title = '', note = '', timestamp = '',
      income = '', specialType = '', category, subcategory] = record;
    const row = {
      sourceRow: index + 2, account: account.trim(), title, note, income, specialType,
      category: [category, subcategory].filter(Boolean).join(' / ')
    };
    try {
      if (record.slice(k_headers.length).some(Boolean)) {
        throw Error('This row has extra values beyond the Cashew header.');
      }
      return [{ ...row, movement: readMovement(amount.trim(), currency.trim(), timestamp.trim()) }];
    } catch (error) {
      return [{ ...row, error: error.message }];
    }
  });
  return { cashew: { profile }, rows: transactions };
}
