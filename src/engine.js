import { accountBalance } from './ledger.js';
import { withPaybackTasks } from './paybackState.js';
export { monthOf } from './calendar.js';
export { categorySettings, netExpenses, monthStats, reportingMonthStats, accountBalance } from './ledger.js';
export { buildPlan, driftAlerts } from './planning.js';
import { validateTransaction } from './transactionValidation.js';
export { validateTransaction } from './transactionValidation.js';
export { euro, cents } from './money.js';
export function mergeThreeWay(base,local,remote){
 const result={...local},conflicts=[];
 for(const collection of ['transactions','accounts','categories','loans','events']){
  const b=new Map((base[collection]||[]).map(x=>[x.id,x])),l=new Map((local[collection]||[]).map(x=>[x.id,x])),r=new Map((remote[collection]||[]).map(x=>[x.id,x]));const merged=[];
  for(const id of new Set([...b.keys(),...l.keys(),...r.keys()])){
   const bv=b.get(id),lv=l.get(id),rv=r.get(id),eq=(a,c)=>JSON.stringify(a)===JSON.stringify(c);
   if(eq(lv,rv)){if(lv)merged.push(lv);continue;}
   if(eq(bv,lv)){if(rv)merged.push(rv);continue;}
   if(eq(bv,rv)){if(lv)merged.push(lv);continue;}
   if(!lv||!rv){conflicts.push({collection,id,field:'$record',base:bv,local:lv,remote:rv});if(lv)merged.push(lv);continue;}
   const item={id};
   for(const field of new Set([...Object.keys(lv),...Object.keys(rv)])){
    const v=bv?.[field],a=lv[field],c=rv[field];
    if(eq(a,c)||eq(c,v))item[field]=a;else if(eq(a,v))item[field]=c;else {item[field]=a;conflicts.push({collection,id,field,base:v,local:a,remote:c});}
   }merged.push(item);
  }result[collection]=merged;
 }
 // The frozen plan is versioned as a record. Never silently replace a concurrent plan revision.
 if(JSON.stringify(local.plan)!==JSON.stringify(remote.plan)&&JSON.stringify(base.plan)!==JSON.stringify(remote.plan)){
  if(JSON.stringify(base.plan)===JSON.stringify(local.plan))result.plan=remote.plan;
  else conflicts.push({collection:'plan',id:'plan',field:'$plan',base:base.plan,local:local.plan,remote:remote.plan});
 }
 const baseTasks = base.paybackTasks;
 const localTasks = local.paybackTasks ?? baseTasks;
 const remoteTasks = remote.paybackTasks ?? baseTasks;
 const serialize = tasks => JSON.stringify(tasks ?? []);
 if (serialize(remoteTasks) !== serialize(localTasks) && serialize(remoteTasks) !== serialize(baseTasks)) {
   if (serialize(localTasks) === serialize(baseTasks)) {
     Object.assign(result, withPaybackTasks(result, remoteTasks));
   } else {
     conflicts.push({ collection: 'paybackTasks', id: 'tasks', field: '$paybackTasks', base: baseTasks, local: localTasks, remote: remoteTasks });
   }
 }
 return {result,conflicts};
}
export function fingerprint(t){return t.externalId?`external:${t.externalId}`:[t.date,t.type,t.title?.trim().toLowerCase(),t.amount,t.account,t.category||'',t.note||''].join('|');}
export function importUnique(state, rows) {
  const seenFingerprints = new Set(state.transactions.map(fingerprint));
  const existingIds = new Set(state.transactions.map(transaction => transaction.id));
  const sourceRowNumbers = new Map();
  const added = [];
  for (const [rowIndex, row] of rows.entries()) {
    const rowFingerprint = fingerprint(row);
    if ((row.id && existingIds.has(row.id)) || seenFingerprints.has(rowFingerprint)) {
      continue;
    }
    const transaction = { ...row, id: row.id || `import-${hash(rowFingerprint)}` };
    seenFingerprints.add(rowFingerprint);
    existingIds.add(transaction.id);
    sourceRowNumbers.set(transaction.id, rowIndex + 1);
    added.push(transaction);
  }

  const combinedState = { ...state, transactions: [...state.transactions, ...added] };
  for (const transaction of added) {
    try {
      validateTransaction(combinedState, transaction);
    } catch (error) {
      throw Error(`Row ${sourceRowNumbers.get(transaction.id)}: ${error.message}`);
    }
  }
  return { added, skipped: rows.length - added.length };
}
export function hash(str){let h=2166136261;for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619);return (h>>>0).toString(36);}
export function compoundSavings(state,through){
 const transactions=[...state.transactions];
 for(const account of state.accounts.filter(a=>a.tag==='Savings'&&a.interest>0)){
  const start=account.interestStart||through;let cursor=new Date(Number(start.slice(0,4)),Number(start.slice(5,7))-1,1);
  while(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`<through){
   const month=`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`,id=`interest-${account.id}-${month}`;
   if(!transactions.some(t=>t.id===id)){
    const end=new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate(),date=`${month}-${end}`;
    const amount=Math.round(Math.max(0,accountBalance({...state,transactions},account.id,date))*(Math.pow(1+account.interest/100,1/12)-1));
    if(amount>0)transactions.push({id,type:'income',title:'Savings interest',amount,date,account:account.id,category:'interest',kind:'Fixed',note:'Monthly compounding · effective annual rate'});
   }cursor.setMonth(cursor.getMonth()+1);
  }
 }return {...state,transactions};
}
