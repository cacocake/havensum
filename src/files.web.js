import {createWorkbook} from './workbook.js';
import {euro,monthStats,accountBalance,categorySettings} from './engine.js';
export function downloadJSON(state){download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),`Melo-backup-${new Date().toISOString().slice(0,10)}.json`);}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function exportExcel(state,month){
 const {default:ExcelJS}=await import('exceljs');const wb=createWorkbook(ExcelJS,state,month);
 download(new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`Melo-${month}.xlsx`);
}
export function chooseFile(accept='.json,.csv,.xlsx'){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.onchange=()=>resolve(input.files?.[0]||null);input.addEventListener('cancel',()=>resolve(null));input.click();});}
export async function readImport(file){if(file.name.endsWith('.json')){const data=JSON.parse(await file.text());if(Array.isArray(data))return {rows:data};if(Array.isArray(data.transactions))return {rows:data.transactions,backup:data.version?data:null};throw Error('No transactions array found.');}const XLSX=await import('xlsx');const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});const sheet=wb.Sheets['Raw transactions']||wb.Sheets[wb.SheetNames[0]];return {rows:XLSX.utils.sheet_to_json(sheet,{defval:''}),accounts:wb.Sheets.Accounts?XLSX.utils.sheet_to_json(wb.Sheets.Accounts):null,categories:wb.Sheets.Categories?XLSX.utils.sheet_to_json(wb.Sheets.Categories):null};}
