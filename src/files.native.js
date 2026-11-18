import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import {Buffer} from 'buffer';
import {createWorkbook} from './workbook.js';
import { isTextImport, parseImportContent } from './importFiles.js';
async function shareFile(name, content, mimeType, encoding = FileSystem.EncodingType.UTF8) {
  const uri = FileSystem.cacheDirectory + name;
  await FileSystem.writeAsStringAsync(uri, content, { encoding });
  if (!await Sharing.isAvailableAsync()) {
    throw Error('Android sharing is unavailable on this device.');
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Your Havensum data' });
}
export async function downloadJSON(state) {
  const fileName = `Havensum-backup-${new Date().toISOString().slice(0, 10)}.json`;
  await shareFile(fileName, JSON.stringify(state, null, 2), 'application/json');
}
export async function exportExcel(state, month) {
  const workbook = createWorkbook(ExcelJS, state, month);
  const buffer = await workbook.xlsx.writeBuffer();
  await shareFile(
    `Havensum-${month}.xlsx`,
    Buffer.from(buffer).toString('base64'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    FileSystem.EncodingType.Base64
  );
}
export async function chooseFile(accept){
 const result=await DocumentPicker.getDocumentAsync({type:accept==='.json'?'application/json':['application/json','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'],copyToCacheDirectory:true});
 if(result.canceled)return null;const f=result.assets[0];return {...f,text:()=>FileSystem.readAsStringAsync(f.uri)};
}
export async function readImport(file) {
  if (isTextImport(file.name)) {
    return parseImportContent(file.name, await file.text());
  }
  const encodedContent = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = new Uint8Array(Buffer.from(encodedContent, 'base64'));
  return parseImportContent(file.name, bytes);
}
