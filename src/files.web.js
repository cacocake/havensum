import {createWorkbook} from './workbook.js';
import { isTextImport, parseImportContent } from './importFiles.js';
import {euro,monthStats,accountBalance,categorySettings} from './engine.js';
export function downloadJSON(state){download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),`Melo-backup-${new Date().toISOString().slice(0,10)}.json`);}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function exportExcel(state,month){
 const {default:ExcelJS}=await import('exceljs');const wb=createWorkbook(ExcelJS,state,month);
 download(new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`Melo-${month}.xlsx`);
}
export function chooseFile(accept='.json,.csv,.xlsx'){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.onchange=()=>resolve(input.files?.[0]||null);input.addEventListener('cancel',()=>resolve(null));input.click();});}
export async function readImport(file) {
  const content = isTextImport(file.name) ? await file.text() : await file.arrayBuffer();
  return parseImportContent(file.name, content);
}
