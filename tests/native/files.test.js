import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Buffer } from 'node:buffer';
import { createFinancialState, createTransaction } from '../helpers/financialFixtures.js';

const g_cachedFiles = new Map();
const g_sharedFiles = [];
let g_sharingAvailable = true;
let g_pickerResult = { canceled: true };
const k_cacheDirectory = 'file:///synthetic-cache/';

// Metro resolves Expo's extensionless TypeScript entry; Node needs the suffix.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolvedSpecifier = specifier === 'expo-file-system/legacy' ? 'expo-file-system/legacy.ts' : specifier;
    return nextResolve(resolvedSpecifier, context);
  },
  load(url, context, nextLoad) {
    if (new URL(url).pathname.endsWith('/expo-file-system/legacy.ts')) {
      return { format: 'module', source: '', shortCircuit: true };
    }
    return nextLoad(url, context);
  }
});

mock.module('expo-document-picker', { exports: {
  getDocumentAsync: async () => g_pickerResult
} });
mock.module('expo-file-system/legacy', { exports: {
  cacheDirectory: k_cacheDirectory,
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  writeAsStringAsync: async (uri, content, options) => {
    g_cachedFiles.set(uri, { content, ...options });
  },
  readAsStringAsync: async (uri, options) => {
    const cachedFile = g_cachedFiles.get(uri);
    if (!cachedFile) {
      throw Error('Synthetic file not found');
    }
    if (cachedFile.encoding !== 'base64' && options?.encoding === 'base64') {
      return Buffer.from(cachedFile.content, 'utf8').toString('base64');
    }
    return cachedFile.content;
  }
} });
mock.module('expo-sharing', { exports: {
  isAvailableAsync: async () => g_sharingAvailable,
  shareAsync: async (uri, options) => {
    g_sharedFiles.push({ uri, ...options });
  }
} });

const { chooseFile, downloadJSON, exportExcel, readImport } = await import('../../src/files.native.js');

beforeEach(() => {
  g_cachedFiles.clear();
  g_sharedFiles.length = 0;
  g_sharingAvailable = true;
  g_pickerResult = { canceled: true };
});

test('native CSV export and blank template share UTF-8 transaction files separately from full backup', async () => {
  const { exportTransactionsCsv, downloadCsvTemplate } = await import('../../src/files.native.js');
  await exportTransactionsCsv(createFinancialState({ transactions: [createTransaction()] }));
  assert.match(g_sharedFiles[0].uri, /Havensum-transactions-.*\.csv$/);
  assert.equal(g_sharedFiles[0].mimeType, 'text/csv');
  const imported = await readImport({ name: 'Havensum.csv', uri: g_sharedFiles[0].uri, text: async () => g_cachedFiles.get(g_sharedFiles[0].uri).content });
  assert.equal(imported.rows[0].amount, '12.34');
  await downloadCsvTemplate();
  const template = g_cachedFiles.get(g_sharedFiles[1].uri);
  assert.equal(template.content, 'Date,Title,Amount,Account,Category,Note\r\n');
});

test('native picker cancellation returns no file', async () => {
  assert.equal(await chooseFile(), null);
});

test('a selected native CSV file can be read through the returned picker interface', async () => {
  const uri = `${k_cacheDirectory}selected.csv`;
  g_pickerResult = { canceled: false, assets: [{ uri, name: 'selected.csv' }] };
  g_cachedFiles.set(uri, { content: 'title,amount,date\nCafé,12.34,2026-11-10' });
  const selectedFile = await chooseFile();
  const imported = await readImport(selectedFile);

  assert.deepEqual(imported.rows, [{ title: 'Café', amount: '12.34', date: '2026-11-10' }]);
});

test('native JSON backup shares the complete state with integer-cent amounts', async () => {
  const state = createFinancialState({ transactions: [createTransaction()] });
  await downloadJSON(state);
  const sharedFile = g_sharedFiles[0];
  const savedFile = g_cachedFiles.get(sharedFile.uri);

  assert.equal(sharedFile.mimeType, 'application/json');
  assert.match(sharedFile.uri, /\/Havensum-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(sharedFile.dialogTitle, 'Your Havensum data');
  assert.equal(savedFile.encoding, 'utf8');
  assert.deepEqual(JSON.parse(savedFile.content), state);
});

test('native sharing failures are reported to the caller', async () => {
  g_sharingAvailable = false;
  await assert.rejects(downloadJSON(createFinancialState()), /sharing is unavailable/);
});

test('native workbook export can be read with account/category metadata and exact links', async () => {
  const state = createFinancialState({ transactions: [
    createTransaction(),
    createTransaction({ id: 'payback', type: 'reimbursement', amount: 234, linkedId: 'weekly-shopping' })
  ] });
  await exportExcel(state, '2026-11');
  const sharedFile = g_sharedFiles[0];
  const result = await readImport({ name: 'synthetic.xlsx', uri: sharedFile.uri });

  assert.equal(result.rows[0].amount, 12.34);
  assert.equal(result.rows[1].linkedId, 'weekly-shopping');
  assert.equal(result.accounts[0].openingBalance, 100000);
  assert.equal(result.categories[0].budget, 20000);
});

test('native text import preserves UTF-8 CSV and recognizes uppercase JSON extensions', async () => {
  const uri = `${k_cacheDirectory}utf8.csv`;
  g_cachedFiles.set(uri, { content: 'title,amount,date\nCafé,12.34,2026-11-10' });
  const csv = await readImport({ name: 'synthetic.csv', uri });
  assert.deepEqual(csv.rows, [{ title: 'Café', amount: '12.34', date: '2026-11-10' }]);
  const state = createFinancialState({ transactions: [createTransaction()] });
  const backup = await readImport({ name: 'synthetic.JSON', text: async () => JSON.stringify(state) });
  assert.deepEqual(backup.backup, state);
});
