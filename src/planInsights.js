import {monthStats,categorySettings,monthOf} from './engine.js';

// A read-only outlook. Never writes a plan, transaction or past month.
export function planInsights(state,month,today=new Date().toISOString().slice(0,10)){
 const window=state.plan?.window||6;
 const history=Array.from({length:window},(_,i)=>{const d=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-2-i,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}).reverse();
 const recorded=history.filter(m=>m<monthOf(today)&&state.transactions.some(t=>monthOf(t.date)===m));
 const count=recorded.length;
 const average=field=>count?Math.round(recorded.reduce((s,m)=>s+monthStats(state,m)[field],0)/count):null;
 const averages={income:average('income'),spent:average('spent'),balance:average('balance')};
 const categories=state.categories.filter(c=>!c.parentId&&!['salary','interest'].includes(c.id)).map(cat=>{
  const totals=recorded.map(m=>monthStats(state,m).expenses.filter(t=>{const c=categorySettings(state.categories,t.category);return c.id===cat.id||c.parentId===cat.id}).reduce((s,t)=>s+t.net,0));
  return {...cat,average:count?Math.round(totals.reduce((s,n)=>s+n,0)/count):null};
 });
 const plan=state.plan?.months[month]||null,current=monthOf(today),period=month<current?'past':month>current?'future':'current';
 const actualState=period==='current'?{...state,transactions:state.transactions.filter(t=>t.date<=today)}:state;
 const actual=monthStats(actualState,month),days=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate(),elapsed=period==='past'?days:period==='future'?0:Math.min(days,Number(today.slice(8,10))),remaining=(days-elapsed)/days;
 if(!plan)return {plan:null,actual,averages,categories,history,recorded,count,period,days,elapsed,forecast:null,lines:[]};
 const buckets=new Map();
 const bucket=(category,kind)=>{const key=`${category}:${kind}`;if(!buckets.has(key))buckets.set(key,{category,kind,planned:0,actual:0,scheduled:0,name:categorySettings(state.categories,category).name});return buckets.get(key)};
 for(const line of plan.lines||[]){const b=bucket(line.category,line.kind);b.planned+=line.amount;b.override=!!line.override||!!b.override;}
 let occasionalActual=0,loanActual=0;
 for(const t of actual.expenses){const c=categorySettings(state.categories,t.category),parent=c.parentId||c.id||t.category||'uncategorized',kind=t.kind||c.kind;if(parent==='loan')loanActual+=t.net;else if(kind==='Occasional')occasionalActual+=t.net;else bucket(parent,kind).actual+=t.net;}
 let scheduledOccasional=0,scheduledLoan=0,scheduledIncome=0;
 if(period==='current'){
  const scheduledState={...state,transactions:state.transactions.filter(t=>t.type!=='reimbursement'||t.date<=today)};
  for(const t of monthStats(scheduledState,month).expenses.filter(t=>t.date>today)){
   const c=categorySettings(state.categories,t.category),parent=c.parentId||c.id||t.category||'uncategorized',kind=t.kind||c.kind;
   if(parent==='loan')scheduledLoan+=t.net;else if(kind==='Occasional')scheduledOccasional+=t.net;else bucket(parent,kind).scheduled+=t.net;
  }
  scheduledIncome=state.transactions.filter(t=>t.type==='income'&&monthOf(t.date)===month&&t.date>today).reduce((s,t)=>s+t.amount,0);
 }
 const lines=[...buckets.values()].filter(l=>l.category!=='loan').map(l=>({...l,forecast:period==='past'?l.actual:period==='future'?l.planned:l.kind==='Fixed'?Math.max(l.actual+l.scheduled,l.planned):l.actual+Math.max(l.scheduled,Math.round(l.planned*remaining))}));
 const reserve=(plan.cushion||0)+(plan.event||0),loan=period==='past'?loanActual:period==='future'?(plan.loan||0):Math.max(loanActual+scheduledLoan,plan.loan||0),occasional=period==='past'?occasionalActual:period==='future'?reserve:Math.max(occasionalActual+scheduledOccasional,reserve);
 const expense=lines.reduce((s,l)=>s+l.forecast,0)+loan+occasional,income=period==='past'?actual.income:period==='future'?plan.income:Math.max(actual.income+scheduledIncome,plan.income);
 const forecast={income,expense,balance:income-expense,loan,occasional,variance:income-expense-plan.balance};
 return {plan,actual,averages,categories,history,recorded,count,period,days,elapsed,forecast,lines};
}
