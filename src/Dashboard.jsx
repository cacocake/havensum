import React,{useContext,useState} from 'react';
import {View,ScrollView,useWindowDimensions} from 'react-native';
import {useApp} from './context.js';
import {Theme,T,H,Row,Button,IB,Badge,TileIcon,Card,Empty} from './ui.jsx';
import Icon from './Icon';
import CategoryGlyph from './CategoryGlyph.jsx';
import {Trend,Donut} from './Charts';
import {PocketBuddy,Squish} from './Playful.jsx';
import {planInsights} from './planInsights.js';
import {euro,reportingMonthStats,accountBalance,categorySettings,monthOf} from './engine.js';
import { plannedMonth } from './planArchive.js';
import { savingsRateLabel } from './savingsRateLabel.js';
import { currentLocalMonth } from './calendar.js';
import { expensePaybacks, scheduledMonthStats } from './ledger.js';
import { isScheduledEntry } from './posting.js';
import { signedEuro } from './money.js';

export function AccountCard({account}){
 const {state,today,openAccount}=useApp(),c=useContext(Theme);
 return <Squish accessibilityLabel={`View ${account.name} account`} onPress={()=>openAccount(account.id)} style={{flex:1,minWidth:0}}>
  <Card style={{padding:21,borderRadius:24,overflow:'hidden',minWidth:0}}>
   <View style={{position:'absolute',width:100,height:100,borderRadius:38,right:-35,top:-33,backgroundColor:account.color+'18',transform:[{rotate:'22deg'}]}}/>
   <Row style={{gap:11,marginBottom:22}}><TileIcon name={account.icon} color={account.color} size={40}/><View style={{flex:1,minWidth:0}}><H size={20} numberOfLines={1}>{account.name}</H><T style={{fontSize:11,color:c.sub,marginTop:3}}>{account.tag}</T></View><Icon name="ArrowUpRight" color={c.sub} size={17}/></Row>
   <H size={29} adjustsFontSizeToFit numberOfLines={1}>{euro(accountBalance(state,account.id,today))}</H>
   <T style={{fontSize:11,color:c.sub,marginTop:7}}>{account.tag==='Savings'?savingsRateLabel(account,currentLocalMonth()):account.tag==='Investment'?'Manual valuation':account.tag==='Joint'?'Hugo & Marina':'Your everyday pocket'}</T>
  </Card>
 </Squish>;
}
// Received paybacks, then any dated later (they count from their date).
function paybackSummary(paybacks){
 let summary='';
 if(paybacks.receivedTotal>0){
  summary+=` · ${euro(paybacks.receivedTotal)} back`;
 }
 if(paybacks.scheduledTotal>0){
  summary+=` · ${euro(paybacks.scheduledTotal)} scheduled back`;
 }
 return summary;
}
// A signed amount: outflows and a downward interest correction show a minus.
function rowAmountLabel(transaction, accountId) {
  if (transaction.type === 'transfer') {
    const direction = transaction.toAccount === accountId ? '+' : '−';
    return `${accountId ? direction : ''}${euro(transaction.amount)}`;
  }
  const incoming = transaction.type === 'income' || transaction.type === 'reimbursement';
  return incoming ? signedEuro(transaction.amount) : `−${euro(transaction.amount)}`;
}

export function TransactionRow({tx,last=false,wide=false,accountId=null}){
 const {state,today,setModal}=useApp(),c=useContext(Theme),cat=categorySettings(state.categories,tx.category),incoming=tx.type==='income'||tx.type==='reimbursement',transfer=tx.type==='transfer',received=transfer&&accountId===tx.toAccount;
 const linked=state.transactions.find(x=>x.id===tx.linkedId),paybacks=expensePaybacks(state.transactions,tx.id,today),account=state.accounts.find(a=>a.id===tx.account);
 const color=tx.type==='reimbursement'?'#779BC4':transfer?'#A69AC7':cat.color;
 // L01: an entry dated after today is scheduled until its date.
 const scheduled=isScheduledEntry(tx,today);
 return <Squish accessibilityLabel={scheduled?`View ${tx.title}, scheduled`:`View ${tx.title}`} onPress={()=>setModal({type:'transaction-detail',id:tx.id})} style={{paddingVertical:14,borderBottomWidth:last?0:1,borderColor:c.line,minWidth:0}}>
  <Row style={{gap:12,minWidth:0}}><View style={{flexShrink:0}}><TileIcon name={transfer?'ArrowLeftRight':tx.type==='reimbursement'?'CornerDownLeft':cat.icon} color={color} size={43}/></View>
   <View style={{flex:1,minWidth:0}}><Row style={{gap:5,minWidth:0}}><T numberOfLines={1} style={{fontSize:14,fontWeight:'600',flexShrink:1}}>{tx.title}</T>{linked&&<Icon name="Link2" size={12} color={c.positive}/>}</Row>
    <T numberOfLines={1} style={{fontSize:11,color:c.sub,marginTop:3}}>{linked?`Payback · ${linked.date.slice(0,7)} expense`:transfer?`${account?.name} → ${state.accounts.find(a=>a.id===tx.toAccount)?.name}`:`${cat.name} · ${account?.name||''}`}{paybackSummary(paybacks)}</T>
   </View>
   {wide&&<View style={{width:90}}><Badge>{tx.kind||cat.kind}</Badge></View>}
   <View style={{alignItems:'flex-end',maxWidth:112,flexShrink:0}}><T numberOfLines={1} adjustsFontSizeToFit style={{fontSize:14,fontWeight:'700',color:(incoming&&tx.amount>0)||received?c.positive:c.text}}>{rowAmountLabel(tx,accountId)}</T><T style={{fontSize:10,color:c.muted,marginTop:3}}>{new Date(tx.date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</T>{scheduled&&<Row style={{gap:3,marginTop:3}}><Icon name="CalendarDays" size={11} color={c.sub}/><T style={{fontSize:10,color:c.sub,fontWeight:'600'}}>Scheduled</T></Row>}</View>
  </Row>
 </Squish>;
}
function QuickEntry(){
 const {state,setModal}=useApp(),c=useContext(Theme),{width}=useWindowDimensions();
 const actions=[{type:'expense',label:'Expense',icon:'Plus',bg:c.accent,ink:c.buttonInk},{type:'income',label:'Income',icon:'ArrowDownLeft',bg:c.dark?'#584C39':'#FFF0CA',ink:c.dark?'#F9DA98':'#806332'},{type:'reimbursement',label:'Payback',icon:'CornerDownLeft',bg:c.dark?'#41425D':'#E4E1FA',ink:c.dark?'#DDD6FF':'#645B84'}];
 return <View style={{backgroundColor:c.peach,borderRadius:27,padding:18,overflow:'hidden'}}>
  <View style={{position:'absolute',width:130,height:130,borderRadius:65,right:-42,top:-45,borderWidth:19,borderColor:c.dark?'#73543555':'#EDB27322'}}/>
  <Row style={{justifyContent:'space-between',gap:12,paddingHorizontal:3,marginBottom:12}}><View style={{flex:1,minWidth:0}}><H size={width<350?22:25} style={{color:c.text}}>A little note,{'\n'}a lighter mind.</H></View><PocketBuddy size={width<350?70:82}/></Row>
  <Row style={{gap:8}}>{actions.map(a=><Squish key={a.type} accessibilityLabel={`Add ${a.type==='reimbursement'?'payback':a.type}`} onPress={()=>setModal(state.accounts.length?{type:'transaction',initialType:a.type}:{type:'account'})} style={{flex:1,minWidth:0,minHeight:65,backgroundColor:a.bg,borderRadius:18,paddingVertical:8,paddingHorizontal:5,alignItems:'center',justifyContent:'center',gap:3}}><Icon name={a.icon} size={21} color={a.ink}/><T style={{fontSize:13,color:a.ink,fontWeight:'600'}}>{a.label}</T></Squish>)}</Row>
 </View>;
}
function Activity(){
 const {state,month,openActivity}=useApp(),c=useContext(Theme),[filter,setFilter]=useState('All');
 const types={Expenses:'expense',Income:'income',Paybacks:'reimbursement'};
 const transactions=state.transactions.filter(t=>monthOf(t.date)===month&&(filter==='All'||t.type===types[filter])).sort((a,b)=>b.date.localeCompare(a.date));
 return <Card style={{padding:19,borderRadius:26}}>
  <Row style={{justifyContent:'space-between',gap:8,marginBottom:13}}><Row style={{gap:7,flex:1}}><H size={22}>Recent activity</H><Icon name="Sparkles" size={15} color={c.accent}/></Row><Squish accessibilityLabel="View all transactions" onPress={()=>openActivity(filter==='All'?{}:{type:types[filter]})} style={{minHeight:48,justifyContent:'center',paddingLeft:10}}><Row style={{gap:4}}><T style={{fontSize:12,color:c.sub,fontWeight:'500'}}>See all</T><Icon name="ArrowUpRight" size={13} color={c.sub}/></Row></Squish></Row>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:6,paddingBottom:9}}>{['All','Expenses','Income','Paybacks'].map(name=><Squish key={name} accessibilityLabel={`Show ${name.toLowerCase()}`} accessibilityState={{selected:filter===name}} aria-pressed={filter===name} onPress={()=>setFilter(name)} style={{minHeight:48,paddingHorizontal:14,borderRadius:15,backgroundColor:filter===name?c.nav:c.soft,alignItems:'center',justifyContent:'center'}}><T style={{fontSize:12,color:filter===name?c.peachText:c.sub,fontWeight:filter===name?'600':'400'}}>{name}</T></Squish>)}</ScrollView>
  {transactions.slice(0,5).map((t,i)=><TransactionRow key={t.id} tx={t} last={i===Math.min(5,transactions.length)-1}/>)}
  {!transactions.length&&<Empty icon="Coffee" title="A little quiet here" description={filter==='All'?'Your next entry will find a home here.':`No ${filter.toLowerCase()} recorded this month.`}/>}
 </Card>;
}
// Entries dated after today in this month's report; they count from their date.
function scheduledEntriesText(scheduled) {
  const entries = scheduled.count === 1 ? '1 scheduled entry' : `${scheduled.count} scheduled entries`;
  const posting = scheduled.count === 1 ? 'it posts' : 'they post';
  return `${entries} · ${signedEuro(scheduled.balance)} when ${posting}`;
}

function MonthScheduledNote() {
  const { state, month, today } = useApp();
  const colors = useContext(Theme);
  const scheduled = scheduledMonthStats(state, month, today);
  if (!scheduled.count) {
    return null;
  }
  return <Row style={{ gap: 6, marginTop: 10 }}>
    <Icon name="CalendarDays" size={13} color={colors.sub}/>
    <T testID="month-scheduled" style={{ fontSize: 12, color: colors.sub, flex: 1 }}>{scheduledEntriesText(scheduled)}</T>
  </Row>;
}

function MonthPulse(){
 const {state,month,today,openActivity,setScreen}=useApp(),c=useContext(Theme),insight=planInsights(state,month,today),stats=insight.actual,name=new Date(month+'-01T12:00:00').toLocaleString('en',{month:'long'});
 return <Card style={{padding:20,borderRadius:26,backgroundColor:c.cream,borderColor:'transparent'}}>
  <Row style={{justifyContent:'space-between',gap:10}}><View style={{flex:1}}><T testID="month-pulse-period" style={{fontSize:12,color:c.sub}}>{name}{insight.period==='current'?', so far':insight.period==='past'?' · recorded':' · posted so far'}</T><Row style={{gap:4,marginTop:6}}><Icon name={stats.balance>=0?'ArrowUpRight':'ArrowDownRight'} size={24} color={stats.balance>=0?c.positive:c.negative}/><H size={31} adjustsFontSizeToFit numberOfLines={1} style={{color:stats.balance>=0?c.positive:c.negative,flexShrink:1}}>{stats.balance>=0?'+':'−'}{euro(Math.abs(stats.balance))}</H></Row></View><View style={{width:44,height:44,borderRadius:17,backgroundColor:c.dark?'#665435':'#F3D997',alignItems:'center',justifyContent:'center',transform:[{rotate:'9deg'}]}}><Icon name="Sun" size={23} color={c.dark?'#F8D78E':'#A27A29'}/></View></Row>
  <Row style={{gap:12,marginTop:19,paddingTop:15,borderTopWidth:1,borderColor:c.line}}>{[['Income',stats.income,'ArrowDownLeft'],['Net spending',stats.spent,'ArrowUpRight']].map(([label,value,icon])=><Squish key={label} accessibilityLabel={`View ${label.toLowerCase()} transactions`} onPress={()=>openActivity(label==='Income'?{type:'income'}:{type:'expense',spending:true})} style={{flex:1,minWidth:0,minHeight:60}}><Row style={{gap:5}}><Icon name={icon} size={13} color={c.sub}/><T style={{fontSize:11,color:c.sub}}>{label}</T></Row><T adjustsFontSizeToFit numberOfLines={1} style={{fontSize:18,fontWeight:'600',marginTop:5}}>{euro(value)}</T></Squish>)}</Row>
  <MonthScheduledNote/>
 <Squish accessibilityLabel="View savings forecast in Plan" onPress={()=>setScreen('Year Plan')} style={{marginTop:15,paddingTop:15,borderTopWidth:1,borderColor:c.line,minHeight:55}}><Row style={{justifyContent:'space-between',gap:10}}><View style={{flex:1}}><T style={{fontSize:12,color:c.sub}}>{insight.forecast?(insight.period==='past'?'Recorded monthly savings':insight.forecast.partial?'Expected savings · partial estimate':'Expected savings'):'Not enough history for Expected savings'}</T>{insight.forecast&&<H size={24}>{euro(insight.forecast.balance)}</H>}</View><Icon name="ArrowUpRight" size={19} color={c.sub}/></Row></Squish>
 </Card>;
}
function AccountPockets(){
 const {state,today,setScreen,openAccount}=useApp(),c=useContext(Theme);
 return <View style={{gap:12}}><Row style={{justifyContent:'space-between'}}><H size={20}>Your pockets</H><Squish accessibilityLabel="View all accounts" onPress={()=>setScreen('Accounts')} style={{minHeight:48,justifyContent:'center'}}><Row style={{gap:5}}><T style={{fontSize:12,color:c.sub}}>All accounts</T><Icon name="ArrowRight" size={14} color={c.sub}/></Row></Squish></Row>
 <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:9,paddingBottom:3}}>{state.accounts.map(a=><Squish key={a.id} accessibilityLabel={`View ${a.name} account`} onPress={()=>openAccount(a.id)} style={{backgroundColor:c.card,borderWidth:1,borderColor:c.line,borderRadius:19,padding:13,width:169}}><Row style={{gap:7}}><TileIcon name={a.icon} color={a.color} size={27}/><T numberOfLines={1} style={{fontSize:12,flex:1,minWidth:0}}>{a.name}</T></Row><H size={22} numberOfLines={1} adjustsFontSizeToFit style={{marginTop:10}}>{euro(accountBalance(state,a.id,today))}</H></Squish>)}</ScrollView>
 </View>;
}
function SpendingWheel(){
 const {state,month,today,openActivity}=useApp(),c=useContext(Theme),stats=reportingMonthStats(state,month,today),[selected,setSelected]=useState(null);
 const grouped=state.categories.filter(x=>!x.parentId).map(cat=>({...cat,amount:stats.expenses.filter(t=>{const x=categorySettings(state.categories,t.category);return x.id===cat.id||x.parentId===cat.id}).reduce((s,t)=>s+t.net,0)})).filter(x=>x.amount>0).sort((a,b)=>b.amount-a.amount);
 const active=grouped.find(g=>g.id===selected),shown=active?.amount??stats.spent;
 return <Card testID="spending-breakdown" style={{padding:20,borderRadius:27,minWidth:0,overflow:'hidden',flexShrink:0}}>
  <Row style={{justifyContent:'space-between',gap:12,marginBottom:7}}><H size={23} style={{flex:1}}>A colourful breakdown</H><Icon name="Shapes" size={20} color={c.accent}/></Row><T style={{fontSize:12,color:c.sub}}>Select a category to explore its spending.</T>
  <View style={{alignItems:'center',justifyContent:'center',height:242,width:'100%',marginVertical:8}}>
   <Donut parts={grouped} selectedId={active?.id} onSelect={id=>setSelected(id===selected?null:id)} dark={c.dark} size={222}/>
   <View pointerEvents="none" style={{position:'absolute',width:124,alignItems:'center'}}>{active?<CategoryGlyph name={active.icon} size={25} color={active.color}/>:<Icon name="Flower2" size={21} color={c.accent}/>}<H size={euro(shown).length>10?18:23} numberOfLines={1} adjustsFontSizeToFit style={{marginTop:8}}>{euro(shown)}</H><T numberOfLines={2} style={{fontSize:11,color:c.sub,marginTop:3,textAlign:'center'}}>{active?active.name:'net spending'}</T></View>
  </View>
  <View testID="category-legend" style={{gap:4,width:'100%',minWidth:0,flexShrink:0}}>{grouped.map(g=><Squish key={g.id} accessibilityLabel={`View ${g.name} transactions, ${euro(g.amount)}`} onPress={()=>openActivity({type:'expense',spending:true,category:g.id})} style={{flexDirection:'row',alignItems:'center',gap:10,minHeight:51,paddingHorizontal:9,paddingVertical:6,borderRadius:15,width:'100%',backgroundColor:selected===g.id?g.color+'22':'transparent'}}>
   <TileIcon name={g.icon} color={g.color} size={31}/><View style={{flex:1,minWidth:0}}><T numberOfLines={1} style={{fontSize:12,fontWeight:'500'}}>{g.name}</T><View style={{height:3,width:'90%',backgroundColor:c.soft,borderRadius:3,marginTop:5}}><View style={{height:3,width:`${Math.max(2,g.amount/Math.max(stats.spent,1)*100)}%`,backgroundColor:g.color,borderRadius:3}}/></View></View>
   <View style={{alignItems:'flex-end',maxWidth:105,flexShrink:0}}><T numberOfLines={1} adjustsFontSizeToFit style={{fontSize:12,fontWeight:'600'}}>{euro(g.amount)}</T><Row style={{gap:5}}><T style={{fontSize:10,color:c.sub}}>{Math.round(g.amount/stats.spent*100)}%</T><Icon name="ChevronRight" size={13} color={c.sub}/></Row></View>
  </Squish>)}</View>
  {!grouped.length&&<T style={{fontSize:12,color:c.sub,textAlign:'center'}}>A blank canvas for this month.</T>}
  {active&&<Button kind="soft" icon="ArrowRight" onPress={()=>openActivity({type:'expense',spending:true,category:active.id})}>View {active.name} transactions</Button>}
  {active&&<Squish accessibilityLabel="Show total spending" onPress={()=>setSelected(null)} style={{padding:12,alignItems:'center',minHeight:48}}><T style={{fontSize:12,color:c.sub}}>Show all spending</T></Squish>}
 </Card>;
}
function SpendingRhythm(){
 const {state,month,today,setMonth,openActivity}=useApp(),c=useContext(Theme),[selectedMonth,setSelectedMonth]=useState(null),[range,setRange]=useState('6 months'),[available,setAvailable]=useState(0),n=Number(month.slice(5,7)),year=Number(month.slice(0,4));
 const months=Array.from({length:range==='This year'?12:6},(_,i)=>{const d=new Date(year,range==='This year'?i:n-6+i,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`});
 return <Card style={{padding:20,borderRadius:27,minWidth:0,overflow:'hidden'}}><Row style={{gap:10,justifyContent:'space-between',marginBottom:12,flexWrap:'wrap'}}><H size={23} style={{flexShrink:1}}>Your spending rhythm</H><Row style={{padding:3,backgroundColor:c.soft,borderRadius:15}}>{['6 months','This year'].map(r=><Squish key={r} accessibilityLabel={`Chart range ${r}`} accessibilityState={{selected:r===range}} onPress={()=>{setRange(r);setSelectedMonth(null)}} style={{minHeight:48,paddingHorizontal:11,borderRadius:12,backgroundColor:r===range?c.card:'transparent',justifyContent:'center'}}><T style={{fontSize:12}}>{r}</T></Squish>)}</Row></Row>
 <Row style={{gap:15,marginBottom:22,flexWrap:'wrap'}}>{[['Actual net expenses',c.accent],['Frozen plan',c.dark?'#6F6885':'#D8D0E6']].map(([label,color])=><Row key={label} style={{gap:6}}><View style={{width:8,height:8,borderRadius:3,backgroundColor:color}}/><T style={{fontSize:11,color:c.sub}}>{label}</T></Row>)}</Row>
 <View onLayout={e=>setAvailable(e.nativeEvent.layout.width)} style={{width:'100%',minWidth:0}}><Trend selectedIndex={months.indexOf(selectedMonth)} onSelect={i=>setSelectedMonth(months[i])} actual={months.map(m=>reportingMonthStats(state,m,today).spent)} planned={months.map(m=>plannedMonth(state,m)?.expense||0)} labels={months.map(m=>new Date(m+'-01T12:00:00').toLocaleString('en',{month:'short'}))} dark={c.dark} availableWidth={available}/></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:5,paddingTop:8}}>{months.map(m=><Squish key={m} accessibilityLabel={`Select chart month ${m}`} accessibilityState={{selected:m===selectedMonth}} onPress={()=>setSelectedMonth(m)} style={{minWidth:48,minHeight:48,paddingHorizontal:8,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:m===selectedMonth?c.nav:c.soft}}><T style={{fontSize:12}}>{new Date(m+'-01T12:00:00').toLocaleString('en',{month:'short'})}</T></Squish>)}</ScrollView>
 {selectedMonth&&months.includes(selectedMonth)&&<ChartSelection state={state} month={selectedMonth} onOpen={()=>{setMonth(selectedMonth);openActivity({type:'expense',spending:true})}}/>}
 {!selectedMonth&&<T style={{fontSize:12,color:c.sub,marginTop:10}}>Tap a month to compare actual spending with its plan.</T>}
 </Card>;
}
function ChartSelection({state,month,onOpen}){const c=useContext(Theme),{today}=useApp(),actual=reportingMonthStats(state,month,today).spent,planned=plannedMonth(state,month)?.expense;return <View style={{marginTop:14,padding:14,borderRadius:16,backgroundColor:c.soft,gap:10}}><H size={19}>{new Date(month+'-01T12:00:00').toLocaleString('en',{month:'long',year:'numeric'})}</H><T>Actual {euro(actual)} · Plan {planned==null?'Not set':euro(planned)}</T><Button small kind="outline" onPress={onOpen}>View month’s expenses</Button></View>}
function PlanTeaser(){
 const {state,month,setScreen}=useApp(),c=useContext(Theme),p=plannedMonth(state,month);
 return <Squish accessibilityLabel="Open Year Plan" onPress={()=>setScreen('Year Plan')} style={{backgroundColor:c.dark?'#393348':'#EDE6F8',borderRadius:25,padding:21,overflow:'hidden'}}><View style={{position:'absolute',right:-17,top:-17,width:100,height:100,borderRadius:38,borderWidth:17,borderColor:c.dark?'#64557344':'#D3C4EB77',transform:[{rotate:'20deg'}]}}/><Row style={{gap:7}}><Icon name="LockKeyhole" size={14} color={c.dark?'#C7B2E7':'#8D75AA'}/><T style={{fontSize:11,color:c.dark?'#C7B2E7':'#8D75AA',fontWeight:'600'}}>YOUR YEAR, WITH ROOM TO BREATHE</T></Row><H size={23} style={{marginTop:15,maxWidth:240}}>A plan that doesn't{'\n'}chase every coffee.</H><Row style={{justifyContent:'space-between',marginTop:20,alignItems:'flex-end'}}><View><T style={{fontSize:11,color:c.sub}}>Planned monthly balance</T><H size={27} style={{marginTop:4}}>{(p?.balance||0)>=0?'+':''}{euro(p?.balance||0)}</H></View><View style={{width:40,height:40,borderRadius:16,backgroundColor:c.card,justifyContent:'center',alignItems:'center'}}><Icon name="ArrowUpRight" size={19} color={c.text}/></View></Row></Squish>;
}
export default function Dashboard(){
 const {wide}=useApp(),c=useContext(Theme);
 return <View style={{gap:22}}>
  {wide?<Row style={{alignItems:'flex-start',gap:23}}><View style={{flex:1.45,minWidth:0,gap:22}}><QuickEntry/><Activity/></View><View style={{flex:1,minWidth:0,gap:22}}><MonthPulse/><AccountPockets/><PlanTeaser/></View></Row>:<><QuickEntry/><Activity/><MonthPulse/><AccountPockets/></>}
  <View style={{flexDirection:wide?'row':'column',alignItems:'stretch',gap:22}}><View style={{flex:wide?1:undefined,minWidth:0}}><SpendingWheel/></View><View style={{flex:wide?1.3:undefined,minWidth:0,gap:22}}><SpendingRhythm/>{!wide&&<PlanTeaser/>}<Card style={{padding:21,backgroundColor:c.soft,borderColor:'transparent'}}><Row style={{gap:14}}><PocketBuddy size={57} quiet/><View style={{flex:1,minWidth:0}}><H size={19}>Life first. Spreadsheets later.</H><T style={{fontSize:12,color:c.sub,marginTop:5}}>A little awareness. On your own terms.</T></View></Row></Card></View></View>
 </View>;
}
