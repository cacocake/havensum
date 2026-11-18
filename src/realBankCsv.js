import { k_calendarDateLength } from './calendar.js';
import { cents, isPositiveCentAmount } from './money.js';

const k_reportTitle = 'Consultar saldos e movimentos à ordem - ';
const k_bookedBalanceFooter = 'Saldo contabilístico';
const k_valueDatePattern = /^(\d{2})-(\d{2})-(\d{4})$/;
const k_unsignedEuroPattern = /^\d+(?:[.,]\d{1,2})?$/;
const k_headers = [
  'Data mov.', 'Data valor', 'Descrição', 'Débito', 'Crédito',
  'Saldo contabilístico', 'Saldo disponível', 'Categoria'
];

function normalizeMovement({ title, valueDate, debit, credit }) {
  if (!title.trim()) {
    return { error: 'The transaction description is missing.' };
  }

  const dateParts = k_valueDatePattern.exec(valueDate);
  if (!dateParts) {
    return { error: 'Use a value date in DD-MM-YYYY format.' };
  }
  const [, day, month, year] = dateParts;
  const date = `${year}-${month}-${day}`;
  const calendarDate = new Date(date);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, k_calendarDateLength) !== date) {
    return { error: 'The value date is not a valid calendar date.' };
  }

  if (Boolean(debit) === Boolean(credit)) {
    return { error: 'Fill exactly one of Débito or Crédito.' };
  }
  const amountText = debit || credit;
  if (!k_unsignedEuroPattern.test(amountText)) {
    return { error: 'Use a positive EUR amount with up to two decimals and no thousands separator.' };
  }
  const amount = cents(amountText);
  if (!isPositiveCentAmount(amount)) {
    return { error: 'The amount must be positive and fit in safe integer euro cents.' };
  }
  return { movement: { date, amount, direction: debit ? 'debit' : 'credit', currency: 'EUR' } };
}

export function readRealBankStatement(csvRows) {
  const [title] = csvRows[0] ?? [];
  if (!title?.startsWith(k_reportTitle)) {
    return null;
  }

  const headerIndex = csvRows.findIndex(row => k_headers.every((header, index) => row[index] === header));
  if (headerIndex === -1) {
    throw Error('Real Bank CSV has an unsupported transaction header.');
  }

  const metadata = csvRows.slice(1, headerIndex);
  const accountRow = metadata.find(row => row[0] === 'Conta');
  const rows = [];
  let lastContentRow = csvRows.length - 1;
  while (lastContentRow > headerIndex && csvRows[lastContentRow].every(cell => cell === '')) {
    lastContentRow -= 1;
  }
  for (let index = headerIndex + 1; index <= lastContentRow; index += 1) {
    const [movementDate, valueDate, title, debit, credit, , , category] = csvRows[index];
    if (csvRows[index].every(cell => cell === '')) {
      continue;
    }
    if (index === lastContentRow && credit === k_bookedBalanceFooter
      && csvRows[index][5] && csvRows[index].every((cell, column) => column === 4 || column === 5 || cell === '')) {
      continue;
    }
    const row = { sourceRow: index + 1, movementDate, valueDate, title, debit, credit, category };
    rows.push({ ...row, ...normalizeMovement(row) });
  }

  return { bank: { profile: 'real-bank-v1', account: accountRow?.[1] ?? '' }, rows };
}
