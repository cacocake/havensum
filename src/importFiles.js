import { migrateState } from './stateSchema.js';
import { Buffer } from 'buffer';
import { readRealBankStatement } from './realBankCsv.js';
import { readCashewCsv } from './cashewCsv.js';

const k_jsonExtension = '.json';
const k_csvExtension = '.csv';
const k_transactionSheet = 'Raw transactions';
const k_missingTransactionsMessage = 'No transactions array found.';
const k_windows1252FirstMappedByte = 0x80;
const k_windows1252ControlRange = /[\x80-\x9f]/g;
const k_windows1252MappedCharacters = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8dŽ\x8f\x90‘’“”•–—˜™š›œ\x9džŸ';

export function isTextImport(fileName) {
  return fileName.toLowerCase().endsWith(k_jsonExtension);
}

function decodeCsv(content) {
  if (typeof content === 'string') {
    return content;
  }
  const bytes = Buffer.from(content);
  const utf8 = bytes.toString('utf8');
  if (Buffer.from(utf8, 'utf8').equals(bytes)) {
    return utf8;
  }
  return bytes.toString('latin1').replace(k_windows1252ControlRange, character =>
    k_windows1252MappedCharacters[character.charCodeAt(0) - k_windows1252FirstMappedByte]);
}

export async function parseImportContent(fileName, content) {
  const normalizedName = fileName.toLowerCase();
  if (normalizedName.endsWith(k_jsonExtension)) {
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return { rows: data };
    }
    if (Array.isArray(data?.transactions)) {
      const isLedgerBackup = data.version !== undefined
        && ['accounts', 'categories', 'loans', 'events', 'plan', 'preferences', 'theme', 'demo'].some(key => Object.hasOwn(data, key));
      const backup = isLedgerBackup ? migrateState(data) : null;
      return { rows: data.transactions, backup };
    }
    throw Error(k_missingTransactionsMessage);
  }

  const XLSX = await import('xlsx');
  // CSV yields textual fields; XLSX retains decoded cell types (numbers/Dates).
  // Both formats are normalized by the reviewed transaction-import flow.
  // Decode CSV as text before parsing; byte-mode guesses can corrupt UTF-8 names.
  // Keep CSV fields as text so identifiers and ISO dates survive spreadsheet guessing.
  const isCsv = normalizedName.endsWith(k_csvExtension);
  const workbook = XLSX.read(isCsv ? decodeCsv(content).replace(/^\uFEFF/, '') : content, isCsv
    ? { type: 'string', raw: true }
    : { type: 'array', cellDates: true });
  const transactionSheet = workbook.Sheets[k_transactionSheet] || workbook.Sheets[workbook.SheetNames[0]];
  if (isCsv) {
    const csvRows = XLSX.utils.sheet_to_json(transactionSheet, { header: 1, blankrows: true, defval: '' });
    const recognizedImport = readRealBankStatement(csvRows) ?? readCashewCsv(csvRows);
    if (recognizedImport) {
      return recognizedImport;
    }
  }

  return {
    rows: XLSX.utils.sheet_to_json(transactionSheet, { defval: '' }),
    accounts: workbook.Sheets.Accounts ? XLSX.utils.sheet_to_json(workbook.Sheets.Accounts) : null,
    categories: workbook.Sheets.Categories ? XLSX.utils.sheet_to_json(workbook.Sheets.Categories) : null
  };
}
