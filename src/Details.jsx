import React,{useContext} from 'react';
import {View} from 'react-native';
import {Theme,T,H,Row,Button,Badge,TileIcon,Card,Dialog,Divider,Empty} from './ui.jsx';
import {useApp} from './context.js';
import {euro,accountBalance,categorySettings} from './engine.js';
import {TransactionRow} from './Dashboard.jsx';
import Icon from './Icon';
import {Squish} from './Playful.jsx';
import { expenseReportingMonth, isPlannedCostLink } from './plannedCosts.js';
import { expensePaybacks, scheduledAccountMovement } from './ledger.js';
import { isScheduledEntry } from './posting.js';
import { signedEuro } from './money.js';

export function AccountDetail(){
 const {state,accountId,setScreen,setModal}=useApp(),c=useContext(Theme),account=state.accounts.find(a=>a.id===accountId);
 if(!account)return <Empty title="Account unavailable" description="Choose an account from More."/>;
 const rows=state.transactions.filter(t=>t.account===accountId||t.type==='transfer'&&t.toAccount===accountId).sort((a,b)=>b.date.localeCompare(a.date));
 return <View style={{gap:20}}>
  <Row style={{justifyContent:'space-between',gap:8}}><Button small kind="soft" icon="ArrowLeft" onPress={()=>setScreen('Accounts')}>Accounts</Button><Button small kind="outline" icon="Pencil" onPress={()=>setModal({type:'account',item:account})}>Edit account</Button></Row>
  <AccountBalanceCard account={account}/>
  <Card><H size={22}>Account activity</H><T style={{color:c.sub,fontSize:12,marginTop:5,marginBottom:12}}>All time · {rows.length} movements</T>{rows.length?rows.map((t,i)=><TransactionRow key={t.id} tx={t} last={i===rows.length-1} accountId={accountId}/>):<Empty title="Your ledger starts here" description="Add a transaction to record a movement."/>}</Card>
 </View>;
}

function BalanceLine({ label, children }) {
  const colors = useContext(Theme);
  return <Row style={{ justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
    <T style={{ color: colors.sub }}>{label}</T>
    {children}
  </Row>;
}

// L01: the balance counts entries posted by today; later ones are scheduled
// and shown apart with the balance once they post.
function AccountBalanceCard({ account }) {
  const { state, today } = useApp();
  const colors = useContext(Theme);
  const balanceToday = accountBalance(state, account.id, today);
  const postedMovement = balanceToday - account.openingBalance;
  const scheduledMovement = scheduledAccountMovement(state, account.id, today);
  return <Card style={{ backgroundColor: colors.peach, borderColor: 'transparent' }}>
    <Row style={{ gap: 12 }}>
      <TileIcon name={account.icon} color={account.color}/>
      <View style={{ flex: 1 }}>
        <T>{account.tag} · balance today</T>
        <H testID="account-balance-today" size={35} numberOfLines={1} adjustsFontSizeToFit>{euro(balanceToday)}</H>
      </View>
    </Row>
    <Divider/>
    <BalanceLine label="Opening balance"><T>{euro(account.openingBalance)}</T></BalanceLine>
    <BalanceLine label="Posted movements"><T>{signedEuro(postedMovement)}</T></BalanceLine>
    {scheduledMovement !== 0 && <>
      <BalanceLine label="Scheduled"><T testID="account-scheduled-movement">{signedEuro(scheduledMovement)}</T></BalanceLine>
      <BalanceLine label="After scheduled entries"><T testID="account-balance-after-scheduled">{euro(balanceToday + scheduledMovement)}</T></BalanceLine>
    </>}
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 14 }}>Entries count from their date on this device's calendar; later ones are scheduled. Transfers and paybacks change cash here, without becoming earnings.</T>
  </Card>;
}

export function TransactionDetail({transactionId,onClose}){
 const {state,today,setModal}=useApp(),c=useContext(Theme),tx=state.transactions.find(t=>t.id===transactionId);
 if(!tx)return <Dialog title="Transaction unavailable" onClose={onClose}><T>This movement is no longer available.</T></Dialog>;
 const cat=categorySettings(state.categories,tx.category),account=state.accounts.find(a=>a.id===tx.account),original=state.transactions.find(t=>t.id===tx.linkedId),paybacks=expensePaybacks(state.transactions,tx.id,today);
 const linkRow=(t,label)=><Squish key={t.id} accessibilityLabel={`View ${t.title}`} onPress={()=>setModal({type:'transaction-detail',id:t.id})} style={{minHeight:56,paddingVertical:12,borderTopWidth:1,borderColor:c.line}}><Row style={{gap:10}}><Icon name="Link2" size={17} color={c.sub}/><View style={{flex:1,minWidth:0}}><T>{t.title}</T><T style={{fontSize:12,color:c.sub}}>{label} · {t.date}</T></View><Icon name="ChevronRight" size={16} color={c.sub}/></Row></Squish>;
 return <Dialog title="Transaction details" onClose={onClose} footer={<Button icon="Pencil" onPress={()=>setModal({type:'transaction',item:tx})}>Edit transaction</Button>}>
  <Row style={{gap:13,marginBottom:18}}><TileIcon name={tx.type==='transfer'?'ArrowLeftRight':cat.icon} color={cat.color} size={48}/><View style={{flex:1,minWidth:0}}><H size={24}>{tx.title}</H><Badge style={{marginTop:7}}>{tx.type==='reimbursement'?'Payback':tx.type}</Badge>{isScheduledEntry(tx,today)&&<T testID="transaction-scheduled" style={{fontSize:12,color:c.sub,marginTop:6}}>Scheduled · counts from {tx.date}</T>}</View></Row>
  <H size={37} style={{marginBottom:20,color:['income','reimbursement'].includes(tx.type)?c.positive:c.text}}>{euro(tx.amount)}</H>
  {[['Date',tx.date],['Account',account?.name||'Unknown account'],...(tx.type==='transfer'?[['To account',state.accounts.find(a=>a.id===tx.toAccount)?.name]]:[['Category',cat.name],['Behaviour',tx.kind||cat.kind]])].map(([label,value])=><Row key={label} style={{justifyContent:'space-between',alignItems:'flex-start',gap:16,marginBottom:13}}><T style={{color:c.sub}}>{label}</T><T style={{flex:1,textAlign:'right'}}>{value}</T></Row>)}
  {!!tx.note&&<View style={{backgroundColor:c.soft,padding:15,borderRadius:15,marginVertical:10}}><T style={{color:c.sub,fontSize:12}}>Note</T><T style={{marginTop:6}}>{tx.note}</T></View>}
  {isPlannedCostLink(tx.plannedCost) && <T style={{ color: c.sub, marginBottom: 12 }}>
    Planned cost · {state.events.find(event => event.id === tx.plannedCost.eventId)?.name ?? 'Former planned cost'} · {tx.plannedCost.month}
  </T>}
  {tx.type==='expense'&&<ExpensePaybackSummary expense={tx} paybacks={paybacks}/>}
  {original&&linkRow(original,'Original expense')}{paybacks.received.map(t=>linkRow(t,'Payback received'))}{paybacks.scheduled.map(t=>linkRow(t,'Scheduled payback'))}
  {tx.type==='reimbursement'&&!original&&<T style={{fontSize:12,color:c.sub}}>Balance adjustment · excluded from income and net spending.</T>}
 </Dialog>;
}

// Paid back counts paybacks received by today; one dated later is scheduled
// and only reduces the net expense from its date (L01).
function ExpensePaybackSummary({ expense, paybacks }) {
  const colors = useContext(Theme);
  if (!paybacks.receivedTotal && !paybacks.scheduledTotal) {
    return null;
  }
  return <View style={{ backgroundColor: colors.soft, padding: 15, borderRadius: 15, marginVertical: 12 }}>
    {paybacks.receivedTotal > 0 && <Row style={{ justifyContent: 'space-between', gap: 12, marginBottom: 9 }}>
      <T>Paid back</T>
      <T testID="expense-paid-back">{euro(paybacks.receivedTotal)}</T>
    </Row>}
    {paybacks.scheduledTotal > 0 && <Row style={{ justifyContent: 'space-between', gap: 12, marginBottom: 9 }}>
      <T>Scheduled payback</T>
      <T testID="expense-scheduled-back">{euro(paybacks.scheduledTotal)}</T>
    </Row>}
    <Row style={{ justifyContent: 'space-between', gap: 12 }}>
      <T>Net expense</T>
      <T testID="expense-net" style={{ fontWeight: '700' }}>{euro(expense.amount - paybacks.receivedTotal)}</T>
    </Row>
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 9 }}>Attributed to {expenseReportingMonth(expense)}, even when the payback arrives later. A scheduled payback counts from its date.</T>
  </View>;
}
