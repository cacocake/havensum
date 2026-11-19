import { saveTransaction, deleteTransaction } from './transactionActions.js';
import { useDirtyForm } from './useDirtyForm.js';
import React,{useState,useContext,useRef,useMemo} from 'react';
import {View,Pressable,ScrollView,TextInput} from 'react-native';
import {useApp} from './context.js';
import {Theme,T,H,Row,Button,IB,Badge,TileIcon,Field,Select,DateField,Toggle,Dialog,Divider} from './ui.jsx';
import CategoryGlyph from './CategoryGlyph.jsx';
import CategorySelect from './CategorySelect.jsx';
import {Squish} from './Playful.jsx';
import Icon,{iconNames} from './Icon';
import {categorySettings,cents,euro,buildPlan} from './engine.js';
import { k_defaultFixedTolerance, k_defaultPlanCushion, k_defaultPlanIncome, k_defaultVariableDrift } from './planning.js';
import { carriedPlanAssumptions } from './planCarryForward.js';
import PlanDraftPreview, { CarriedAssumptionNotes, CarriedChanges, EarlierOverride } from './PlanDraftPreview.jsx';
import {palette} from './seed.js';
import { isPositiveCentAmount, k_centsPerEuro } from './money.js';
import { k_transactionTypes, k_systemCategoryIds, k_entityIdPrefixes, k_spendingBehaviors, k_defaultHistoryWindow } from './domainConstants.js';
import { createEntityId } from './identifiers';
import { isPlannedCostLink, plannedCostOptions } from './plannedCosts.js';
import { approvePlanRevision, k_planRevisionStartKinds, planRevisionStart } from './planArchive.js';
import { localCalendarDate, yearOfMonth } from './calendar.js';
import { planDraftEstimates } from './planDraftEstimates.js';
import PlanDraftEvidence, { PlanBillList } from './PlanDraftEvidence.jsx';
import { DraftPlannedCosts, NewPlannedCostSuggestion } from './PlannedCostSuggestion.jsx';

const k_percentageScale = 100;
const k_draftEventId = 'event-draft';
const k_invalidPlanAmountsMessage = 'Use valid non-negative amounts.';
const k_planStartMovedMessage = 'The calendar has moved on, so this revision now starts later. The preview is refreshed. Review it and approve again.';
const k_planYearReadOnlyMessage = 'is now a past year, so its plans are read-only. Nothing was saved.';
const k_transactionAmountPattern = /^\d+([.,]\d{1,2})?$/;
const k_transactionFormMessages = {
  invalidAmount: 'Use a positive amount with at most two decimal places.',
  updated: 'Transaction updated',
  added: 'Transaction added'
};
const k_categoryFormMessages = {
  missingName: 'Give the category a name.',
  invalidBudget: 'Use a positive budget or leave it empty.',
  saved: 'Category saved'
};
const k_loanMonthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const k_loanFormMessages = {
  invalid: 'Enter a name, positive amounts and a valid month range (YYYY-MM).',
  saved: 'Loan saved · revise the remaining Year Plan to include it',
  proceedsNote: 'Loan balance adjustment; excluded from income.'
};
export function TransactionForm({item,initialType='expense',draft,onClose}){
 const {state,setState,notify}=useApp(),c=useContext(Theme);
 const [type,setType]=useState(item?.type||initialType),[title,setTitle]=useState(item?.title||draft?.title||''),[amount,setAmount]=useState(item?String(item.amount/k_centsPerEuro):draft?String(draft.amount/k_centsPerEuro):''),[account,setAccount]=useState(item?.account??draft?.account??state.accounts[0]?.id??''),[category,setCategory]=useState(item?.category??draft?.category??(initialType==='income'?'salary':'groceries')),[date,setDate]=useState(item?.date||draft?.date||new Date().toISOString().slice(0,10)),[note,setNote]=useState(item?.note||''),[kind,setKind]=useState(item?.kind||''),[linkedId,setLinkedId]=useState(item?.linkedId??draft?.linkedId??''),[link,setLink]=useState(item?item.linkedId!=null&&item.linkedId!=='':true),[toAccount,setToAccount]=useState(item?.toAccount||state.accounts[1]?.id||''),[error,setError]=useState(''),[deleting,setDeleting]=useState(false),[details,setDetails]=useState(!!item?.note||!!item?.kind);
 const task = state.paybackTasks?.find(record => item && record.expenseId === item.id);
 const [expectPayback, setExpectPayback] = useState(Boolean(task && !task.manuallyClosed));
 const [expectedAmount, setExpectedAmount] = useState(task ? String(task.expectedAmount / k_centsPerEuro) : '');
 const [person, setPerson] = useState(task?.person ?? '');
 const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
 const [taskNote, setTaskNote] = useState(task?.note ?? '');
 const [confirmingClose, setConfirmingClose] = useState(false);
 const paybackDraft = draft?.linkedId != null;
 const cats=state.categories.filter(x=>!['salary','interest'].includes(x.id));
 const expenses=state.transactions.filter(t=>t.type==='expense').sort((a,b)=>b.date.localeCompare(a.date));
 const savedPlannedCost = isPlannedCostLink(item?.plannedCost) ? item.plannedCost : undefined;
 const [plannedCostChoice, setPlannedCostChoice] = useState(savedPlannedCost ? JSON.stringify(savedPlannedCost) : '');
 const activePlannedCost = plannedCostChoice ? JSON.parse(plannedCostChoice) : undefined;
 const costOptions = plannedCostOptions(state.events ?? [], date, activePlannedCost);
 const canLinkPlannedCost = type === k_transactionTypes.expense && category !== k_systemCategoryIds.loan
   && categorySettings(state.categories, category).parentId !== k_systemCategoryIds.loan;
 function save(confirmClose = false) {
   try {
     if (!k_transactionAmountPattern.test(amount)) {
       throw Error(k_transactionFormMessages.invalidAmount);
     }
     const isTransfer = type === k_transactionTypes.transfer;
     const transaction = {
       ...item,
       id: item?.id ?? createEntityId(k_entityIdPrefixes.transaction),
       linkedId: undefined,
       toAccount: undefined,
       counterpartSourceFingerprint: undefined,
       type, title: title.trim(), amount: cents(amount), account, date, note,
       category: isTransfer ? null : category,
       loanId: category === k_systemCategoryIds.loan ? (item?.loanId ?? draft?.loanId) : undefined,
       kind: kind || undefined
     };
     if (isTransfer) {
       transaction.toAccount = toAccount;
       if (item?.toAccount === toAccount) {
         transaction.counterpartSourceFingerprint = item?.counterpartSourceFingerprint;
       }
     }
     if (type === k_transactionTypes.reimbursement && link && linkedId !== '') {
       transaction.linkedId = linkedId;
     }
     transaction.plannedCost = canLinkPlannedCost ? activePlannedCost : undefined;
     const trackingExpense = type === k_transactionTypes.expense;
     if (trackingExpense && task && !task.manuallyClosed && !expectPayback && !confirmClose) {
       setConfirmingClose(true);
       return;
     }
     if (trackingExpense && expectedAmount && !k_transactionAmountPattern.test(expectedAmount)) {
       throw Error('Use a positive expected amount with at most two decimal places.');
     }
     const result = saveTransaction(state, transaction, {
       expectPayback: trackingExpense ? expectPayback : undefined,
       expectedAmount: expectedAmount ? cents(expectedAmount) : undefined,
       taskId: trackingExpense && expectPayback && !task ? createEntityId('payback') : undefined,
       person: person.trim(), dueDate: dueDate.trim(), note: taskNote.trim(),
       confirmClose, at: new Date().toISOString()
     });
     setState(result);
     notify(item ? k_transactionFormMessages.updated : k_transactionFormMessages.added);
     onClose();
   } catch (error) {
     setError(error.message);
   }
 }
 function remove() {
   try {
     setState(deleteTransaction(state, item.id, { confirmRemoveTask: Boolean(task) }));
     notify('Transaction deleted');
     onClose();
   } catch (failure) {
     setError(failure.message);
   }
 }
 const footer = <View>
   {error && <T accessibilityRole="alert" style={{color:c.negative,marginBottom:12}}>{error}</T>}
   {deleting && <>
     <T>{task ? 'Delete this expense, its payback task and closure history permanently?' : 'Delete this transaction permanently?'}</T>
     <Row style={{gap:10,flexWrap:'wrap'}}>
       <Button kind="outline" onPress={() => setDeleting(false)}>Keep it</Button>
       <Button onPress={remove}>Delete transaction</Button>
     </Row>
   </>}
   {confirmingClose && !deleting && <>
     <T>Close without recording a payback? The closure will stay in your history.</T>
     <Row style={{gap:10,flexWrap:'wrap'}}>
       <Button kind="outline" onPress={() => { setExpectPayback(true); setConfirmingClose(false); }}>Keep tracking</Button>
       <Button onPress={() => save(true)}>Close and save</Button>
     </Row>
   </>}
   {!deleting && !confirmingClose && <Row style={{justifyContent:'space-between',gap:12}}>
     {item ? <IB name="Trash2" label="Delete transaction" onPress={() => setDeleting(true)}/> : <T style={{color:c.muted,fontSize:11}}>EUR only</T>}
     <Button onPress={() => save()} icon="Check">{item ? 'Save changes' : 'Add transaction'}</Button>
   </Row>}
 </View>;
 const isDirty = useDirtyForm([type,title,amount,account,category,date,note,kind,linkedId,link,toAccount,expectPayback,expectedAmount,person,dueDate,taskNote,plannedCostChoice]);
 return <Dialog dirty={isDirty} title={item?'Edit transaction':'Add a transaction'} subtitle="A few seconds, and back to your day." onClose={onClose} footer={footer}>
 <Row style={{gap:5,padding:4,backgroundColor:c.soft,borderRadius:12,marginBottom:23}}>{(paybackDraft || task ? [type] : ['expense','income','reimbursement','transfer']).map(t=><Pressable key={t} onPress={()=>{setType(t);if(t==='income')setCategory('salary');else if(category==='salary'||category==='interest')setCategory('groceries');}} accessibilityRole="button" accessibilityState={{selected:type===t}} style={{flex:1,minHeight:48,justifyContent:'center',paddingVertical:10,borderRadius:9,backgroundColor:type===t?c.card:'transparent',alignItems:'center'}}><T style={{fontSize:10.5,fontWeight:'600',color:type===t?c.accentText:c.sub}}>{t==='reimbursement'?'Payback':t[0].toUpperCase()+t.slice(1)}</T></Pressable>)}</Row>
 <View style={{backgroundColor:c.soft,borderRadius:21,padding:16,marginBottom:20}}><T style={{fontSize:12,color:c.sub,marginBottom:5}}>How much?</T><Row style={{gap:8}}><H size={32} style={{color:c.accent}}>€</H><TextInput accessibilityLabel="Amount · EUR" value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={c.muted} keyboardType="decimal-pad" autoFocus={!item} style={{flex:1,minWidth:0,fontFamily:'Fredoka',fontSize:37,lineHeight:49,color:c.text,padding:0}}/></Row></View>
 <Field label="Title" value={title} onChangeText={setTitle} placeholder={type==='reimbursement'?'Who paid you back?':'What was it for?'}/>
 <Row style={{gap:14,alignItems:'flex-start'}}><Select label="Account" value={account} onChange={setAccount} options={state.accounts.map(a=>({value:a.id,label:a.name}))} style={{flex:1}}/><View style={{flex:1}}><DateField value={date} onChange={setDate}/></View></Row>
 {type==='transfer'?<><Select label="To account" value={toAccount} onChange={setToAccount} options={state.accounts.filter(a=>a.id!==account).map(a=>({value:a.id,label:a.name}))}/><Badge color={c.positive}>Transfers stay out of income, spending, and averages.</Badge></>:<>
 <CategorySelect label="Category" value={category} onChange={setCategory} categories={type==='income'?state.categories:cats}/>
 {canLinkPlannedCost && costOptions.length > 0 && (
   <Select label="Link to a planned cost" value={plannedCostChoice} onChange={setPlannedCostChoice}
     options={[{ value: '', label: 'No planned cost' }, ...costOptions]} />
 )}

 </>}
 {type === 'expense' && <View style={{marginBottom:14}}>
   <Toggle value={expectPayback} onChange={setExpectPayback} label="Expect a payback" description="Add this expense to your follow-up list."/>
   {(expectPayback || task) && <>
     <Field label="Expected payback · EUR" value={expectedAmount} onChangeText={setExpectedAmount} placeholder={amount || 'Full expense amount'} keyboardType="decimal-pad"/>
     <Field label="Person · optional" value={person} onChangeText={setPerson}/>
     <Field label="Due date · YYYY-MM-DD · optional" value={dueDate} onChangeText={setDueDate}/>
     <Field label="Payback note · optional" value={taskNote} onChangeText={setTaskNote} multiline/>
   </>}
 </View>}
 {paybackDraft && <T style={{color:c.sub,marginBottom:12}}>Linked expense · {expenses.find(expense => expense.id === linkedId)?.title}</T>}
 {type==='reimbursement'&&!paybackDraft&&<View style={{padding:15,borderRadius:12,backgroundColor:c.soft,marginBottom:16}}><Toggle value={link} onChange={setLink} label="Link to an expense" description="Reduces spending in the original month. Never counted as income."/>{link?<Select label="Original expense (optional)" value={linkedId} onChange={id=>{const original=expenses.find(e=>String(e.id)===String(id));setLinkedId(original?.id ?? '');if(original)setCategory(original.category)}} options={[{value:'',label:'Choose an expense, or link it later'},...expenses.map(t=>({value:t.id,label:`${t.title} · ${euro(t.amount)} · ${t.date}`}))]}/>:<T style={{fontSize:11,color:c.sub}}>This will adjust your account balance without changing income or spending.</T>}</View>}
 <Squish accessibilityLabel="Toggle extra transaction details" aria-expanded={details} accessibilityState={{expanded:details}} onPress={()=>setDetails(v=>!v)} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:48,paddingVertical:10,marginBottom:details?10:0}}><Row style={{gap:7}}><Icon name="Pencil" size={14} color={c.sub}/><T style={{fontSize:12,color:c.sub}}>{details?'A few extra details':'Add a note or change behaviour'}</T></Row><Icon name={details?'X':'Plus'} size={16} color={c.sub}/></Squish>{details&&<>{type!=='transfer'&&<Select label="Spending behaviour" value={kind} onChange={setKind} options={[{value:'',label:`Use category default · ${categorySettings(state.categories,category).kind}`},'Fixed','Variable','Occasional']}/>}<Field label="Note · optional" value={note} onChangeText={setNote} placeholder="Anything worth remembering" multiline/></>}

 </Dialog>;
}
export function CategoryForm({item,onClose}){
 const {state,setState,notify}=useApp(),c=useContext(Theme);const [name,setName]=useState(item?.name||''),[icon,setIcon]=useState(item?.icon||'Shapes'),[color,setColor]=useState(item?.color||palette[0]),[kind,setKind]=useState(item?.kind||'Variable'),[budget,setBudget]=useState(item?.budget?String(item.budget/k_centsPerEuro):''),[parentId,setParent]=useState(item?.parentId||''),[inherit,setInherit]=useState({icon:item?.parentId&&!item?.icon,color:item?.parentId&&!item?.color,kind:item?.parentId&&!item?.kind,budget:item?.parentId&&item?.budget==null}),[search,setSearch]=useState(''),[error,setError]=useState('');
 const changeParent=id=>{setParent(id);if(id&&!parentId)setInherit({icon:true,color:true,kind:true,budget:true});};
 function save() {
   if (!name.trim()) {
     setError(k_categoryFormMessages.missingName);
     return;
   }
   if (budget && (!Number.isFinite(Number(budget)) || Number(budget) < 0)) {
     setError(k_categoryFormMessages.invalidBudget);
     return;
   }
   const category = {
     id: item?.id || createEntityId(k_entityIdPrefixes.category),
     name: name.trim(), parentId: parentId || null,
     icon: parentId && inherit.icon ? null : icon,
     color: parentId && inherit.color ? null : color,
     kind: parentId && inherit.kind ? null : kind,
     budget: parentId && inherit.budget ? null : (budget ? cents(budget) : 0)
   };
   setState(currentState => ({
     ...currentState,
     categories: item?.id
       ? currentState.categories.map(record => record.id === item.id ? category : record)
       : [...currentState.categories, category]
   }));
   notify(k_categoryFormMessages.saved);
   onClose();
 }
 const toggle=field=><Toggle value={!!inherit[field]} onChange={v=>setInherit(x=>({...x,[field]:v}))} label={`Inherit ${field==='kind'?'behaviour':field} from parent`}/>;
 const isDirty = useDirtyForm([name,icon,color,kind,budget,parentId,inherit]);
 return <Dialog dirty={isDirty} title={item?.id?'Make it yours':'A new category'} subtitle="A little personality for every part of your spending." onClose={onClose}>
 <Field label="Category name" value={name} onChangeText={setName} placeholder="e.g. Weekend adventures"/>
 <Select label="Parent category" value={parentId} onChange={changeParent} options={[{value:'',label:'None · top-level category'},...state.categories.filter(x=>!x.parentId&&x.id!==item?.id&&!(item?.id&&state.categories.some(ch=>ch.parentId===item.id))).map(x=>({value:x.id,label:x.name}))]}/>
 {parentId&&toggle('icon')}{(!parentId||!inherit.icon)&&<><Field label="Find an icon" placeholder="Search coffee, travel, home…" value={search} onChangeText={setSearch}/><ScrollView style={{maxHeight:180,marginBottom:17}} nestedScrollEnabled><Row style={{flexWrap:'wrap',gap:6}}>{iconNames.filter(n=>n.toLowerCase().includes(search.toLowerCase())).map(n=><Pressable accessibilityRole="button" accessibilityLabel={n} key={n} onPress={()=>setIcon(n)} style={{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center',padding:10,backgroundColor:icon===n?`${color}33`:c.soft,borderRadius:9,borderWidth:1,borderColor:icon===n?color:'transparent'}}><CategoryGlyph name={n} color={icon===n?color:c.sub} size={27}/></Pressable>)}</Row></ScrollView></>}
 {parentId&&toggle('color')}{(!parentId||!inherit.color)&&<><T style={{fontSize:12,color:c.sub,marginBottom:10}}>Colour</T><Row style={{gap:9,flexWrap:'wrap',marginBottom:18}}>{palette.map(p=><Pressable accessibilityLabel={`Colour ${p}`} key={p} onPress={()=>setColor(p)} style={{width:48,height:48,borderRadius:25,borderWidth:9,borderColor:c.card,backgroundColor:p,alignItems:'center',justifyContent:'center'}}>{color===p&&<Icon name="Check" size={17} color="#fff"/>}</Pressable>)}</Row></>}
 {parentId&&toggle('kind')}{(!parentId||!inherit.kind)&&<Select label="Default behaviour" value={kind} onChange={setKind} options={['Fixed','Variable','Occasional']}/>}
 {parentId&&toggle('budget')}{(!parentId||!inherit.budget)&&<Field label="Monthly budget · optional, display only" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="No limit"/>}
 <T style={{fontSize:11,color:c.muted,marginBottom:15}}>Budgets power progress bars. They never change your frozen Year Plan.</T>{error&&<T style={{color:c.negative,marginBottom:10}}>{error}</T>}<Button onPress={save} icon="Check">Save category</Button>
 </Dialog>;
}
export function LoanForm({item,onClose}){
 const {setState,state,notify}=useApp(),c=useContext(Theme);const [name,setName]=useState(item?.name||''),[remaining,setRemaining]=useState(item?String(item.remaining/k_centsPerEuro):''),[payment,setPayment]=useState(item?String(item.payment/k_centsPerEuro):''),[account,setAccount]=useState(item?.account||state.accounts[0]?.id||''),[start,setStart]=useState(item?.start||new Date().toISOString().slice(0,7)),[end,setEnd]=useState(item?.end||`${new Date().getFullYear()+3}-${new Date().toISOString().slice(5,7)}`),[credit,setCredit]=useState(false),[error,setError]=useState('');
 function save() {
   const remainingInCents = cents(remaining);
   const paymentInCents = cents(payment);
   const validAmounts = isPositiveCentAmount(remainingInCents) && isPositiveCentAmount(paymentInCents);
   const validMonths = k_loanMonthPattern.test(start) && k_loanMonthPattern.test(end) && end >= start;
   if (!name.trim() || !validAmounts || !validMonths) {
     setError(k_loanFormMessages.invalid);
     return;
   }

   const loanId = item?.id || createEntityId(k_entityIdPrefixes.loan);
   const loanFields = { name, remaining: remainingInCents, payment: paymentInCents, start, end, account };
   setState(currentState => {
     const loans = item
       ? currentState.loans.map(loan => loan.id === loanId ? { ...loan, ...loanFields } : loan)
       : [...currentState.loans, { id: loanId, original: remainingInCents, ...loanFields }];
     const transactions = [...currentState.transactions];
     if (credit) {
       transactions.push({
         id: `${loanId}-proceeds`, type: k_transactionTypes.reimbursement,
         title: `${name} · loan proceeds`, note: k_loanFormMessages.proceedsNote,
         amount: remainingInCents, account, date: `${start}-01`
       });
     }
     return { ...currentState, loans, transactions };
   });
   notify(k_loanFormMessages.saved);
   onClose();
 }
 const isDirty = useDirtyForm([name,remaining,payment,account,start,end,credit]);
 return <Dialog dirty={isDirty} title="A loan, accounted for" subtitle="Monthly repayments are expenses. Borrowed money is not earnings." onClose={onClose}><Field label="Loan name" value={name} onChangeText={setName} placeholder="e.g. Car loan"/><Row style={{gap:12}}><Field label="Remaining balance · EUR" value={remaining} onChangeText={setRemaining} style={{flex:1}} keyboardType="decimal-pad"/><Field label="Monthly payment · EUR" value={payment} onChangeText={setPayment} style={{flex:1}} keyboardType="decimal-pad"/></Row><Select label="Payment account" value={account} onChange={setAccount} options={state.accounts.map(a=>({value:a.id,label:a.name}))}/><Row style={{gap:12}}><Field label="Start month · YYYY-MM" value={start} onChangeText={setStart} style={{flex:1}}/><Field label="Last month · YYYY-MM" value={end} onChangeText={setEnd} style={{flex:1}}/></Row>{!item&&<Toggle value={credit} onChange={setCredit} label="Add loan proceeds to this account" description="Off by default. Leave off for an existing loan."/>}<T style={{fontSize:11,color:c.sub,marginVertical:13}}>Repayment entries are recorded separately. The plan forecasts your monthly payment without creating fake transactions.</T>{error&&<T style={{color:c.negative,marginBottom:12}}>{error}</T>}<Button onPress={save}>{item?'Save loan':'Add loan'}</Button></Dialog>;
}
// A revision keeps the approved cushion. A first plan for the year starts from
// the occasional-spending suggestion when there is history to support it.
function initialPlanCushion(state, carried, { year, fromMonth }) {
  if (carried.source?.year === year) {
    return carried.cushion ?? k_defaultPlanCushion;
  }
  const estimates = planDraftEstimates(state, { year, fromMonth, window: k_defaultHistoryWindow, today: localCalendarDate() });
  return estimates.evidence.months.length ? estimates.suggestedCushion : k_defaultPlanCushion;
}

// A suggestion accepted in the draft sets this year's amount only (owner
// decision F16). A null draft returns the year to the usual amount.
function withYearAmountDraft(event, year, yearAmountDrafts) {
  const draftAmount = yearAmountDrafts[event.id];
  if (draftAmount === undefined) {
    return event;
  }
  const yearKey = String(year);
  const otherYearAmounts = Object.fromEntries(Object.entries(event.yearAmounts ?? {}).filter(([amountYear]) => amountYear !== yearKey));
  const yearAmounts = draftAmount === null ? otherYearAmounts : { ...otherYearAmounts, [yearKey]: draftAmount };
  if (Object.keys(yearAmounts).length) {
    return { ...event, yearAmounts };
  }
  const eventWithUsualAmount = { ...event };
  delete eventWithUsualAmount.yearAmounts;
  return eventWithUsualAmount;
}

export function PlanForm({onClose}){
 const dismissRef=useRef(null);
 const {state,setState,month,notify}=useApp(),c=useContext(Theme);
 const year=yearOfMonth(month);
 // Fixed when the draft opens; save rechecks the calendar before approval.
 const [from,setFrom]=useState(()=>planRevisionStart(year,month,localCalendarDate()).fromMonth??1);
 // Assumptions carried from the latest earlier plan, read once when the draft opens.
 const [carried]=useState(()=>carriedPlanAssumptions(state,{year,fromMonth:from}));
 const [step,setStep]=useState(0),[income,setIncome]=useState(String((carried.income??k_defaultPlanIncome)/k_centsPerEuro)),[cushion,setCushion]=useState(()=>String(initialPlanCushion(state,carried,{year,fromMonth:from})/k_centsPerEuro)),[window,setWindow]=useState(String(carried.window??k_defaultHistoryWindow)),[eventName,setEventName]=useState(''),[eventAmount,setEventAmount]=useState(''),[eventMonth,setEventMonth]=useState('12'),[overrides,setOverrides]=useState(()=>Object.fromEntries(carried.overrides.filter(override=>override.keep).map(override=>[override.lineId,String(override.amount/k_centsPerEuro)]))),[error,setError]=useState('');
 const [incomeChangeFrom,setIncomeChangeFrom]=useState(''),[incomeChangeAmount,setIncomeChangeAmount]=useState(''),[loanEdits,setLoanEdits]=useState({}),[loanChangeFrom,setLoanChangeFrom]=useState(String(from)),[tolerance,setTolerance]=useState(String((carried.tolerance??k_defaultFixedTolerance)/k_centsPerEuro)),[drift,setDrift]=useState(String(Math.round((carried.drift??k_defaultVariableDrift)*k_percentageScale))),[draftEvents,setDraftEvents]=useState([]),[carriedIncomeChanges,setCarriedIncomeChanges]=useState(carried.incomeChanges),[carriedLoanChanges,setCarriedLoanChanges]=useState(carried.loanChanges);
 const [eventLike,setEventLike]=useState('');
 const [yearAmountDrafts,setYearAmountDrafts]=useState({});
 const [evaluationDate]=useState(()=>localCalendarDate());
 function changeEventName(name) {
   setEventName(name);
   if (!name.trim()) {
     setEventLike('');
   }
 }
 function acceptYearAmount(eventId, amount) {
   setYearAmountDrafts(drafts => ({ ...drafts, [eventId]: amount }));
 }
 // Clears a year amount saved by an earlier revision; with none saved, undoes the draft.
 function keepUsualAmount(eventId) {
   const storedEvent = state.events.find(event => event.id === eventId);
   const hasStoredYearAmount = storedEvent?.yearAmounts?.[String(year)] !== undefined;
   setYearAmountDrafts(drafts => {
     if (hasStoredYearAmount) {
       return { ...drafts, [eventId]: null };
     }
     const remainingDrafts = { ...drafts };
     delete remainingDrafts[eventId];
     return remainingDrafts;
   });
 }
 const suggestionCandidate=useMemo(()=>({id:k_draftEventId,name:eventName.trim(),year,month:Number(eventMonth),amount:0}),[eventName,year,eventMonth]);
 const candidateEvent=eventName.trim()&&cents(eventAmount)>0?{id:k_draftEventId,name:eventName.trim(),year,month:Number(eventMonth),amount:cents(eventAmount)}:null;
 // Stable between renders so the forecast preview only recomputes for new evidence.
 const plannedEvents=useMemo(()=>[...(state.events||[]).map(event=>withYearAmountDraft(event,year,yearAmountDrafts)),...draftEvents,...(candidateEvent?[candidateEvent]:[])],[state.events,yearAmountDrafts,year,draftEvents,candidateEvent?.name,candidateEvent?.month,candidateEvent?.amount]);
 const draftEstimates=planDraftEstimates({...state,events:plannedEvents},{year,fromMonth:from,window:Number(window),today:localCalendarDate()}),draftBills=draftEstimates.bills;
 const preview=buildPlan({...state,events:plannedEvents},{estimates:draftEstimates,year,fromMonth:from,income:cents(income)||0,cushion:cents(cushion)||0,window:Number(window),incomeChanges:[...carriedIncomeChanges,...(incomeChangeFrom&&cents(incomeChangeAmount)>=0?[{since:`${year}-${incomeChangeFrom.padStart(2,'0')}`,amount:cents(incomeChangeAmount)}]:[])],loanChanges:[...carriedLoanChanges,...Object.entries(loanEdits).filter(([,v])=>v!==''&&cents(v)>=0).map(([loanId,v])=>({loanId,since:`${year}-${loanChangeFrom.padStart(2,'0')}`,amount:cents(v)}))],overrides:Object.fromEntries(Object.entries(overrides).filter(([,v])=>v!=='').map(([k,v])=>[k,cents(v)]))});
 function addPlannedEvent() {
   if (!candidateEvent) {
     return;
   }
   const event = { ...candidateEvent, id: createEntityId(k_entityIdPrefixes.event) };
   setDraftEvents(events => [...events, event]);
   setEventName('');
   setEventAmount('');
   setEventLike('');
 }
 function save() {
   const validBaseAmounts = cents(tolerance) >= 0 && cents(income) >= 0 && cents(cushion) >= 0;
   const validDrift = Number(drift) > 0 && Number(drift) <= k_percentageScale;
   const validIncomeChange = !incomeChangeFrom || cents(incomeChangeAmount) >= 0;
   const validLoanChanges = Object.values(loanEdits).every(value => value === '' || cents(value) >= 0);
   const validOverrides = Object.values(overrides).every(value => value === '' || cents(value) >= 0);
   const validEvent = !eventAmount || cents(eventAmount) > 0;
   if (!validBaseAmounts || !validDrift || !validIncomeChange || !validLoanChanges || !validOverrides || !validEvent) {
     setError(k_invalidPlanAmountsMessage);
     return;
   }
   const today = localCalendarDate();
   const start = planRevisionStart(year, month, today);
   if (start.kind === k_planRevisionStartKinds.readOnly) {
     setError(`${year} ${k_planYearReadOnlyMessage}`);
     return;
   }
   if (start.fromMonth !== from) {
     setFrom(start.fromMonth);
     setLoanChangeFrom(previous => String(Math.max(Number(previous), start.fromMonth)));
     setError(k_planStartMovedMessage);
     return;
   }
   const approvedRevision = { ...preview, tolerance: cents(tolerance), drift: Number(drift) / k_percentageScale };
   const events = plannedEvents.map(event => event.id === k_draftEventId
     ? { ...event, id: createEntityId(k_entityIdPrefixes.event) }
     : event);
   const revisionId = createEntityId(k_entityIdPrefixes.plan);
   const approval = { id: revisionId, fromMonth: from, today };
   try {
     // Check against the ledger this preview was built from so a rejection is shown here.
     approvePlanRevision({ ...state, events }, approvedRevision, approval);
   } catch (approvalError) {
     setError(approvalError.message);
     return;
   }
   setState(currentState => {
     // The dialog is modal, so the archive should not change while it is open.
     // If it did, keep the ledger unchanged rather than throw during an update.
     try {
       return approvePlanRevision({ ...currentState, events }, approvedRevision, approval);
     } catch {
       return currentState;
     }
   });
   const firstRevisedMonthName = from === 1 ? 'January' : new Date(year, from - 1, 1).toLocaleString('en', { month: 'long' });
   notify(`Plan frozen · ${firstRevisedMonthName} onwards`);
   onClose();
 }
 const isDirty = useDirtyForm([income,cushion,window,eventName,eventAmount,eventMonth,carriedIncomeChanges,carriedLoanChanges,overrides,incomeChangeFrom,incomeChangeAmount,loanEdits,loanChangeFrom,tolerance,drift,draftEvents,yearAmountDrafts]);
 return <Dialog dismissRef={dismissRef} dirty={isDirty} title={step===0?'Make room for your year':step===1?'The things coming up':'Your plan, your call'} subtitle={`Step ${step+1} of 3 · Only ${new Date(year,from-1,1).toLocaleString('en',{month:'long'})}–December will change.`} onClose={onClose} width={550}>
 <Row style={{gap:6,marginBottom:25}}>{[0,1,2].map(i=><View key={i} style={{height:4,flex:1,borderRadius:4,backgroundColor:i<=step?c.accent:c.line}}/>)}</Row>
 {step===0&&<><PlanDraftEvidence evidence={preview.evidence} suggestedCushion={preview.suggestedCushion}/><Field label="Expected monthly income · EUR" value={income} onChangeText={setIncome} keyboardType="decimal-pad"/><Field label="Monthly occasional-spending cushion · EUR" value={cushion} onChangeText={setCushion} keyboardType="decimal-pad"/><Select label="Variable spending history" value={window} onChange={setWindow} options={[{value:'3',label:'3 completed months'},{value:'6',label:'6 completed months · recommended'},{value:'12',label:'12 completed months'}]}/><Row style={{gap:12}}><Field label="Fixed tolerance · ± EUR" value={tolerance} onChangeText={setTolerance} style={{flex:1}}/><Field label="Variable drift trigger · %" value={drift} onChangeText={setDrift} style={{flex:1}}/></Row><View style={{backgroundColor:c.soft,padding:15,borderRadius:12}}><T style={{fontSize:12,color:c.sub}}>Fixed costs use each bill's latest observed amount until you cancel it. Variable costs use your rolling net average. Occasional spending uses its own cushion. Loan repayments get a separate line.</T></View></>}
 {step===1&&<><H size={19} style={{marginBottom:16}}>Changes to your regular income</H><Select label="Income changes from" value={incomeChangeFrom} onChange={setIncomeChangeFrom} options={[{value:'',label:'No change planned'},...Array.from({length:13-from},(_,i)=>({value:String(i+from),label:new Date(year,i+from-1,1).toLocaleString('en',{month:'long'})}))]}/>{incomeChangeFrom&&<Field label="New monthly income · EUR" value={incomeChangeAmount} onChangeText={setIncomeChangeAmount} placeholder="e.g. 2600"/>}<Divider/><H size={19} style={{marginBottom:16}}>The bigger things</H><Field label="A trip, a big purchase, a seasonal cost · optional" value={eventName} onChangeText={changeEventName} placeholder="e.g. Summer in the Azores"/><Row style={{gap:14}}><Field label="One-off amount · EUR" value={eventAmount} onChangeText={setEventAmount} style={{flex:1}}/><Select label="Month" value={eventMonth} onChange={setEventMonth} options={Array.from({length:13-from},(_,i)=>({value:String(i+from),label:new Date(year,i+from-1,1).toLocaleString('en',{month:'long'})}))} style={{flex:1}}/></Row>
 {eventName.trim()&&<NewPlannedCostSuggestion state={state} evaluationDate={evaluationDate} candidate={suggestionCandidate} likeValue={eventLike} onLikeChange={setEventLike} onUseAmount={setEventAmount}/>}
 {candidateEvent&&<Button small kind="soft" icon="Plus" onPress={addPlannedEvent}>Add another event</Button>}
 <DraftPlannedCosts state={state} evaluationDate={evaluationDate} events={[...plannedEvents.filter(event=>event.id!==k_draftEventId)]} year={year} fromMonth={from} onAccept={acceptYearAmount} onRevert={keepUsualAmount}/><Divider/><H size={18} style={{marginBottom:10}}>Loans and changes already accounted for</H><CarriedChanges loans={state.loans} startMonth={`${year}-${String(from).padStart(2,'0')}`} incomeChanges={carriedIncomeChanges} loanChanges={carriedLoanChanges} onRemoveIncomeChange={change=>setCarriedIncomeChanges(changes=>changes.filter(candidate=>candidate!==change))} onRemoveLoanChange={change=>setCarriedLoanChanges(changes=>changes.filter(candidate=>candidate!==change))}/>{state.loans.length>0&&<><Select label="Loan payment changes from" value={loanChangeFrom} onChange={setLoanChangeFrom} options={Array.from({length:13-from},(_,i)=>({value:String(i+from),label:new Date(year,i+from-1,1).toLocaleString('en',{month:'long'})}))}/>{state.loans.map(l=><Field key={l.id} label={`${l.name} · new monthly payment, optional`} value={loanEdits[l.id]||''} onChangeText={v=>setLoanEdits(es=>({...es,[l.id]:v}))} placeholder={`${(carriedLoanChanges.find(change=>change.loanId===l.id&&change.since===`${year}-${String(from).padStart(2,'0')}`)?.amount??l.payment)/k_centsPerEuro} · unchanged`}/>)}</>}</>}
 {step===2&&<><H size={18} style={{marginBottom:15}}>Fine-tune the monthly amounts</H><PlanDraftEvidence evidence={preview.evidence} suggestedCushion={preview.suggestedCushion}/>{preview.months[`${year}-${String(from).padStart(2,'0')}`]?.lines.filter(l=>!['salary','interest','loan'].includes(l.category)).map(l=><Row key={l.id||l.category} style={{gap:14,marginBottom:6}}><View style={{flex:1}}><T style={{fontSize:12}}>{l.name}</T><T style={{fontSize:10,color:c.muted}}>{l.kind} · calculated {euro(l.amount)}</T>{l.kind===k_spendingBehaviors.fixed&&<PlanBillList bills={draftBills.filter(bill=>bill.category===l.category)} month={`${year}-${String(from).padStart(2,'0')}`}/>}<EarlierOverride override={carried.overrides.find(override=>override.lineId===(l.id||l.category)&&!override.stale)} value={overrides[l.id||l.category]} onKeep={amount=>setOverrides(o=>({...o,[l.id||l.category]:String(amount/k_centsPerEuro)}))} onDrop={()=>setOverrides(o=>({...o,[l.id||l.category]:''}))}/></View><Field value={overrides[l.id||l.category]??''} onChangeText={v=>setOverrides(o=>({...o,[l.id||l.category]:v}))} placeholder={(l.amount/k_centsPerEuro).toFixed(2)} label={`Override ${l.name}`} style={{width:150,marginBottom:6}}/></Row>)}<CarriedAssumptionNotes carried={carried} loans={state.loans} lineIds={(preview.months[`${year}-${String(from).padStart(2,'0')}`]?.lines||[]).map(line=>line.id||line.category)}/><PlanDraftPreview plan={preview} state={{...state,events:plannedEvents}} year={year} fromMonth={from}/><Divider/><Row style={{justifyContent:'space-between',marginBottom:15}}><T style={{fontSize:12}}>First revised month's balance</T><H size={24}>{euro(preview.months[`${year}-${String(from).padStart(2,'0')}`]?.balance||0)}</H></Row><T style={{fontSize:12,color:c.sub}}>Overrides take priority and are marked in the plan. Past months stay untouched. New transactions never silently rewrite this snapshot.</T></>}
 {error&&<T style={{color:c.negative,marginTop:15}}>{error}</T>}<Row style={{justifyContent:'space-between',marginTop:25}}><Button kind="soft" onPress={()=>step?setStep(step-1):dismissRef.current?.()}>{step?'Back':'Cancel'}</Button><Button icon={step===2?'LockKeyhole':'ArrowRight'} onPress={()=>step<2?setStep(step+1):save()}>{step===2?'Freeze my plan':'Continue'}</Button></Row>
 </Dialog>;
}
