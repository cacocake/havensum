import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import * as XLSX from 'xlsx';
import {Buffer} from 'buffer';
import {createWorkbook} from './workbook.js';
async function shareFile(name,content,mimeType,encoding=FileSystem.EncodingType.UTF8){
 const uri=FileSystem.cacheDirectory+name;
 await FileSystem.writeAsStringAsync(uri,content,{encoding});
 if(!await Sharing.isAvailableAsync())throw Error('Android sharing is unavailable on this device.');
 await Sharing.shareAsync(uri,{mimeType,dialogTitle:'Your Melo data'});
}
export async function downloadJSON(state){await shareFile(`Melo-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(state,null,2),'application/json');}
export async function exportExcel(state,month){const wb=createWorkbook(ExcelJS,state,month);const buffer=await wb.xlsx.writeBuffer();await shareFile(`Melo-${month}.xlsx`,Buffer.from(buffer).toString('base64'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',FileSystem.EncodingType.Base64);}
export async function chooseFile(accept){
 const result=await DocumentPicker.getDocumentAsync({type:accept==='.json'?'application/json':['application/json','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'],copyToCacheDirectory:true});
 if(result.canceled)return null;const f=result.assets[0];return {...f,text:()=>FileSystem.readAsStringAsync(f.uri)};
}
export async function readImport(file){if(file.name.endsWith('.json')){const data=JSON.parse(await file.text());if(Array.isArray(data))return {rows:data};if(Array.isArray(data.transactions))return {rows:data.transactions,backup:data.version?data:null};throw Error('No transactions array found.');}const content=await FileSystem.readAsStringAsync(file.uri,{encoding:FileSystem.EncodingType.Base64});const wb=XLSX.read(content,{type:'base64',cellDates:true});return {rows:XLSX.utils.sheet_to_json(wb.Sheets['Raw transactions']||wb.Sheets[wb.SheetNames[0]],{defval:''})};}
