import { validatePaybackState } from './paybackState.js';

const k_jsonExtension = '.json';
const k_csvExtension = '.csv';
const k_transactionSheet = 'Raw transactions';
const k_missingTransactionsMessage = 'No transactions array found.';

export function isTextImport(fileName) {
  const normalizedName = fileName.toLowerCase();
  return normalizedName.endsWith(k_jsonExtension) || normalizedName.endsWith(k_csvExtension);
}

export async function parseImportContent(fileName, content) {
  const normalizedName = fileName.toLowerCase();
  if (normalizedName.endsWith(k_jsonExtension)) {
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return { rows: data };
    }
    if (Array.isArray(data?.transactions)) {
      validatePaybackState(data);
      return { rows: data.transactions, backup: data.version ? data : null };
    }
    throw Error(k_missingTransactionsMessage);
  }

  const XLSX = await import('xlsx');
  // CSV yields textual fields; XLSX retains decoded cell types (numbers/Dates).
  // Both formats are normalized by the reviewed transaction-import flow.
  // Decode CSV as text before parsing; byte-mode guesses can corrupt UTF-8 names.
  // Keep CSV fields as text so identifiers and ISO dates survive spreadsheet guessing.
  const isCsv = normalizedName.endsWith(k_csvExtension);
  const workbook = XLSX.read(content, isCsv
    ? { type: 'string', raw: true }
    : { type: 'array', cellDates: true });
  const transactionSheet = workbook.Sheets[k_transactionSheet] || workbook.Sheets[workbook.SheetNames[0]];
  return {
    rows: XLSX.utils.sheet_to_json(transactionSheet, { defval: '' }),
    accounts: workbook.Sheets.Accounts ? XLSX.utils.sheet_to_json(workbook.Sheets.Accounts) : null,
    categories: workbook.Sheets.Categories ? XLSX.utils.sheet_to_json(workbook.Sheets.Categories) : null
  };
}
