import {monthStats,accountBalance} from './engine.js';
export function createWorkbook(ExcelJS,state,month){
 const wb = new ExcelJS.Workbook();
 wb.creator = 'Havensum';
 const s = wb.addWorksheet('Your month');
 s.columns = [{ width: 30 }, { width: 24 }, { width: 24 }];
 s.mergeCells('A1:C2');
 s.getCell('A1').value = 'havensum · a calm home for your money';
 s.getCell('A1').font = { name: 'Calibri', size: 23, bold: true, color: { argb: 'FF433B32' } };
 s.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFADECC' } };
 s.getRow(3).height = 12;
 const stats=monthStats(state,month);s.addRow(['Month',month]);s.addRow(['Income',stats.income/100]);s.addRow(['Net expenses',stats.spent/100]);s.addRow(['Monthly balance',stats.balance/100]);s.addRow(['Reimbursed (original month)',stats.reimbursed/100]);s.addRow([]);s.addRow(['Account','Type','Balance']);for(const a of state.accounts)s.addRow([a.name,a.tag,accountBalance(state,a.id)/100]);
 s.eachRow((row,i)=>{if(i>3)row.eachCell(c=>{c.font={name:'Calibri',size:11,color:{argb:'FF433B32'}};if(typeof c.value==='number')c.numFmt='€#,##0.00';});});s.getRow(10).font={bold:true};
 const raw=wb.addWorksheet('Raw transactions');const keys=['id','type','title','amount','date','account','category','kind','note','linkedId','toAccount','externalId','loanId'];raw.columns=keys.map(key=>({header:key,key,width:key==='title'||key==='note'?30:20}));state.transactions.forEach(t=>raw.addRow(Object.fromEntries(keys.map(k=>[k,k==='amount'?t.amount/100:t[k]??'']))));raw.views=[{state:'frozen',ySplit:1}];raw.autoFilter={from:'A1',to:'M1'};
 const ac=wb.addWorksheet('Accounts');ac.columns=['id','name','tag','openingBalance','interest','interestStart','ticker','color','icon'].map(key=>({header:key,key,width:20}));state.accounts.forEach(a=>ac.addRow(a));const cat=wb.addWorksheet('Categories');cat.columns=['id','name','parentId','icon','color','kind','budget'].map(key=>({header:key,key,width:20}));state.categories.forEach(c=>cat.addRow(c));
 return wb;
}
