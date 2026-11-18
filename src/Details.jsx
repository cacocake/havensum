import React,{useContext} from 'react';
import {View} from 'react-native';
import {Theme,T,H,Row,Button,Badge,TileIcon,Card,Dialog,Divider,Empty} from './ui.jsx';
import {useApp} from './context.js';
import {euro,accountBalance,categorySettings} from './engine.js';
import {TransactionRow} from './Dashboard.jsx';
import Icon from './Icon';
import {Squish} from './Playful.jsx';
import { expenseReportingMonth, isPlannedCostLink } from './plannedCosts.js';

export function AccountDetail(){
 const {state,accountId,setScreen,setModal}=useApp(),c=useContext(Theme),account=state.accounts.find(a=>a.id===accountId);
 if(!account)return <Empty title="Account unavailable" description="Choose an account from More."/>;
 const rows=state.transactions.filter(t=>t.account===accountId||t.type==='transfer'&&t.toAccount===accountId).sort((a,b)=>b.date.localeCompare(a.date));
 const movement=rows.reduce((sum,t)=>sum+(t.type==='expense'||t.type==='transfer'&&t.account===accountId?-t.amount:t.amount),0);
 return <View style={{gap:20}}>
  <Row style={{justifyContent:'space-between',gap:8}}><Button small kind="soft" icon="ArrowLeft" onPress={()=>setScreen('Accounts')}>Accounts</Button><Button small kind="outline" icon="Pencil" onPress={()=>setModal({type:'account',item:account})}>Edit account</Button></Row>
  <Card style={{backgroundColor:c.peach,borderColor:'transparent'}}><Row style={{gap:12}}><TileIcon name={account.icon} color={account.color}/><View style={{flex:1}}><T>{account.tag} · recorded balance</T><H size={35} numberOfLines={1} adjustsFontSizeToFit>{euro(accountBalance(state,accountId))}</H></View></Row><Divider/>
   <Row style={{justifyContent:'space-between',gap:10}}><T style={{color:c.sub}}>Opening balance</T><T>{euro(account.openingBalance)}</T></Row><Row style={{justifyContent:'space-between',gap:10,marginTop:8}}><T style={{color:c.sub}}>All recorded movements</T><T>{movement>=0?'+':''}{euro(movement)}</T></Row>
   <T style={{fontSize:12,color:c.sub,marginTop:14}}>All dates, including future-dated entries. Transfers and paybacks change cash here, without becoming earnings.</T>
  </Card>
  <Card><H size={22}>Account activity</H><T style={{color:c.sub,fontSize:12,marginTop:5,marginBottom:12}}>All time · {rows.length} movements</T>{rows.length?rows.map((t,i)=><TransactionRow key={t.id} tx={t} last={i===rows.length-1} accountId={accountId}/>):<Empty title="Your ledger starts here" description="Add a transaction to record a movement."/>}</Card>
 </View>;
}

export function TransactionDetail({transactionId,onClose}){
 const {state,setModal}=useApp(),c=useContext(Theme),tx=state.transactions.find(t=>t.id===transactionId);
 if(!tx)return <Dialog title="Transaction unavailable" onClose={onClose}><T>This movement is no longer available.</T></Dialog>;
 const cat=categorySettings(state.categories,tx.category),account=state.accounts.find(a=>a.id===tx.account),original=state.transactions.find(t=>t.id===tx.linkedId),refunds=state.transactions.filter(t=>t.type==='reimbursement'&&t.linkedId===tx.id),refunded=refunds.reduce((s,t)=>s+t.amount,0);
 const linkRow=(t,label)=><Squish key={t.id} accessibilityLabel={`View ${t.title}`} onPress={()=>setModal({type:'transaction-detail',id:t.id})} style={{minHeight:56,paddingVertical:12,borderTopWidth:1,borderColor:c.line}}><Row style={{gap:10}}><Icon name="Link2" size={17} color={c.sub}/><View style={{flex:1,minWidth:0}}><T>{t.title}</T><T style={{fontSize:12,color:c.sub}}>{label} · {t.date}</T></View><Icon name="ChevronRight" size={16} color={c.sub}/></Row></Squish>;
 return <Dialog title="Transaction details" onClose={onClose} footer={<Button icon="Pencil" onPress={()=>setModal({type:'transaction',item:tx})}>Edit transaction</Button>}>
  <Row style={{gap:13,marginBottom:18}}><TileIcon name={tx.type==='transfer'?'ArrowLeftRight':cat.icon} color={cat.color} size={48}/><View style={{flex:1,minWidth:0}}><H size={24}>{tx.title}</H><Badge style={{marginTop:7}}>{tx.type==='reimbursement'?'Payback':tx.type}</Badge></View></Row>
  <H size={37} style={{marginBottom:20,color:['income','reimbursement'].includes(tx.type)?c.positive:c.text}}>{euro(tx.amount)}</H>
  {[['Date',tx.date],['Account',account?.name||'Unknown account'],...(tx.type==='transfer'?[['To account',state.accounts.find(a=>a.id===tx.toAccount)?.name]]:[['Category',cat.name],['Behaviour',tx.kind||cat.kind]])].map(([label,value])=><Row key={label} style={{justifyContent:'space-between',alignItems:'flex-start',gap:16,marginBottom:13}}><T style={{color:c.sub}}>{label}</T><T style={{flex:1,textAlign:'right'}}>{value}</T></Row>)}
  {!!tx.note&&<View style={{backgroundColor:c.soft,padding:15,borderRadius:15,marginVertical:10}}><T style={{color:c.sub,fontSize:12}}>Note</T><T style={{marginTop:6}}>{tx.note}</T></View>}
  {isPlannedCostLink(tx.plannedCost) && <T style={{ color: c.sub, marginBottom: 12 }}>
    Planned cost · {state.events.find(event => event.id === tx.plannedCost.eventId)?.name ?? 'Former planned cost'} · {tx.plannedCost.month}
  </T>}
  {tx.type==='expense'&&refunded>0&&<View style={{backgroundColor:c.soft,padding:15,borderRadius:15,marginVertical:12}}><Row style={{justifyContent:'space-between',gap:12}}><T>Paid back</T><T>{euro(refunded)}</T></Row><Row style={{justifyContent:'space-between',gap:12,marginTop:9}}><T>Net expense</T><T style={{fontWeight:'700'}}>{euro(tx.amount-refunded)}</T></Row><T style={{fontSize:12,color:c.sub,marginTop:9}}>Attributed to {expenseReportingMonth(tx)}, even when the payback arrives later.</T></View>}
  {original&&linkRow(original,'Original expense')}{refunds.map(t=>linkRow(t,'Payback received'))}
  {tx.type==='reimbursement'&&!original&&<T style={{fontSize:12,color:c.sub}}>Balance adjustment · excluded from income and net spending.</T>}
 </Dialog>;
}
