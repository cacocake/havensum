import { takeReviewedPaybackTask, takeReviewedTrackedExpense } from './paybackMerge.js';
import AwaitingPaybacks from './AwaitingPaybacks.jsx';
import React,{useContext,useState,useEffect,useRef} from 'react';
import {View,Pressable,ScrollView,Platform} from 'react-native';
import {selectTransactions} from './activity.js';
import { expenseReportingMonth } from './plannedCosts.js';
import {useApp} from './context.js';
import {Theme,T,H,Row,Button,IB,Badge,TileIcon,Card,Field,Select,Toggle,Dialog,Divider,Empty} from './ui.jsx';
import Icon from './Icon';
import DataTools from './DataTools.jsx';
import ImportDialog from './ImportDialog.jsx';
import CategoryGlyph from './CategoryGlyph.jsx';
import {euro,monthOf,reportingMonthStats,netExpenses,categorySettings,accountBalance,driftAlerts,mergeThreeWay,validateTransaction} from './engine.js';
import {AccountCard,TransactionRow} from './Dashboard.jsx';
import {exportExcel,downloadJSON,downloadSavedLedgerCopy,chooseFile,readImport} from './files';
import {readInvalidSnapshotCopy,readSnapshot,writeSnapshot,isDemoSession} from './storage';
import { clearMissingTransactionCategories, migrateState, validateState } from './stateSchema.js';
import MissingCategoryReview from './MissingCategoryReview.jsx';
import { applyCategoryReviewEdits, categoryReviewRows } from './categoryReview.js';
const k_backupMessages = {
  saved: 'Backup exported · local merge baseline saved',
  previewExported: 'Example backup exported · merge baselines are unavailable in preview mode.',
  previewUnavailable: 'Merge baselines are unavailable in preview mode. Open the main app to review a backup merge.',
  missingBaseline: 'Export a backup first to establish a shared merge baseline.'
};
const k_mergeConflictFields = { plan: '$plan', outlook: '$outlook', record: '$record' };
const k_filteredSpendingHint = 'Past and current totals use entries through today. Future months show registered entries. The list includes future-dated rows; open a movement for its breakdown.';
export function Transactions(){
 const {state,month,search,setSearch,filters,setFilters,searchFocus}=useApp(),c=useContext(Theme),searchRef=useRef(null);
 useEffect(()=>{if(searchFocus){const id=setTimeout(()=>searchRef.current?.focus(),60);return()=>clearTimeout(id)}},[searchFocus]);
 const {type='all',account='all',category='all'}=filters,tx=selectTransactions(state,month,{...filters,search});
 const active = type !== 'all' || account !== 'all' || category !== 'all';
 const filteredTransactionIds = new Set(tx.map(transaction => transaction.id));
 const net = reportingMonthStats(state, month).expenses
   .filter(expense => filteredTransactionIds.has(expense.id))
   .reduce((total, expense) => total + expense.net, 0);
 const change=(key,value)=>setFilters(f=>({...f,[key]:value}));
 return <View style={{gap:18}}><Card style={{padding:18}}>
  <Field inputRef={searchRef} label="Search transactions" value={search} onChangeText={setSearch} placeholder="Title, category, or note…"/>
  <Row style={{gap:10,flexWrap:'wrap',alignItems:'flex-start'}}><Select label="Type" value={type} onChange={v=>change('type',v)} options={[{value:'all',label:'All movements'},{value:'expense',label:'Expenses'},{value:'income',label:'Income'},{value:'reimbursement',label:'Paybacks'},{value:'transfer',label:'Transfers'}]} style={{flex:1,minWidth:110}}/>
   <Select label="Account" value={account} onChange={v=>change('account',v)} options={[{value:'all',label:'All accounts'},...state.accounts.map(a=>({value:a.id,label:a.name}))]} style={{flex:1,minWidth:110}}/>
   <Select label="Category" value={category} onChange={v=>change('category',v)} options={[{value:'all',label:'All categories'},...state.categories.map(a=>({value:a.id,label:a.parentId?'↳ '+a.name:a.name}))]} style={{width:'100%'}}/>
  </Row>{active&&<Button small kind="soft" icon="X" onPress={()=>setFilters({})}>Clear filters</Button>}
 </Card><Card style={{padding:18}}><Row style={{justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><H size={22}>Activity</H><T style={{fontSize:12,color:c.sub}}>{tx.length} movements</T></Row>
  {type==='expense'&&<View style={{backgroundColor:c.soft,padding:14,borderRadius:14,marginTop:14}}><T style={{fontSize:12,color:c.sub}}>Net spending · selected filters</T><H size={25}>{euro(net)}</H><T style={{fontSize:12,color:c.sub}}>{k_filteredSpendingHint}</T></View>}
  {tx.length?tx.map((t,i)=><TransactionRow key={t.id} tx={t} last={i===tx.length-1} accountId={account==='all'?null:account}/>):<Empty title="No matching movements" description="Change your filters or add a transaction for this month."/>}
 </Card></View>;
}
export function Accounts(){const {state,setModal,wide}=useApp(),c=useContext(Theme);return <View style={{gap:23}}><Card style={{backgroundColor:c.peach,borderColor:c.peach}}><T style={{fontSize:12,color:c.peachText}}>All your money, in one place</T><H size={40} style={{marginTop:8}}>{euro(state.accounts.reduce((s,a)=>s+accountBalance(state,a.id),0))}</H><T style={{fontSize:11,color:c.peachText,marginTop:10}}>Transfers move money between these accounts. They never become income or spending.</T></Card><Row style={{justifyContent:'space-between'}}><H size={22}>Your accounts</H><Button small icon="Plus" onPress={()=>setModal({type:'account'})}>Add account</Button></Row><Row style={{gap:16,flexWrap:'wrap',alignItems:'stretch'}}>{state.accounts.map(a=><View key={a.id} style={{width:wide?'48%':'100%'}}><AccountCard account={a}/></View>)}</Row><Card><Row style={{gap:12}}><TileIcon name="ShieldCheck" color="#91B6A9"/><View style={{flex:1}}><H size={18}>No bank connection needed</H><T style={{fontSize:12,color:c.sub,marginTop:5}}>You control every balance and transaction. Savings interest is recorded once per completed month using your effective annual rate.</T></View></Row></Card></View>}
export function Categories(){const {state,setModal,month,wide}=useApp(),c=useContext(Theme);const [search,setSearch]=useState('');const stats=reportingMonthStats(state,month);return <View style={{gap:20}}><Row style={{justifyContent:'space-between',gap:15}}><View style={{flex:1}}><T style={{fontSize:13,color:c.sub}}>Every category, your way.</T></View><Button small icon="Plus" onPress={()=>setModal({type:'category'})}>New category</Button></Row><Field placeholder="Find a category…" value={search} onChangeText={setSearch}/><Row style={{gap:16,flexWrap:'wrap',alignItems:'stretch'}}>{state.categories.filter(x=>!x.parentId&&(!search||[x.name,...state.categories.filter(s=>s.parentId===x.id).map(s=>s.name)].join(' ').toLowerCase().includes(search.toLowerCase()))).map(cat=>{const spent=stats.expenses.filter(t=>{const x=categorySettings(state.categories,t.category);return x.id===cat.id||x.parentId===cat.id}).reduce((s,t)=>s+t.net,0),subs=state.categories.filter(x=>x.parentId===cat.id);return <Card key={cat.id} style={{width:wide?'48%':'100%',padding:20,borderRadius:26,borderColor:cat.color+'40',backgroundColor:c.dark?cat.color+'19':cat.color+'0C'}}><Row style={{gap:12,marginBottom:16}}><TileIcon name={cat.icon} color={cat.color} size={50}/><View style={{flex:1}}><H size={19}>{cat.name}</H><Badge style={{marginTop:5}}>{cat.kind}</Badge></View><IB name="Pencil" label={`Edit ${cat.name}`} onPress={()=>setModal({type:'category',item:cat})}/></Row>{cat.budget>0&&<><Row style={{justifyContent:'space-between',marginBottom:8}}><T style={{fontSize:11,color:c.sub}}>{euro(spent)} spent</T><T style={{fontSize:11,color:spent>cat.budget?c.negative:c.muted}}>of {euro(cat.budget)}</T></Row><View style={{height:5,backgroundColor:c.soft,borderRadius:5,overflow:'hidden',marginBottom:13}}><View style={{height:5,width:`${Math.min(100,spent/cat.budget*100)}%`,backgroundColor:spent>cat.budget?c.negative:cat.color,borderRadius:5}}/></View></>}{subs.map(s=>{const resolved=categorySettings(state.categories,s.id);return <Pressable key={s.id} onPress={()=>setModal({type:'category',item:s})} style={{paddingVertical:9,borderTopWidth:1,borderColor:c.line}}><Row style={{gap:8}}><Icon name="CornerDownRight" size={12} color={c.muted}/><CategoryGlyph name={resolved.icon} size={20} color={resolved.color}/><T style={{fontSize:12,flex:1}}>{s.name}</T><T style={{fontSize:9.5,color:c.muted}}>{s.kind||'Inherits '+cat.kind}</T><Icon name="ChevronRight" size={12} color={c.muted}/></Row></Pressable>})}<Pressable accessibilityRole="button" onPress={()=>setModal({type:'category',item:{parentId:cat.id,kind:null,color:null,icon:null}})} style={{marginTop:subs.length?8:0}}><T style={{fontSize:11,color:c.sub}}>+ Add a subcategory</T></Pressable></Card>})}</Row></View>}
export function Reimbursements(){const {state,setModal,wide}=useApp(),c=useContext(Theme);const tx=state.transactions.filter(t=>t.type==='reimbursement').sort((a,b)=>b.date.localeCompare(a.date)),linked=tx.filter(t=>t.linkedId),total=linked.reduce((s,t)=>s+t.amount,0);return <View style={{gap:20}}><AwaitingPaybacks/><Card style={{backgroundColor:c.dark?'#2c382f':'#EDF4EB',borderColor:'transparent'}}><Row style={{justifyContent:'space-between',gap:15,flexWrap:'wrap'}}><View style={{flex:1,minWidth:200}}><Badge color={c.positive}>A CLEARER PICTURE</Badge><H size={29} style={{marginTop:15}}>What came back belongs{'\n'}with what went out.</H><T style={{fontSize:12,color:c.sub,marginTop:12,maxWidth:480}}>A payback changes your account today, and offsets the original expense in its own month. Your salary stays your salary.</T></View><View style={{padding:20,alignItems:'center'}}><Icon name="Link2" size={27} color={c.positive}/><H size={35} style={{marginTop:13,color:c.positive}}>{euro(total)}</H><T style={{fontSize:11,color:c.sub,marginTop:5}}>linked reimbursements · all time</T></View></Row></Card><Row style={{justifyContent:'space-between'}}><H size={22}>Every payback, traced</H><Button small icon="Plus" onPress={()=>setModal({type:'transaction',initialType:'reimbursement'})}>Add payback</Button></Row>{!tx.length&&<Card><Empty title="All clear" description="Add a reimbursement and link it to its original expense."/></Card>}{tx.map(t=>{const original=state.transactions.find(x=>x.id===t.linkedId);return <Card key={t.id} style={{padding:20}}><Row style={{gap:15,flexWrap:'wrap'}}><View style={{flex:1,minWidth:180}}><Badge>{original?'ORIGINAL EXPENSE':'BALANCE ADJUSTMENT'}</Badge>{original?<><H size={19} style={{marginTop:12}}>{original.title}</H><T style={{fontSize:11,color:c.muted,marginTop:5}}>{original.date} · {euro(original.amount)}</T></>:<T style={{marginTop:12,fontSize:12,color:c.sub}}>No linked expense. Excluded from earnings.</T>}</View><Icon name="MoveRight" size={25} color={c.muted}/><View style={{flex:1,minWidth:180}}><Badge color={c.positive}>PAYBACK RECEIVED</Badge><H size={19} style={{marginTop:12}}>{t.title}</H><T style={{fontSize:11,color:c.muted,marginTop:5}}>{t.date} · <T style={{fontSize:11,color:c.positive}}>+{euro(t.amount)}</T></T></View><IB name="Pencil" label={`Edit ${t.title}`} onPress={()=>setModal({type:'transaction',item:t})}/></Row>{original&&<View style={{borderTopWidth:1,borderColor:c.line,marginTop:18,paddingTop:13}}><Row style={{justifyContent:'space-between'}}><T style={{fontSize:11,color:c.sub}}>Net expense in {expenseReportingMonth(original)}</T><T style={{fontSize:12,fontWeight:'600'}}>{euro(netExpenses(state.transactions,expenseReportingMonth(original)).find(x=>x.id===original.id)?.net||0)}</T></Row></View>}</Card>})}</View>}
export {default as YearPlan} from './PlanScreen.jsx';
export function Loans(){const {state,setModal}=useApp(),c=useContext(Theme);return <View style={{gap:20}}><Row style={{justifyContent:'space-between',gap:12}}><View style={{flex:1}}><H size={24}>Steady steps, month by month.</H><T style={{fontSize:12,color:c.sub,marginTop:8}}>Track an existing loan without changing any account balance.</T></View><Button small icon="Plus" onPress={()=>setModal({type:'loan'})}>Add loan</Button></Row>{state.loans.length?state.loans.map(l=>{const paid=state.transactions.filter(t=>t.type==='expense'&&t.category==='loan'&&(t.loanId===l.id||!t.loanId&&t.title===l.name)&&t.account===l.account&&t.date.slice(0,7)>=l.start&&t.date.slice(0,7)<=l.end).reduce((s,t)=>s+t.amount,0);return <Card key={l.id}><Row style={{gap:15}}><TileIcon name="Landmark" color="#C3A58D" size={49}/><View style={{flex:1}}><H size={23}>{l.name}</H><T style={{fontSize:11,color:c.muted,marginTop:4}}>{l.start} → {l.end} · {state.accounts.find(a=>a.id===l.account)?.name}</T></View><IB name="Pencil" label={`Edit ${l.name}`} onPress={()=>setModal({type:'loan',item:l})}/></Row><Row style={{gap:30,marginTop:26,flexWrap:'wrap'}}><View><T style={{fontSize:11,color:c.sub}}>Recorded remaining balance</T><H size={28} style={{marginTop:5}}>{euro(l.remaining)}</H></View><View><T style={{fontSize:11,color:c.sub}}>Monthly repayment</T><H size={28} style={{marginTop:5}}>{euro(l.payment)}</H></View><View><T style={{fontSize:11,color:c.sub}}>Payments recorded in Havensum</T><H size={28} style={{marginTop:5}}>{euro(paid)}</H></View></Row><Divider/><T style={{fontSize:11,color:c.sub}}>Repayments count as expenses when recorded. Your recorded remaining balance is manual; interest and principal allocations are not guessed.</T><Row style={{marginTop:17,justifyContent:'flex-end'}}><Button small kind="soft" icon="Plus" onPress={()=>setModal({type:'transaction',item:null,initialType:'expense',loan:l})}>Record payment</Button></Row></Card>}):<Card><Empty title="Room to start" description="Add a loan to forecast monthly repayments. Proceeds are optional."/></Card>}<Card><Row style={{gap:12}}><Icon name="Info" color={c.sub} size={20}/><T style={{flex:1,fontSize:12,color:c.sub}}>Adding a loan suggests a remaining-year plan revision. The frozen plan changes only when you approve a new snapshot.</T></Row></Card></View>}
function mergeConflictTitle(conflict) {
  if (conflict.field === '$trackedExpense') {
    const expense = conflict.local.expense ?? conflict.remote.expense ?? conflict.base.expense;
    return `Expense and payback task · ${expense?.title ?? conflict.id}`;
  }
  if (conflict.field === '$paybackTask') {
    return `Payback task · ${conflict.id}`;
  }
  return `${conflict.collection} · ${conflict.id} · ${conflict.field === '$record' ? 'Edit vs. delete' : conflict.field}`;
}

function mergeConflictLines(conflict, side) {
  const value = conflict[side];
  if (conflict.field === '$trackedExpense') {
    if (!value.expense) {
      return ['Expense and payback task removed'];
    }
    return [
      `${value.expense.title} · ${euro(value.expense.amount)}`,
      value.task ? `Expected payback ${euro(value.task.expectedAmount)}` : 'No payback task'
    ];
  }
  return [value === undefined ? 'Deleted' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)];
}

export function Settings(){
 const isPreview = isDemoSession();
 const {state,setState,month,notify}=useApp(),c=useContext(Theme),[busy,setBusy]=useState(false),[importData,setImportData]=useState(null),[merge,setMerge]=useState(null),[clear,setClear]=useState(false),[error,setError]=useState('');
 async function excel(){setBusy(true);try{await exportExcel(state,month);notify('Excel exported · summary and re-importable raw data');}catch(e){notify(e.message);}finally{setBusy(false)}}
 async function selectImport() {
  try {
   const file = await chooseFile();
   if (!file) {
    return;
   }
   const data = await readImport(file);
   if (data.backup?.paybackTasks?.length) {
    throw Error('This backup includes payback tasks. Use Review backup merge to preserve their history.');
   }
   if (!data.rows.length) {
    throw Error('This file contains no transaction rows.');
   }
   setImportData({ ...data, name: file.name });
  } catch (failure) {
   notify(failure.message);
  }
 }
 async function exportBackup() {
   try {
     await downloadJSON(state);
     if (isPreview) {
       notify(k_backupMessages.previewExported);
       return;
     }
     await writeSnapshot(state);
     notify(k_backupMessages.saved);
   } catch (error) {
     notify(error.message);
   }
 }
 async function downloadInvalidBaseline() {
   try {
     const encodedBaseline = await readInvalidSnapshotCopy();
     if (encodedBaseline === null) {
       notify('No invalid baseline copy is saved on this device.');
       return;
     }
     await downloadSavedLedgerCopy(encodedBaseline, 'Havensum-invalid-baseline-recovery.txt');
   } catch (error) {
     notify(error.message);
   }
 }
 async function mergeFile() {
   if (isPreview) {
     notify(k_backupMessages.previewUnavailable);
     return;
   }
   try {
     const file = await chooseFile('.json');
     if (!file) {
       return;
     }
     const backup = JSON.parse(await file.text());
     const { state: previewableBackup } = clearMissingTransactionCategories(backup);
     const validatedBackup = migrateState(previewableBackup);
     // Keep source references until the merged categories and choices are known.
     const remoteState = { ...validatedBackup, transactions: backup.transactions };
     const baseline = await readSnapshot();
     if (!baseline) {
       throw Error(k_backupMessages.missingBaseline);
     }
     const mergedState = mergeThreeWay(baseline, state, remoteState);
     setMerge({ ...mergedState, choices: {}, categoryEdits: {} });
   } catch (error) {
     notify(error.message);
   }
 }
 function getReviewedMerge() {
   let result = JSON.parse(JSON.stringify(merge.result));
   for (const conflict of merge.conflicts) {
     const key = `${conflict.collection}|${conflict.id}|${conflict.field}`;
     const selectedSide = merge.choices[key];
     if (!selectedSide) {
       continue;
     }
     const selectedValue = conflict[selectedSide];
     if (conflict.field === '$trackedExpense') {
       result = takeReviewedTrackedExpense(result, conflict.id, selectedValue);
       continue;
     }
     if (conflict.field === '$paybackTask') {
       result = takeReviewedPaybackTask(result, conflict.id, selectedValue);
       continue;
     }
     if (conflict.field === k_mergeConflictFields.plan || conflict.field === k_mergeConflictFields.outlook) {
       result[conflict.collection] = selectedValue;
       continue;
     }
     if (conflict.field === k_mergeConflictFields.record) {
       result[conflict.collection] = result[conflict.collection].filter(record => record.id !== conflict.id);
       if (selectedValue) {
         result[conflict.collection].push(selectedValue);
       }
       continue;
     }
     const record = result[conflict.collection].find(record => record.id === conflict.id);
     if (record) {
       record[conflict.field] = selectedValue;
     }
   }
   const normalized = clearMissingTransactionCategories(result);
   const rows = categoryReviewRows(normalized.state, normalized.missingCategories);
   return { state: normalized.state, rows };
 }
 const reviewedMerge = merge ? getReviewedMerge() : null;

 function editMissingCategory(key, change) {
   setMerge(previous => ({
     ...previous,
     categoryEdits: { ...previous.categoryEdits, [key]: { ...previous.categoryEdits[key], ...change } }
   }));
 }

 async function applyMerge() {
   try {
     const result = validateState(applyCategoryReviewEdits(reviewedMerge.state, reviewedMerge.rows, merge.categoryEdits));
     setState(result);
     await writeSnapshot(result);
     setMerge(null);
     notify('Reviewed changes merged');
   } catch (error) {
     notify(error.message);
   }
 }
 return <View style={{gap:22}}><Card><H size={22}>A little more you</H><Toggle value={state.theme==='dark'} onChange={v=>setState(s=>({...s,theme:v?'dark':'light'}))} label="Dark theme" description="A softer glow when the day winds down."/><Divider/><Row style={{justifyContent:'space-between',gap:12}}><View style={{flex:1}}><T style={{fontSize:13}}>Currency</T><T style={{fontSize:11,color:c.muted,marginTop:3}}>All balances, amounts, and exports use euros.</T></View><Badge>EUR · €</Badge></Row></Card>
 <DataTools onImport={selectImport} onBackup={exportBackup} onExcel={excel} busy={busy}/>
 <Card><Row style={{gap:12,marginBottom:18}}><TileIcon name="UsersRound" color="#91B6A9"/><View><H size={22}>A shared rhythm</H><T style={{fontSize:11,color:c.sub,marginTop:4}}>For you and Marina, without the guesswork.</T></View></Row><Row style={{justifyContent:'space-between'}}><T style={{fontSize:13}}>Google Drive</T><Badge>Not connected</Badge></Row><T style={{fontSize:12,color:c.sub,marginTop:12}}>Automatic Drive sync needs Google OAuth configuration. Until then, exchange full JSON backups manually using a common exported baseline.</T><Row style={{gap:10,marginTop:17,flexWrap:'wrap'}}><Button small kind="outline" icon="GitMerge" disabled={isPreview} onPress={mergeFile}>Review backup merge</Button><Button small kind="soft" icon="Download" onPress={exportBackup}>{isPreview ? 'Export example backup' : 'Export shared baseline'}</Button><Button small kind="soft" disabled={isPreview} onPress={downloadInvalidBaseline}>Download invalid baseline copy</Button></Row>{isPreview&&<T style={{fontSize:11,color:c.muted,marginTop:15}}>{k_backupMessages.previewUnavailable}</T>}<T style={{fontSize:11,color:c.muted,marginTop:15}}>Different-field edits merge silently. Same-field edits and edit-versus-delete always require your choice. A saved local baseline is used for the three-way comparison.</T><Divider/><Row style={{gap:10}}><Icon name="Eye" size={16} color={c.sub}/><T style={{flex:1,fontSize:11,color:c.sub}}>Both people's accounts are included in an exchanged backup. Account tags are labels, not privacy controls.</T></Row></Card>
 <Card><Row style={{gap:12}}><TileIcon name="ChartNoAxesCombined" color="#B3A0CA"/><View style={{flex:1}}><H size={20}>Investment prices</H><T style={{fontSize:11,color:c.sub,marginTop:6}}>Twelve Data is not connected. Your investments use manual balances. ETF coverage, end-of-day access, and licensing still need verification.</T></View><Badge>Manual</Badge></Row></Card>
 {state.demo&&<Card style={{borderColor:c.dark?'#5b4637':'#f0d6c1'}}><H size={20}>A fresh start</H><T style={{fontSize:12,color:c.sub,marginTop:8,marginBottom:16}}>You are exploring example data. Clear it to begin with your own accounts and transactions. Export a backup first if you want to keep any changes.</T>{clear?<Row style={{gap:10,flexWrap:'wrap'}}><Button small kind="outline" onPress={()=>setClear(false)}>Keep my data</Button><Button small onPress={()=>{setState(s=>({...s,demo:false,accounts:[],transactions:[],loans:[],events:[],plan:null,outlook:{},paybackTasks:undefined,paybackTasksVersion:undefined,migrationCategoryWarnings:undefined}));setClear(false);notify('Example data cleared');}}>Clear example data permanently</Button></Row>:<Button small kind="outline" onPress={()=>setClear(true)} icon="Eraser">Clear example data</Button>}</Card>}
 <T style={{fontSize:11,color:c.muted,textAlign:'center'}}>Havensum 0.1 · Android-first React Native · Browser preview</T>
 {importData&&<ImportDialog data={importData} onClose={()=>setImportData(null)}/>}
 {merge&&<Dialog title="Two sides. Your choice." subtitle={`${merge.conflicts.length} conflicts need review. Nothing is applied until you finish.`} onClose={()=>setMerge(null)} width={650}>
 {!merge.conflicts.length&&<View style={{gap:13,paddingBottom:25}}><H size={21}>These changes fit together.</H><T style={{fontSize:12,color:c.sub}}>No conflicting fields were found. Review the merged record counts before applying.</T>{['transactions','accounts','categories','loans'].map(k=><Row key={k} style={{justifyContent:'space-between'}}><T style={{fontSize:12}}>{k}</T><T style={{fontSize:12}}>{merge.result[k].length}</T></Row>)}</View>}
 <MissingCategoryReview rows={reviewedMerge.rows} categories={reviewedMerge.state.categories} edits={merge.categoryEdits} onChange={editMissingCategory}/>
 {merge.conflicts.map(cf=>{const key=cf.collection+'|'+cf.id+'|'+cf.field;return <View key={key} style={{padding:14,borderWidth:1,borderColor:c.line,borderRadius:12,marginBottom:15}}><T style={{fontSize:12,fontWeight:'600',marginBottom:12}}>{mergeConflictTitle(cf)}</T><Row style={{gap:10,alignItems:'stretch'}}>{['local','remote'].map(side=><Pressable key={side} onPress={()=>setMerge(m=>({...m,choices:{...m.choices,[key]:side}}))} style={{flex:1,padding:12,borderRadius:9,borderWidth:1,borderColor:merge.choices[key]===side?c.accent:c.line,backgroundColor:merge.choices[key]===side?c.peach:c.soft}}><T style={{fontSize:10,color:c.sub,marginBottom:6}}>{side==='local'?'THIS DEVICE':'BACKUP FILE'}</T>{mergeConflictLines(cf,side).map(line=><T key={line} style={{fontSize:11}}>{line}</T>)}</Pressable>)}</Row></View>})}<Button icon="Check" disabled={merge.conflicts.some(cf=>!merge.choices[cf.collection+'|'+cf.id+'|'+cf.field])} onPress={applyMerge}>Apply reviewed merge</Button>
 </Dialog>}
 </View>;
}
