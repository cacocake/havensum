import { longMonthLabel } from './monthLabels.js';
import React,{useContext,useEffect,useState} from 'react';
import {View} from 'react-native';
import {useApp} from './context.js';
import {Theme,T,H,Row,Button,Badge,Card,Empty,TileIcon} from './ui.jsx';
import Icon from './Icon';
import {Squish} from './Playful.jsx';
import {Meter} from './Motion';
import {euro,driftAlerts} from './engine.js';
import {signedEuro} from './money.js';
import YearOutlook from './YearOutlook.jsx';
import {planInsights} from './planInsights.js';
import ExpectedCosts from './ExpectedCosts.jsx';
import OutlookSettings from './OutlookSettings.jsx';
import MonthComparison from './MonthComparison.jsx';
import { k_planRevisionStartKinds, latestPlan, planRevisionStart, planRevisions, selectedPlan } from './planArchive.js';
import { localDateOfTimestamp, monthOf, yearOfMonth } from './calendar.js';
import { planInvitationYear } from './planInvitation.js';
import { readPlanInvitationDeferral, writePlanInvitationDeferral } from './storage';
import { k_defaultHistoryWindow } from './domainConstants.js';
const dateName=m=>new Date(m+'-01T12:00:00').toLocaleString('en',{month:'long',year:'numeric'});
export default function PlanScreen(){
 const {state,month,today,setMonth,setModal,openActivity,notify}=useApp(),c=useContext(Theme),[tab,setTab]=useState('This month');
 const year=yearOfMonth(month),isPastYear=planRevisionStart(year,month,today).kind===k_planRevisionStartKinds.readOnly;
 const [revisionSelection,setRevisionSelection]=useState({year:null,id:null});
 // A chosen earlier revision applies only to its own year; other years show their latest snapshot.
 const planRevisionId=revisionSelection.year===year?revisionSelection.id:null;
 const shownPlan=selectedPlan(state,year,planRevisionId);
 const viewingEarlierRevision=Boolean(shownPlan)&&shownPlan.id!==latestPlan(state,year)?.id;
 const info=planInsights(state,month,today,{planRevisionId}),{plan,actual,forecast}=info,alerts=driftAlerts(state,month,today);
 const ink={plan:c.dark?'#CDB9F2':'#7861A3',actual:c.dark?'#9EC5EB':'#39739D',forecast:c.dark?'#F2CB89':'#97601D'};
 const revise=()=>isPastYear?notify('Past years stay frozen. Choose this year or a future year.'):setModal({type:'plan'});
 const variance=forecast?.variance||0,positive=variance>=0;
 const tabs=['This month','Averages','Year ahead'];
 return <View style={{gap:19}}>
  <PlanInvitation/>
  <Row style={{backgroundColor:c.soft,borderRadius:19,padding:4,gap:3}}>{tabs.map(name=><Squish key={name} accessibilityLabel={`Plan ${name}`} accessibilityState={{selected:tab===name}} onPress={()=>setTab(name)} style={{flex:1,minHeight:49,alignItems:'center',justifyContent:'center',padding:5,borderRadius:15,backgroundColor:tab===name?c.card:'transparent'}}><T style={{fontSize:12,fontWeight:tab===name?'700':'500',textAlign:'center',color:tab===name?c.text:c.sub}}>{name}</T></Squish>)}</Row>
  {tab==='This month'&&<>
  {forecast?<Card style={{padding:23,backgroundColor:c.cream,borderColor:'transparent',overflow:'hidden'}}>
   <Row style={{justifyContent:'space-between',gap:10,marginBottom:13}}><Badge color={ink.forecast}>{info.period==='past'?'RECORDED RESULT':forecast.partial?'PARTIAL ESTIMATE':'EXPECTED SAVINGS'}</Badge><Icon name={info.period==='past'?'Check':'ChartNoAxesCombined'} size={23} color={ink.forecast}/></Row>
   <T style={{fontSize:14,color:c.sub}}>{info.period==='past'?'Recorded savings':'Expected savings'}</T>
   <H testID="expected-savings-amount" size={32} style={{marginTop:6,color:forecast.balance<0?c.negative:ink.forecast}}>{signedEuro(forecast.balance)}</H>
   {plan&&<Row style={{gap:7,marginTop:12,flexWrap:'wrap'}}><Icon name={positive?'ArrowUpRight':'ArrowDownRight'} size={19} color={positive?c.positive:c.negative}/><T style={{color:positive?c.positive:c.negative,fontWeight:'600'}}>{variance===0?'Matches planned savings':`${euro(Math.abs(variance))} ${positive?'above':'below'} planned savings`}</T></Row>}
   <T style={{color:c.sub,fontSize:12,marginTop:11}}>{info.period==='past'?'Income minus received net expenses. Late linked paybacks can update this result.':`${dateName(month)} · ${forecast.partial?'Partial estimate: history has not been confirmed complete.':'Estimate from confirmed history.'} Based on ${forecast.historyMonths.length} historical months, recorded activity and independent obligations.`}</T>
  </Card>:<Card style={{backgroundColor:c.cream,borderColor:'transparent'}}><Icon name="CalendarRange" size={29} color={ink.plan}/><H size={27} style={{marginTop:12}}>Not enough history</H><T style={{color:c.sub,marginTop:10,marginBottom:18}}>Record activity or add known income and obligations to estimate savings. A frozen target is optional.</T><Button onPress={revise}>Build this year’s plan</Button></Card>}
  </>}
  {tab==='This month'&&<View style={{gap:18}}>
   <OutlookSettings month={month}/>
   <MonthComparison actual={actual} plan={plan} prediction={forecast} ink={ink}/>
   {plan&&<Card style={{padding:19}}><Row style={{justifyContent:'space-between',gap:10}}><H size={22} style={{flex:1}}>Spending against plan</H><Icon name="ChartNoAxesCombined" size={21} color={ink.actual}/></Row><Row style={{justifyContent:'space-between',gap:10,marginTop:15,marginBottom:12}}><T style={{color:ink.actual}}>{euro(actual.spent)} recorded</T><T style={{color:ink.plan}}>{euro(plan.expense)} plan</T></Row><Meter value={plan.expense>0?actual.spent/plan.expense:actual.spent?1:0} color={actual.spent>plan.expense?c.negative:ink.actual} track={c.soft}/><T style={{fontSize:12,color:c.sub,marginTop:13}}>{actual.spent>plan.expense?`${euro(actual.spent-plan.expense)} over the full-month plan`:`${euro(plan.expense-actual.spent)} left in the full-month plan`}</T><Button kind="soft" style={{marginTop:16}} onPress={()=>openActivity({type:'expense'})}>Inspect this month’s expenses</Button></Card>}
   {forecast&&info.period!=='past'&&<ExpectedCosts prediction={forecast} month={month}/>}
   <Card style={{padding:19,borderColor:ink.plan}}><Row style={{gap:9}}><Icon name="LockKeyhole" size={18} color={ink.plan}/><H size={21}>Your frozen plan</H></Row><T style={{fontSize:12,color:c.sub,marginTop:10,marginBottom:16}}>{shownPlan?`${year} · revision ${shownPlan.revision} · ${localDateOfTimestamp(shownPlan.createdAt)??'date not recorded'}.`:`No approved plan for ${year}.`} Only an approved revision changes future months.</T>{shownPlan?.loanRestatedFrom&&<T testID="loan-restated-note" style={{fontSize:12,color:c.sub,marginTop:-8,marginBottom:16}}>{`This revision restated loan payments from ${longMonthLabel(shownPlan.loanRestatedFrom)}, including passed months; earlier revisions keep their figures.`}</T>}{viewingEarlierRevision&&<Badge color={ink.plan} style={{marginBottom:12}}>EARLIER REVISION · READ-ONLY</Badge>}<PlanRevisionPicker revisions={planRevisions(state,year)} shownId={shownPlan?.id} onSelect={id=>setRevisionSelection({year,id})} color={ink.plan}/>{shownPlan&&<T style={{fontSize:12,color:c.sub,marginBottom:16}}>{shownPlan.window||k_defaultHistoryWindow}-month variable history · fixed tolerance ±{euro(shownPlan.tolerance??200)} · review at {Math.round((shownPlan.drift??.3)*100)}% drift for 2 months.</T>}{isPastYear?<T style={{fontSize:12,color:c.sub}}>Past years stay read-only.</T>:<Button kind="outline" icon="SlidersHorizontal" onPress={revise}>{latestPlan(state,year)?'Revise remaining year':'Build a plan'}</Button>}{alerts.length>0&&<T style={{color:c.accentText,fontSize:12,marginTop:12}}>Review suggested: {alerts.map(a=>a.category).join(', ')}. No changes have been applied.</T>}</Card>
  </View>}
  {tab==='Averages'&&<View style={{gap:18}}><Card style={{padding:20}}><H size={25}>Your real monthly averages</H><T style={{fontSize:12,color:c.sub,marginTop:8}}>{info.count?`${info.count} recorded months in ${dateName(info.history[0])}–${dateName(info.history.at(-1))}. ${info.partial?'Unconfirmed history: partial estimate.':'Owner-confirmed complete months.'}`:'No completed months with entries in this history window.'}</T>
    {[['Income',info.averages.income],['Net spending',info.averages.spent],['Savings',info.averages.balance]].map(([label,value])=><Row key={label} style={{justifyContent:'space-between',gap:12,marginTop:19}}><T>{label}</T><H size={25} style={{color:ink.actual}}>{value==null?'—':euro(value)}</H></Row>)}<T style={{fontSize:12,color:c.sub,marginTop:20}}>Only confirmed months are used when available, including months with no activity. Otherwise recorded history supports a partial estimate.</T>
   </Card><Card style={{padding:19}}><H size={22}>Average spending by category</H><T style={{fontSize:12,color:c.sub,marginTop:8,marginBottom:10}}>Observed history, including occasional costs. The plan uses fixed baselines, variable averages and a separate cushion.</T>{info.categories.filter(cat=>cat.average>0).map(cat=><Row key={cat.id} style={{gap:11,paddingVertical:14,borderBottomWidth:1,borderColor:c.line}}><TileIcon name={cat.icon} color={cat.color} size={35}/><View style={{flex:1}}><T>{cat.name}</T><T style={{color:c.sub,fontSize:12}}>{cat.kind}</T></View><T style={{color:ink.actual,fontWeight:'600'}}>{euro(cat.average)}</T></Row>)}{!info.count&&<Empty title="Averages need history" description="Record or import completed months to build a useful baseline."/>}</Card></View>}
  {tab==='Year ahead'&&<YearOutlook year={year} selectedMonth={month} planRevisionId={planRevisionId} ink={ink} onSelectMonth={selected=>{setMonth(selected);setTab('This month')}}/>}
 </View>;
}

function PlanRevisionPicker({ revisions, shownId, onSelect, color }) {
  const colors = useContext(Theme);
  if (revisions.length < 2) {
    return null;
  }
  return <Row style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
    {revisions.map(revision => {
      const isShown = revision.id === shownId;
      return <Squish key={revision.id} accessibilityLabel={`Show plan revision ${revision.revision}`} accessibilityState={{ selected: isShown }} onPress={() => onSelect(revision.id)} style={{ minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: isShown ? color : colors.line, backgroundColor: isShown ? colors.soft : 'transparent' }}>
        <T style={{ fontSize: 12, color: isShown ? colors.text : colors.sub }}>Revision {revision.revision}</T>
      </Squish>;
    })}
  </Row>;
}

const k_deferralNotSavedMessage = 'Hidden for now. This device could not remember the choice, so the invitation may return.';

// Offers the yearly interview when the current year has no plan. Later hides it
// for this calendar year on this installation; no financial record changes.
function PlanInvitation() {
  const { state, today, setMonth, setModal, notify } = useApp();
  const colors = useContext(Theme);
  const [deferral, setDeferral] = useState({ loaded: false, year: null });
  useEffect(() => {
    let active = true;
    async function loadDeferral() {
      let year = null;
      try {
        year = await readPlanInvitationDeferral();
      } catch {
        // Without a readable preference, offering the invitation is the safe default.
      }
      if (!active) {
        return;
      }
      setDeferral({ loaded: true, year });
    }
    loadDeferral();
    return () => {
      active = false;
    };
  }, []);
  if (!deferral.loaded) {
    return null;
  }
  const invitedYear = planInvitationYear(state, { today, deferredYear: deferral.year });
  if (invitedYear === null) {
    return null;
  }
  function startInterview() {
    setMonth(monthOf(today));
    setModal({ type: 'plan' });
  }
  async function deferInterview() {
    // Hide it for this session either way; only the saved choice can fail.
    setDeferral({ loaded: true, year: invitedYear });
    try {
      await writePlanInvitationDeferral(invitedYear);
      notify(`Plan invitation hidden for ${invitedYear}. You can still build a plan any time.`);
    } catch {
      notify(k_deferralNotSavedMessage);
    }
  }
  return <Card testID="plan-invitation" style={{ padding: 21, backgroundColor: colors.soft, borderColor: 'transparent' }}>
    <Row style={{ gap: 9 }}><Icon name="Sparkles" size={18} color={colors.accentText}/><H size={21} style={{ flex: 1 }}>Ready to plan {invitedYear}?</H></Row>
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 10, marginBottom: 16 }}>A short three-step interview builds a draft from your history. Nothing is saved until you freeze it.</T>
    <Row style={{ gap: 10, flexWrap: 'wrap' }}>
      <Button small icon="ArrowRight" onPress={startInterview}>Start the {invitedYear} interview</Button>
      <Button small kind="soft" onPress={deferInterview} accessibilityLabel={`Ask me later in ${invitedYear}`}>Later</Button>
    </Row>
  </Card>;
}
