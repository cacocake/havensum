import React,{useState,useEffect,useRef} from 'react';
import {View,Pressable,ScrollView,useWindowDimensions,Platform,ActivityIndicator,StatusBar,BackHandler,SafeAreaView} from 'react-native';
import {Theme,light,dark,T,H,Row,Button,IB,Badge,Dialog} from './ui.jsx';
import Icon from './Icon';
import BrandMark from './BrandMark';
import {Squish,ConfettiNotice} from './Playful.jsx';
import {AppContext} from './context.js';
import {useInsets} from './insets';
import {useHavensumFonts} from './fonts';
import {upgradeCategoryVisuals} from './categoryVisuals.js';
import {seed} from './seed.js';
import {compoundSavings, monthOf} from './engine.js';
import {readState,writeState,readSavedLedgerCopy} from './storage';
import { downloadSavedLedgerCopy } from './files';
import Dashboard from './Dashboard.jsx';
import {Transactions,Accounts,Categories,Reimbursements,YearPlan,Loans,Settings} from './Screens.jsx';
import {AccountDetail,TransactionDetail} from './Details.jsx';
import {TransactionForm,CategoryForm,LoanForm,PlanForm} from './Forms.jsx';
import { AccountForm } from './AccountForm.jsx';
import MissingCategoryReview from './MissingCategoryReview.jsx';
import { applyCategoryReviewEdits, categoryReviewRows } from './categoryReview.js';
import { validateState } from './stateSchema.js';
const k_startupErrors = {
  unreadableData: {
    title: 'Stored data could not be read',
    description: 'Your saved data has been left untouched. Keep this browser or device data while recovering a verified backup.'
  },
  unavailableStorage: {
    title: 'Device storage is unavailable',
    description: 'The app could not access device storage. Check storage permissions or try again. Existing saved data has not been replaced.'
  }
};
const k_startupErrorLayout = { flex: 1, justifyContent: 'center', padding: 24, gap: 16 };
const nav=[['Overview','LayoutDashboard'],['Transactions','ArrowLeftRight'],['Accounts','Wallet'],['Categories','Shapes'],['Year Plan','CalendarRange'],['Reimbursements','Link2'],['Loans','Landmark']];
const descriptions={Overview:'A little clarity for your everyday.',Transactions:'The full story, one movement at a time.',Accounts:'Different pockets. One clear picture.',Categories:'A home for every little thing.', 'Year Plan':'Make room for what matters.',Reimbursements:'Because paybacks are not a pay rise.',Loans:'Small steps toward lighter days.',Settings:'Make yourself at home.'};
export default function App(){
 const [loadError, setLoadError] = useState(null);
 const [recoveryError, setRecoveryError] = useState('');
 const [categoryReviewOpen, setCategoryReviewOpen] = useState(false);
 const [categoryReviewEdits, setCategoryReviewEdits] = useState({});
 const [filters,setFilters]=useState({}),[searchFocus,setSearchFocus]=useState(0),[accountId,setAccountId]=useState(null),[pickerYear,setPickerYear]=useState(null);
 const searchRequest=useRef(0);
 const [fontsLoaded]=useHavensumFonts();const insets=useInsets();const scrollRef=useRef(null);
 const [state,setState]=useState(null),[screen,setScreen]=useState('Overview'),[month,setMonth]=useState(new Date().toISOString().slice(0,7)),[modal,setModal]=useState(null),[toast,setToast]=useState(''),[search,setSearch]=useState(''),[mobileMenu,setMobileMenu]=useState(false),[monthOpen,setMonthOpen]=useState(false),[saveError,setSaveError]=useState(false);const {width}=useWindowDimensions(),wide=width>=1130,desktop=width>=850,c=state?.theme==='dark'?dark:light;
 async function loadStoredState() {
   setLoadError(null);
   setRecoveryError('');
   let savedState;
   try {
     savedState = await readState();
   } catch (error) {
     const failure = error instanceof SyntaxError ? k_startupErrors.unreadableData : k_startupErrors.unavailableStorage;
     setLoadError(failure);
     return;
   }
   try {
     const currentMonth = monthOf(new Date().toISOString());
     const initialState = savedState || seed();
     setState(upgradeCategoryVisuals(compoundSavings(initialState, currentMonth)));
     setCategoryReviewOpen(Boolean(initialState.migrationCategoryWarnings?.length));
   } catch {
     // An invalid saved structure must not be replaced with sample state either.
     setLoadError(k_startupErrors.unreadableData);
   }
 }
 function acceptMigratedCategories() {
   try {
     const reviewed = applyCategoryReviewEdits(state, migrationCategoryRows, categoryReviewEdits);
     delete reviewed.migrationCategoryWarnings;
     validateState(reviewed);
     setState(reviewed);
     setCategoryReviewOpen(false);
   } catch (error) {
     setToast(error.message);
   }
 }
 async function exportSavedLedger() {
   setRecoveryError('');
   try {
     const encodedLedger = await readSavedLedgerCopy();
     if (encodedLedger === null) {
       setRecoveryError('No saved ledger copy is available.');
       return;
     }
     await downloadSavedLedgerCopy(encodedLedger);
   } catch {
     setRecoveryError('The saved ledger copy could not be downloaded.');
   }
 }
 useEffect(() => { loadStoredState(); }, []);
 useEffect(()=>{if(state)writeState(state).then(()=>setSaveError(false)).catch(()=>setSaveError(true))},[state]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4200);return()=>clearTimeout(timer)},[toast]);
 useEffect(() => {
   if (Platform.OS !== 'web') {
     return;
   }
   document.body.style.background = c.bg;
   document.title = `Havensum · ${screen}`;
 }, [c, screen]);
 useEffect(()=>{scrollRef.current?.scrollTo({y:0,animated:false})},[screen,accountId,month]);
 useEffect(()=>{if(Platform.OS==='web')return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(screen==='Overview')return false;navigate(screen==='Account detail'?'Accounts':'Overview');return true});return()=>sub.remove()},[screen]);
 function navigate(s){setSearchFocus(0);if(s===screen)scrollRef.current?.scrollTo({y:0,animated:false});setScreen(s);setMobileMenu(false);if(s==='Transactions')setFilters({});}
 function openActivity(next={}){setSearchFocus(0);setFilters(next);setSearch('');setScreen('Transactions');setMobileMenu(false);scrollRef.current?.scrollTo({y:0,animated:false});}
 function openAccount(id){setAccountId(id);setScreen('Account detail');setMobileMenu(false);scrollRef.current?.scrollTo({y:0,animated:false});}
 function startSearch(){openActivity();setSearchFocus(++searchRequest.current);}
 const moreSelected=!['Overview','Transactions','Year Plan'].includes(screen);
 const migrationCategoryRows = state ? categoryReviewRows(state, state.migrationCategoryWarnings ?? []) : [];
 const selected=n=>n==='More'?moreSelected:screen===n;
 if (loadError) {
   return (
     <Theme.Provider value={c}>
       <View accessibilityRole="alert" style={{ ...k_startupErrorLayout, backgroundColor: c.bg }}>
         <H>{loadError.title}</H>
         <T>{loadError.description}</T>
         <Button onPress={loadStoredState}>Retry loading</Button>
         <Button kind="outline" onPress={exportSavedLedger}>Download saved ledger copy</Button>
         {Boolean(recoveryError) && <T accessibilityRole="alert">{recoveryError}</T>}
       </View>
     </Theme.Provider>
   );
 }
 if (!state || !fontsLoaded) {
   return (
     <Theme.Provider value={c}>
       <View style={{flex:1,minHeight:600,backgroundColor:c.bg,alignItems:'center',justifyContent:'center',gap:20}}>
         <H size={42}>havensum</H>
         <ActivityIndicator color={c.accent}/>
       </View>
     </Theme.Provider>
   );
 }
 const ctx={state,setState,screen,setScreen:navigate,month,setMonth,modal,setModal,notify:setToast,wide,desktop,search,setSearch,filters,setFilters,searchFocus,openActivity,openAccount,accountId};const Content={Overview:Dashboard,'Account detail':AccountDetail,Transactions,Accounts,Categories,'Year Plan':YearPlan,Reimbursements,Loans,Settings}[screen];
 const navItem=([label,icon])=><Pressable accessibilityRole="button" accessibilityState={{selected:screen===label}} key={label} onPress={()=>navigate(label)} style={{flexDirection:'row',alignItems:'center',gap:13,paddingVertical:12,paddingHorizontal:16,borderRadius:10,marginBottom:5,backgroundColor:screen===label?c.nav:'transparent'}}><Icon name={icon} size={18} color={screen===label?c.peachText:c.sub}/><T style={{fontSize:12.5,color:screen===label?c.peachText:c.sub,fontWeight:screen===label?'600':'400'}}>{label}</T>{screen===label&&<View style={{width:5,height:5,borderRadius:5,backgroundColor:c.accent,marginLeft:'auto'}}/>}</Pressable>;
 const Sidebar=()=> <View style={{width:223,backgroundColor:c.card,borderRightWidth:1,borderColor:c.line,padding:20,paddingTop:32,height:'100%',minHeight:700}}><Row style={{gap:5,marginBottom:7}}><BrandMark size={30}/><H size={26} style={{letterSpacing:-.7}}>havensum</H></Row><T style={{fontSize:8.3,letterSpacing:1.65,color:c.muted,paddingLeft:14,marginBottom:44}}>A CALM HOME FOR YOUR MONEY</T><T style={{fontSize:9,letterSpacing:1.1,color:c.muted,paddingLeft:16,marginBottom:13}}>YOUR EVERYDAY</T>{nav.slice(0,4).map(navItem)}<T style={{fontSize:9,letterSpacing:1.1,color:c.muted,paddingLeft:16,marginTop:28,marginBottom:13}}>THE BIGGER PICTURE</T>{nav.slice(4).map(navItem)}<View style={{flex:1,minHeight:35}}/><View style={{padding:15,backgroundColor:c.cream,borderRadius:13,marginBottom:20,gap:7}}><Icon name="Flower2" size={22} color={c.accent}/><T style={{fontSize:12,fontWeight:'500'}}>Good with money.{'\n'}Gentle with yourself.</T><T style={{fontSize:10,color:c.sub,lineHeight:16}}>A little awareness goes a long way.</T></View>{navItem(['Settings','Settings2'])}<Row style={{borderTopWidth:1,borderColor:c.line,marginTop:13,paddingTop:20,gap:10,paddingHorizontal:5}}><View style={{width:34,height:34,borderRadius:11,backgroundColor:c.peach,alignItems:'center',justifyContent:'center'}}><T style={{fontSize:12,color:c.peachText,fontWeight:'600'}}>HM</T></View><View style={{flex:1}}><T style={{fontSize:11.5,fontWeight:'500'}}>Hugo & Marina</T><Row style={{gap:4}}><View style={{width:4,height:4,borderRadius:3,backgroundColor:c.muted}}/><T style={{fontSize:9,color:c.muted}}>On this device</T></Row></View><IB size={15} name={state.theme==='dark'?'Sun':'Moon'} label="Toggle theme" onPress={()=>setState(s=>({...s,theme:s.theme==='dark'?'light':'dark'}))}/></Row></View>;
 const d=new Date(month+'-01T12:00:00');
 return <Theme.Provider value={c}><AppContext.Provider value={ctx}><SafeAreaView style={{flex:1,backgroundColor:c.bg,paddingTop:insets.top,paddingBottom:insets.bottom}}><StatusBar barStyle={c.dark?'light-content':'dark-content'} backgroundColor={c.bg}/><View style={{flex:1,minHeight:Platform.OS==='web'?'100vh':undefined,backgroundColor:c.bg,flexDirection:'row'}}>
 {desktop&&<View style={{width:223,height:Platform.OS==='web'?'100vh':'100%',position:Platform.OS==='web'?'sticky':'relative',top:0}}><Sidebar/></View>}
 <ScrollView ref={scrollRef} style={{flex:1}} contentContainerStyle={{paddingHorizontal:desktop?36:16,paddingTop:desktop?31:13,paddingBottom:desktop?25:112,maxWidth:1500,width:'100%',alignSelf:'center'}}>
 <Row style={{justifyContent:'space-between',borderBottomWidth:desktop?1:0,borderColor:c.line,paddingBottom:desktop?23:3,marginBottom:desktop?29:9,gap:15}}><Row style={{gap:12}}>{!desktop&&<BrandMark size={32}/>}<T style={{fontFamily:desktop?'DM Sans':'Fredoka',fontSize:desktop?12.5:26,color:desktop?c.sub:c.text}}>{desktop?'Your everyday, a little more in tune.':'havensum'}</T></Row><Row style={{gap:11}}>{desktop&&<><Badge color={c.peachText}>{state.demo?'EXAMPLE DATA':'LOCAL DATA'}</Badge><View style={{width:1,height:20,backgroundColor:c.line,marginHorizontal:5}}/></>}<IB name="Search" size={18} label="Search transactions" onPress={startSearch}/><IB name={c.dark?'Sun':'Moon'} size={18} label="Toggle theme" onPress={()=>setState(s=>({...s,theme:s.theme==='dark'?'light':'dark'}))}/></Row></Row>
 <Row style={{justifyContent:'space-between',marginBottom:desktop?26:19,gap:12,flexWrap:'wrap',alignItems:'flex-end'}}><View style={{flex:desktop?undefined:1,minWidth:0}}>{desktop&&<T style={{fontSize:9.5,letterSpacing:1.8,color:c.muted,marginBottom:6}}>{screen==='Overview'?'LET’S MAKE SENSE OF THINGS':'A CALM HOME FOR YOUR MONEY'}</T>}<H size={desktop?32:30}>{screen==='Overview'?'Hey, Hugo.':screen==='Account detail'?(state.accounts.find(a=>a.id===accountId)?.name||'Account'):screen==='Settings'?(desktop?'Your little preferences':'Settings'):!desktop&&screen==='Reimbursements'?'Paybacks':screen}</H>{desktop&&<T style={{fontSize:12,color:c.sub,marginTop:7}}>{descriptions[screen]}</T>}{!desktop&&state.demo&&<T style={{fontSize:10,color:c.sub,marginTop:3}}>Example data · yours to explore</T>}</View><Row style={{gap:10}}><Pressable accessibilityRole="button" accessibilityLabel="Choose month" onPress={()=>{setPickerYear(Number(month.slice(0,4)));setMonthOpen(true)}} style={{minHeight:48,paddingHorizontal:12,paddingVertical:12,borderRadius:17,backgroundColor:c.card,borderWidth:1,borderColor:c.line}}><Row style={{gap:9}}><Icon name="CalendarDays" size={15} color={c.sub}/><T style={{fontSize:11.5}}>{d.toLocaleString('en',{month:desktop?'long':'short',year:'numeric'})}</T><Icon name="ChevronDown" size={13} color={c.sub}/></Row></Pressable>{desktop&&!['Settings'].includes(screen)&&<Button small={!desktop} icon="Plus" onPress={()=>state.accounts.length?setModal({type:'transaction'}):setModal({type:'account'})}>Add transaction</Button>}</Row></Row>
 {saveError&&<T accessibilityRole="alert" style={{color:c.negative,fontSize:12,marginBottom:15}}>Changes could not be saved on this device. Export a backup before closing.</T>}
 {Boolean(state.migrationCategoryWarnings?.length) && !categoryReviewOpen && (
   <Button small kind="outline" onPress={() => setCategoryReviewOpen(true)}>Review missing categories</Button>
 )}
 <View><Content/></View>
 </ScrollView>
 {!desktop&&<View style={{position:'absolute',bottom:insets.bottom,left:0,right:0,paddingTop:10,paddingBottom:12,backgroundColor:c.card,borderTopWidth:1,borderColor:c.line,borderTopLeftRadius:24,borderTopRightRadius:24,boxShadow:'0 -5px 25px #44334d09',flexDirection:'row',alignItems:'center',justifyContent:'space-around'}}>{[nav[0],nav[1],['Add','Plus'],nav[4],['More','Menu']].map(([n,i])=>n==='Add'?<Squish key={n} accessibilityLabel="Add transaction" onPress={()=>state.accounts.length?setModal({type:'transaction'}):setModal({type:'account'})} style={{width:54,height:54,borderRadius:20,backgroundColor:c.accent,alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px #D8896135'}}><Icon name="Plus" size={27} color={c.buttonInk}/></Squish>:<Squish key={n} accessibilityLabel={n==='Overview'?'Home':n} onPress={()=>n==='More'?setMobileMenu(true):navigate(n)} accessibilityState={{selected:selected(n)}} aria-pressed={selected(n)} style={{flex:1,maxWidth:80,minWidth:0,minHeight:55,alignItems:'center',justifyContent:'center',gap:4}}><View style={{paddingHorizontal:14,paddingVertical:5,borderRadius:14,backgroundColor:selected(n)?c.nav:'transparent'}}><Icon name={i} size={21} color={selected(n)?c.accent:c.sub}/></View><T numberOfLines={1} style={{fontSize:10,color:selected(n)?c.peachText:c.sub}}>{n==='Overview'?'Home':n==='Transactions'?'Activity':n==='Year Plan'?'Plan':n}</T></Squish>)}</View>}

 </View>
 {modal?.type==='transaction'&&<TransactionForm key={modal.item?.id||modal.initialType||'new'} item={modal.item} initialType={modal.initialType} draft={modal.loan?{title:modal.loan.name,amount:modal.loan.payment,account:modal.loan.account,category:'loan',loanId:modal.loan.id}:null} onClose={()=>setModal(null)}/>}
 {modal?.type==='category'&&<CategoryForm item={modal.item} onClose={()=>setModal(null)}/>}{modal?.type==='account'&&<AccountForm item={modal.item} onClose={()=>setModal(null)}/>}{modal?.type==='loan'&&<LoanForm item={modal.item} onClose={()=>setModal(null)}/>}{modal?.type==='plan'&&<PlanForm onClose={()=>setModal(null)}/>}
 {modal?.type==='transaction-detail'&&<TransactionDetail transactionId={modal.id} onClose={()=>setModal(null)}/>}
 {categoryReviewOpen && (
   <Dialog title="Review your migrated transactions" onClose={() => setCategoryReviewOpen(false)}>
     <MissingCategoryReview rows={migrationCategoryRows} categories={state.categories} edits={categoryReviewEdits}
       onChange={(key, edit) => setCategoryReviewEdits(previous => ({ ...previous, [key]: { ...previous[key], ...edit } }))} />
     <Button onPress={acceptMigratedCategories}>Accept reviewed categories</Button>
   </Dialog>
 )}
 {mobileMenu&&<Dialog title="More" onClose={()=>setMobileMenu(false)}>{[nav[2],nav[3],nav[5],nav[6],['Settings','Settings2']].map(navItem)}</Dialog>}
 {monthOpen&&<Dialog title="A moment in time" onClose={()=>setMonthOpen(false)} width={360}><Row style={{justifyContent:'space-between',marginBottom:20}}><IB name="ChevronLeft" label="Previous year" onPress={()=>setPickerYear(y=>y-1)}/><H size={23}>{pickerYear}</H><IB name="ChevronRight" label="Next year" onPress={()=>setPickerYear(y=>y+1)}/></Row><Row style={{flexWrap:'wrap',gap:8}}>{Array.from({length:12},(_,i)=><Pressable key={i} accessibilityRole="button" onPress={()=>{setMonth(`${pickerYear}-${String(i+1).padStart(2,'0')}`);setMonthOpen(false)}} style={{width:'30%',alignItems:'center',paddingVertical:13,borderRadius:10,backgroundColor:pickerYear===Number(month.slice(0,4))&&i+1===Number(month.slice(5,7))?c.peach:c.soft}}><T style={{fontSize:12}}>{new Date(2026,i,1).toLocaleString('en',{month:'short'})}</T></Pressable>)}</Row></Dialog>}
 {!!toast&&<View accessibilityRole="alert" style={{position:'absolute',bottom:desktop?25:99+insets.bottom,alignSelf:'center',left:desktop?240:18,right:18,alignItems:'center',pointerEvents:'none'}}><ConfettiNotice message={toast}/></View>}
 </SafeAreaView></AppContext.Provider></Theme.Provider>;
}
