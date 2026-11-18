import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportContent } from '../src/importFiles.js';
import { readImport } from '../src/files.web.js';

const k_realBankStatement = [
  'Consultar saldos e movimentos à ordem - 09-02-2032',
  '',
  '',
  'Conta,synthetic-account',
  'Data de início,01-02-2032',
  'Data de fim,09-02-2032',
  '',
  '',
  'Data mov.,Data valor,Descrição,Débito,Crédito,Saldo contabilístico,Saldo disponível,Categoria',
  '03-02-2032,04-02-2032,"Café, chá",12.45,,111.11,110.00,Alimentação'
].join('\r\n');

test('Real Bank CSV recognizes its preamble and reads the transaction table with both source dates', async () => {
  const imported = await parseImportContent('synthetic.csv', k_realBankStatement);

  assert.deepEqual(imported.bank, { profile: 'real-bank-v1', account: 'synthetic-account' });
  assert.deepEqual(imported.rows, [{
    sourceRow: 10,
    movementDate: '03-02-2032',
    valueDate: '04-02-2032',
    title: 'Café, chá',
    debit: '12.45',
    credit: '',
    category: 'Alimentação',
    movement: { date: '2032-02-04', amount: 1245, direction: 'debit', currency: 'EUR' }
  }]);
});

test('a Windows-1252 Real Bank file keeps Portuguese accents and punctuation when picked on web', async () => {
  const statement = k_realBankStatement.replace('Café, chá', 'Café, chá \x96 lanche');
  const file = new File([Buffer.from(statement, 'latin1')], 'synthetic.CSV');
  const imported = await readImport(file);

  assert.equal(imported.bank.profile, 'real-bank-v1');
  assert.equal(imported.rows[0].title, 'Café, chá – lanche');
});

test('Real Bank credits use the value date and exact EUR cents while awaiting classification', async () => {
  const statement = k_realBankStatement + '\r\n28-02-2032,01-03-2032,Crédito sintético,,"0,07",111.18,111.18,Outros';
  const imported = await parseImportContent('synthetic.csv', statement);

  assert.deepEqual(imported.rows[1].movement, {
    date: '2032-03-01', amount: 7, direction: 'credit', currency: 'EUR'
  });
  assert.equal(imported.rows[1].type, undefined);
});

test('a UTF-8 byte order mark does not hide the Real Bank profile', async () => {
  const file = new File(['\uFEFF', k_realBankStatement], 'synthetic.csv');
  const imported = await readImport(file);

  assert.equal(imported.bank?.profile, 'real-bank-v1');
});

test('the Real Bank parser reports a missing description on the source row and keeps subsequent rows reviewable', async () => {
  const invalidRow = '05-02-2032,06-02-2032,,3,,,107,Lazer';
  const nextRow = '06-02-2032,07-02-2032,Compra sintética,4,,,103,Lazer';
  const statement = [k_realBankStatement, invalidRow, nextRow].join('\r\n');
  const imported = await parseImportContent('synthetic.csv', statement);

  assert.equal(imported.rows[1].sourceRow, 11);
  assert.match(imported.rows[1].error, /description/i);
  assert.equal(imported.rows[1].movement, undefined);
  assert.equal(imported.rows[2].movement.amount, 400);
});
