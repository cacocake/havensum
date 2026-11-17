import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
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
  readAsStringAsync: async uri => {
    const cachedFile = g_cachedFiles.get(uri);
    if (!cachedFile) {
      throw Error('Synthetic file not found');
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
  const csv = await readImport({ name: 'synthetic.csv', text: async () => 'title,amount,date\nCafé,12.34,2026-11-10' });
  assert.deepEqual(csv.rows, [{ title: 'Café', amount: '12.34', date: '2026-11-10' }]);
  const state = createFinancialState({ transactions: [createTransaction()] });
  const backup = await readImport({ name: 'synthetic.JSON', text: async () => JSON.stringify(state) });
  assert.deepEqual(backup.backup, state);
});
