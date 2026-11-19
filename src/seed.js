import {buildPlan,compoundSavings} from './engine.js';
import { k_currentStateVersion } from './stateSchema.js';
const k_examplePlanYear = 2026;
const k_exampleObservedMonth = 11;
const k_examplePlanId = 'plan-example-2026';
export const palette=['#E88A5B','#D99941','#C8A448','#45A2B2','#5B91C4','#8A88CC','#A084D0','#C47DA3','#C68C95','#A78669','#78989F','#8B819D'];
export function seed(){
 const categories=[
 {id:'home',name:'Home & bills',icon:'House',color:palette[0],kind:'Fixed',budget:88000},
 {id:'rent',name:'Rent',parentId:'home',icon:null,color:null,kind:null,budget:null},
 {id:'utilities',name:'Utilities',parentId:'home',icon:'Lightbulb',color:null,kind:null,budget:null},
 {id:'groceries',name:'Groceries',icon:'ShoppingBasket',color:palette[4],kind:'Variable',budget:30000},
 {id:'dining',name:'Food & coffee',icon:'Coffee',color:palette[2],kind:'Variable',budget:14000},
 {id:'transport',name:'Transport',icon:'TramFront',color:palette[6],kind:'Variable',budget:8000},
 {id:'fun',name:'Little joys',icon:'Gamepad2',color:palette[7],kind:'Variable',budget:8000},
 {id:'health',name:'Wellbeing',icon:'Heart',color:palette[3],kind:'Variable',budget:6000},
 {id:'subs',name:'Subscriptions',icon:'Repeat2',color:palette[5],kind:'Fixed',budget:3498},
 {id:'travel',name:'Travel & adventures',icon:'Plane',color:palette[1],kind:'Occasional',budget:0},
 {id:'shopping',name:'Shopping',icon:'ShoppingBag',color:palette[8],kind:'Occasional',budget:0},
 {id:'loan',name:'Loan payments',icon:'Landmark',color:palette[9],kind:'Fixed',budget:18500},
 {id:'salary',name:'Salary',icon:'BriefcaseBusiness',color:palette[3],kind:'Fixed',budget:0},
 {id:'interest',name:'Interest',icon:'Sprout',color:palette[2],kind:'Fixed',budget:0}];
 const accounts=[{id:'main',name:'Everyday',bank:'Personal account',tag:'Personal',icon:'Wallet',color:'#E69973',openingBalance:112440},
 {id:'joint',name:'Our account',bank:'Hugo & Marina',tag:'Joint',icon:'UsersRound',color:'#91A4CE',openingBalance:240000},
 {id:'savings',name:'Rainy day',bank:'3.00% annual interest',tag:'Savings',icon:'Sprout',color:'#91B6A9',openingBalance:420000,interest:3,interestStart:'2026-05'},
 {id:'invest',name:'Long game',bank:'Manual valuation',tag:'Investment',icon:'ChartNoAxesCombined',color:'#B3A0CA',openingBalance:186500,ticker:''}];
 const transactions=[];const add=(id,type,title,amount,date,category,account='main',extra={})=>transactions.push({id,type,title,amount,date,category,account,...extra});
 for(let m=5;m<=10;m++){
  const mm=`2026-${String(m).padStart(2,'0')}`,v=(m%3)*700;
  add(`salary-${m}`,'income','Monthly salary',245000,`${mm}-01`,'salary');
  add(`rent-${m}`,'expense','A place to call home',79500,`${mm}-02`,'rent');
  add(`bills-${m}`,'expense','Electricity & water',8300,`${mm}-05`,'utilities');
  add(`loan-${m}`,'expense','Car loan',18500,`${mm}-06`,'loan','main',{loanId:'car'});
  add(`food-${m}`,'expense','Groceries for the month',26500+v,`${mm}-12`,'groceries');
  add(`dining-${m}`,'expense','Coffee & dinners',11500+v,`${mm}-18`,'dining');
  add(`transport-${m}`,'expense','Getting around',6800,`${mm}-09`,'transport');
  add(`joy-${m}`,'expense','The good little things',4500+v,`${mm}-21`,'fun');
  add(`gym-${m}`,'expense','Gym membership',3500,`${mm}-04`,'health');
  add(`sub-${m}`,'expense','Digital subscriptions',3498,`${mm}-03`,'subs');
  add(`save-${m}`,'transfer','A little for later',30000,`${mm}-02`,null,'main',{toAccount:'savings'});
 }
 add('trip-jul','expense','A weekend in Porto',24000,'2026-07-17','travel');
 add('shared-oct','expense','Weekend train tickets',8600,'2026-10-23','transport','main',{note:'Tickets for Hugo & Marina'});
 add('reimb-nov','reimbursement','Marina · train tickets',4300,'2026-11-02','transport','main',{linkedId:'shared-oct',note:'Her half, linked to October'});
 add('salary-11','income','Monthly salary',245000,'2026-11-01','salary');
 add('rent-11','expense','A place to call home',79500,'2026-11-02','rent');
 add('save-11','transfer','A little for later',30000,'2026-11-02',null,'main',{toAccount:'savings'});
 add('gym-11','expense','Gym membership',3500,'2026-11-04','health');
 add('sub-11','expense','Digital subscriptions',3498,'2026-11-03','subs');
 add('bills-11','expense','Electricity & water',8300,'2026-11-05','utilities');
 add('loan-11','expense','Car loan',18500,'2026-11-06','loan','main',{loanId:'car'});
 add('groceries-11a','expense','Continente',6842,'2026-11-07','groceries');
 add('groceries-11b','expense','The weekly shop',5230,'2026-11-14','groceries');
 add('coffee-11','expense','A coffee kind of morning',480,'2026-11-17','dining');
 add('lunch-11','expense','Lunch with Marina',2850,'2026-11-16','dining','joint');
 add('game-11','expense','Something for the collection',3499,'2026-11-15','fun');
 add('transport-11','expense','Navegante pass',4000,'2026-11-01','transport');
 let state={version:k_currentStateVersion,demo:true,accounts,categories,transactions,loans:[{id:'car',name:'Car loan',remaining:610500,payment:18500,start:'2025-09',end:'2029-08',account:'main',original:888000}],theme:'light',preferences:{visibility:'shared',cushion:true},plans:{},events:[{id:'winter',name:'December celebrations',month:12,amount:30000}]};
 state=compoundSavings(state,'2026-11');
 return { ...state, plans: { [String(k_examplePlanYear)]: [createExamplePlan(state)] } };
}

// Example plan made at the beginning of the year, preserved as a frozen snapshot.
function createExamplePlan(state) {
  const examplePlan = buildPlan(state, { year: k_examplePlanYear, fromMonth: k_exampleObservedMonth, income: 245000, cushion: 12000 });
  const observedMonth = examplePlan.months[`${k_examplePlanYear}-${String(k_exampleObservedMonth).padStart(2, '0')}`];
  for (let monthNumber = 1; monthNumber < k_exampleObservedMonth; monthNumber += 1) {
    examplePlan.months[`${k_examplePlanYear}-${String(monthNumber).padStart(2, '0')}`] = JSON.parse(JSON.stringify(observedMonth));
  }
  return { ...examplePlan, id: k_examplePlanId, createdAt: '2026-01-01T12:00:00.000Z', revision: 1 };
}
