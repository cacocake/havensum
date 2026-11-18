import { normalizeImportDate, parseImportAmount } from './importNormalization.js';

export const k_cashewCsvProfile = 'cashew-csv-v1';
const k_cashewBetaProfile = 'cashew-csv-v2';
export const k_cashewOrdinaryType = 'null';
const k_headers = [
  'account', 'amount', 'currency', 'title', 'note', 'date', 'income', 'type',
  'category name', 'subcategory name', 'color', 'icon', 'emoji', 'budget', 'objective'
];
const k_betaHeaders = [
  'account', 'amount', 'amount unpaid', 'currency', 'title', 'note', 'date', 'income', 'type',
  'category name', 'subcategory name', 'color', 'icon', 'emoji', 'budget', 'objective', 'extra'
];
const k_profiles = [[k_cashewCsvProfile, k_headers], [k_cashewBetaProfile, k_betaHeaders]];
const k_signedAmount = /^[+-]?\d+(?:[.,]\d{1,2})?$/;
const k_betaAmount = /^[+-]?(\d+)(?:[.,](\d{1,20}))?$/;
const k_centsPerEuro = 100n;
const k_floatingPointNoiseDenominator = 10_000_000_000n;
const k_datePattern = /^\d{4}-\d{2}-\d{2}$/;
const k_cashewMarkers = ['account', 'income', 'category name', 'subcategory name'];

function readAmount(amountText, profile) {
  if (k_signedAmount.test(amountText)) {
    return parseImportAmount(amountText.replace(/^[+-]/, ''), 'euros');
  }
  const decimal = profile === k_cashewBetaProfile ? k_betaAmount.exec(amountText) : null;
  if (!decimal) {
    throw Error('Use a signed EUR amount with at most two decimals and no thousands separator.');
  }
  const [, whole, fraction] = decimal;
  const scale = 10n ** BigInt(fraction.length);
  const scaledCents = BigInt(fraction) * k_centsPerEuro;
  const nearestCents = (scaledCents + scale / 2n) / scale;
  const difference = scaledCents - nearestCents * scale;
  const absoluteDifference = difference < 0n ? -difference : difference;
  // The beta serializes floating-point amounts. Only accept tails within €0.0000000001 of a cent.
  if (absoluteDifference * k_floatingPointNoiseDenominator > scale * k_centsPerEuro) {
    throw Error('The Cashew amount includes a fraction of a cent.');
  }
  return parseImportAmount(BigInt(whole) * k_centsPerEuro + nearestCents, 'cents');
}

function readMovement(amountText, currency, timestamp, profile) {
  if (currency !== 'EUR') {
    throw Error('Only EUR is supported.');
  }
  const date = normalizeImportDate(timestamp, false);
  const parsedDate = new Date(date);
  if (!k_datePattern.test(date) || !Number.isFinite(parsedDate.getTime())
    || !parsedDate.toISOString().startsWith(date)) {
    throw Error('The Cashew transaction date is invalid.');
  }
  return {
    amount: readAmount(amountText, profile),
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
  const layout = k_profiles.find(([, columns]) => columns.length === headers.length
    && columns.every((column, index) => column === headers[index]));
  if (!layout) {
    throw Error('Unsupported Cashew CSV header. Use the original transaction export.');
  }
  const [profile] = layout;
  const fieldIndices = Object.fromEntries(headers.map((header, index) => [header, index]));
  const transactions = records.flatMap((record, index) => {
    if (record.every(cell => cell === '')) {
      return [];
    }
    const field = name => record[fieldIndices[name]] ?? '';
    const sourceType = field('type');
    const specialType = profile === k_cashewBetaProfile && sourceType === 'default'
      ? k_cashewOrdinaryType : sourceType;
    const row = {
      sourceRow: headerIndex + index + 2, account: field('account').trim(), title: field('title'), note: field('note'),
      income: field('income'), specialType, timestamp: field('date').trim(),
      category: [field('category name'), field('subcategory name')].filter(Boolean).join(' / ')
    };
    try {
      if (record.slice(headers.length).some(Boolean)) {
        throw Error('This row has extra values beyond the Cashew header.');
      }
      const unverifiedField = ['amount unpaid', 'extra'].find(name => field(name).trim());
      if (unverifiedField) {
        throw Error(`Cashew "${unverifiedField}" is populated. Review this row outside the import.`);
      }
      return [{ ...row, movement: readMovement(field('amount').trim(), field('currency').trim(), row.timestamp, profile) }];
    } catch (error) {
      return [{ ...row, error: error.message }];
    }
  });
  return { cashew: { profile }, rows: transactions };
}
