// Monetary values are integer euro cents. Dates are ISO calendar dates (no UTC conversion).
export const monthOf = date => date.slice(0,7);
export const euro = (cents, digits=2) => new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',minimumFractionDigits:digits,maximumFractionDigits:digits}).format(cents/100);
export const cents = value => Math.round(Number(String(value).replace(',','.'))*100);
export function categorySettings(categories,id){
 const c=categories.find(x=>x.id===id); if(!c)return {name:'Uncategorized',color:'#aa9ca5',icon:'Shapes',kind:'Variable'};
 const p=c.parentId?categorySettings(categories,c.parentId):{};
 return {...p,...Object.fromEntries(Object.entries(c).filter(([,v])=>v!==null&&v!==undefined&&v!==''))};
}
export function netExpenses(transactions,month){
 return transactions.filter(t=>t.type==='expense'&&monthOf(t.date)===month).map(t=>{
  const refunded=transactions.filter(r=>r.type==='reimbursement'&&r.linkedId===t.id).reduce((a,r)=>a+r.amount,0);
  return {...t,net:Math.max(0,t.amount-refunded),refunded};
 });
}
export function monthStats(state,month){
 const expenses=netExpenses(state.transactions,month);
 const income=state.transactions.filter(t=>t.type==='income'&&monthOf(t.date)===month).reduce((s,t)=>s+t.amount,0);
 const spent=expenses.reduce((s,t)=>s+t.net,0);
 return {income,spent,balance:income-spent,expenses,reimbursed:expenses.reduce((s,t)=>s+t.refunded,0)};
}
export function accountBalance(state,id,until='9999-12-31'){
 const a=state.accounts.find(a=>a.id===id); if(!a)return 0;
 return state.transactions.filter(t=>t.date<=until).reduce((sum,t)=>{
  if(t.type==='transfer')return sum+(t.toAccount===id?t.amount:0)-(t.account===id?t.amount:0);
  if(t.account!==id)return sum;
  return sum+(t.type==='expense'?-t.amount:t.amount);
 },a.openingBalance);
}
export function validateTransaction(state,t){
 if(!['expense','income','reimbursement','transfer'].includes(t.type))throw Error('Choose a valid transaction type.');
 if(!t.title?.trim())throw Error('Add a title.');
 if(!Number.isSafeInteger(t.amount)||t.amount<=0)throw Error('Enter an amount greater than zero with at most two decimals.');
 if(t.type!=='transfer'&&t.category&&!state.categories.some(c=>c.id===t.category))throw Error('Choose a valid category.');
 if(!state.accounts.some(a=>a.id===t.account))throw Error('Choose an account.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||isNaN(Date.parse(t.date))||new Date(t.date).toISOString().slice(0,10)!==t.date)throw Error('Choose a valid date.');
 if(t.type==='transfer'&&(!state.accounts.some(a=>a.id===t.toAccount)||t.account===t.toAccount))throw Error('Choose a different destination account.');
 if(t.type==='reimbursement'&&t.linkedId){
  const expense=state.transactions.find(x=>x.id===t.linkedId&&x.type==='expense');
  if(!expense)throw Error('The linked expense no longer exists.');
  const other=state.transactions.filter(x=>x.id!==t.id&&x.type==='reimbursement'&&x.linkedId===expense.id).reduce((s,x)=>s+x.amount,0);
  if(other+t.amount>expense.amount)throw Error(`Only ${euro(expense.amount-other)} remains to reimburse.`);
 }
 return t;
}
export function buildPlan(state,{year,fromMonth=1,income=245000,cushion=12000,window=6,overrides={},incomeChanges=state.plan?.incomeChanges||[],loanChanges=state.plan?.loanChanges||[]}){
 const now=`${year}-${String(fromMonth).padStart(2,'0')}`;
 const history=Array.from({length:window},(_,i)=>{const d=new Date(year,fromMonth-2-i,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`});
 const lines=state.categories.filter(c=>!c.parentId).flatMap(cat=>{
  const settings=categorySettings(state.categories,cat.id);
  const matches=t=>{const c=categorySettings(state.categories,t.category);return c.id===cat.id||c.parentId===cat.id;};
  // Transaction overrides get their own behaviour bucket; occasional entries never inflate averages.
  const kinds=new Set([settings.kind]);
  history.forEach(m=>netExpenses(state.transactions,m).filter(matches).forEach(t=>kinds.add(t.kind||categorySettings(state.categories,t.category).kind)));
  return [...kinds].filter(kind=>kind!=='Occasional').map(kind=>{
   const totals=history.map(m=>netExpenses(state.transactions,m).filter(t=>matches(t)&&(t.kind||categorySettings(state.categories,t.category).kind)===kind).reduce((sum,t)=>sum+t.net,0));
   const hasHistory=history.filter(m=>state.transactions.some(t=>monthOf(t.date)===m)).length;
   const calculated=kind==='Fixed'?(totals.find(v=>v>0)||0):Math.round(totals.reduce((sum,n)=>sum+n,0)/Math.max(1,hasHistory));
   const id=kind===settings.kind?cat.id:`${cat.id}:${kind}`;
   return {id,category:cat.id,name:cat.name+(kind!==settings.kind?` · ${kind.toLowerCase()}`:''),kind,amount:overrides[id]??calculated,override:overrides[id]!==undefined};
  });
 });
 // Loans are a dedicated monthly expense line, never a balance credit.
 const loanAmount=state.loans.filter(l=>l.start<=`${year}-12`&&l.end>=now).reduce((s,l)=>s+l.payment,0);
 const months={...(state.plan?.year===year?state.plan.months:{})};
 for(let m=fromMonth;m<=12;m++){
  const key=`${year}-${String(m).padStart(2,'0')}`;
  const monthlyIncome=[...incomeChanges].filter(c=>c.since<=key).sort((a,b)=>a.since.localeCompare(b.since)).reduce((_,c)=>c.amount,income);
  const monthlyLoan=state.loans.filter(l=>l.start<=key&&l.end>=key).reduce((sum,l)=>sum+[...loanChanges].filter(c=>c.loanId===l.id&&c.since<=key).sort((a,b)=>a.since.localeCompare(b.since)).reduce((_,c)=>c.amount,l.payment),0);
  const monthlyLines=lines.filter(l=>l.category!=='loan');
  const event=(state.events||[]).filter(e=>e.month===m&&(!e.year||e.year===year)).reduce((sum,e)=>sum+e.amount,0);
  const expense=monthlyLines.reduce((s,l)=>s+l.amount,0)+monthlyLoan+cushion+event;
  months[key]={income:monthlyIncome,expense,cushion,loan:monthlyLoan,event,lines:monthlyLines,balance:monthlyIncome-expense};
 }
 return {year,incomeChanges,loanChanges,createdAt:new Date().toISOString(),window,tolerance:state.plan?.tolerance??200,drift:state.plan?.drift??0.3,months,revision:(state.plan?.revision||0)+1};
}
export function driftAlerts(state,month){
 const p=state.plan?.months[month]; if(!p)return [];
 const alerts=[];
 for(const line of p.lines){
  const actual=m=>netExpenses(state.transactions,m).filter(t=>{const c=categorySettings(state.categories,t.category);return (c.id===line.category||c.parentId===line.category)&&(t.kind||c.kind)===line.kind}).reduce((s,t)=>s+t.net,0);
  // Only completed calendar months trigger a recommendation.
  const d=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1);d.setMonth(d.getMonth()-1);
  const last=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;d.setMonth(d.getMonth()-1);
  const prev=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  if(line.kind==='Fixed'&&actual(last)>0&&Math.abs(actual(last)-line.amount)>(state.plan.tolerance??200)) alerts.push({category:line.name,reason:'Fixed spending moved outside its tolerance.'});
  if(line.kind==='Variable'&&line.amount>0&&[last,prev].every(m=>Math.abs(actual(m)-line.amount)/line.amount>(state.plan.drift??.3))) alerts.push({category:line.name,reason:'Variable spending moved outside the configured drift band for two completed months.'});
 }
 return alerts;
}
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
 return {result,conflicts};
}
export function fingerprint(t){return t.externalId?`external:${t.externalId}`:[t.date,t.type,t.title?.trim().toLowerCase(),t.amount,t.account,t.category||'',t.note||''].join('|');}
export function importUnique(state,rows){
 const seen=new Set(state.transactions.map(fingerprint)),ids=new Set(state.transactions.map(t=>t.id)),added=[];
 for(const row of rows){const key=fingerprint(row);if((row.id&&ids.has(row.id))||seen.has(key))continue;const t={...row,id:row.id||`import-${hash(key)}`};seen.add(key);ids.add(t.id);added.push(t);}
 const combined={...state,transactions:[...state.transactions,...added]};
 for(const row of added)validateTransaction(combined,row);
 return {added,skipped:rows.length-added.length};
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
