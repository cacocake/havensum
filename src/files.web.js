import {createWorkbook} from './workbook.js';
import { isTextImport, parseImportContent } from './importFiles.js';
import { createTransactionCsv, createQuickEntryTemplate, k_csvQuickGuide } from './csvExchange.js';
import {euro,monthStats,accountBalance,categorySettings} from './engine.js';
export function downloadSavedLedgerCopy(encodedLedger, fileName = 'Havensum-saved-ledger-recovery.txt') {
  download(new Blob([encodedLedger], { type: 'text/plain' }), fileName);
}
export function downloadJSON(state){download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),`Havensum-backup-${new Date().toISOString().slice(0,10)}.json`);}
export async function exportTransactionsCsv(state) {
  download(new Blob([createTransactionCsv(state)], { type: 'text/csv;charset=utf-8' }), `Havensum-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function downloadCsvTemplate() {
  download(new Blob([createQuickEntryTemplate()], { type: 'text/csv;charset=utf-8' }), 'Havensum-quick-entry.csv');
}

export async function downloadCsvGuide() {
  download(new Blob([k_csvQuickGuide], { type: 'text/plain;charset=utf-8' }), 'Havensum-CSV-guide.txt');
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function exportExcel(state, month) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = createWorkbook(ExcelJS, state, month);
  const bytes = await workbook.xlsx.writeBuffer();
  download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Havensum-${month}.xlsx`);
}
export function chooseFile(accept='.json,.csv,.xlsx'){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.onchange=()=>resolve(input.files?.[0]||null);input.addEventListener('cancel',()=>resolve(null));input.click();});}
export async function readImport(file) {
  const content = isTextImport(file.name) ? await file.text() : await file.arrayBuffer();
  return parseImportContent(file.name, content);
}
