import test from 'node:test';
import assert from 'node:assert/strict';
import {planInsights} from '../src/planInsights.js';
import {selectTransactions} from '../src/activity.js';

test('cash activity keeps the posted month when filtering expenses and spending drill-down uses the occurrence month', () => {
  const state = { categories: [], transactions: [
    { id: 'deposit', title: 'Deposit', type: 'expense', date: '2027-03-01',
      plannedCost: { eventId: 'trip', month: '2027-11' } }
  ] };
  assert.deepEqual(selectTransactions(state, '2027-03').map(expense => expense.id), ['deposit']);
  assert.deepEqual(selectTransactions(state, '2027-03', { type: 'expense' }).map(expense => expense.id), ['deposit']);
  assert.deepEqual(selectTransactions(state, '2027-11', { type: 'expense', spending: true }).map(expense => expense.id), ['deposit']);
});
const legacyFixture=()=>({categories:[{id:'home',name:'Home',kind:'Fixed'},{id:'rent',parentId:'home',name:'Rent'},{id:'food',name:'Food',kind:'Variable'},{id:'fun',name:'Fun',kind:'Occasional'},{id:'loan',name:'Loan',kind:'Fixed'}],transactions:[{id:'rent',type:'expense',category:'rent',date:'2026-11-02',amount:80000,account:'a',title:'Rent'},{id:'food',type:'expense',category:'food',date:'2026-11-04',amount:10000,account:'a',title:'Food'},{id:'loan',type:'expense',category:'loan',date:'2026-11-03',amount:10000,account:'a',title:'Loan'},{id:'salary',type:'income',date:'2026-11-01',amount:200000,account:'a',title:'Salary'}],plan:{window:6,months:{'2026-11':{income:200000,expense:120000,balance:80000,loan:10000,cushion:10000,event:0,lines:[{category:'home',kind:'Fixed',amount:80000},{category:'food',kind:'Variable',amount:20000}]}}}});
function fixture() {
  const state = legacyFixture();
  state.transactions.push(
    { id: 'old-food', type: 'expense', category: 'food', date: '2026-10-04', amount: 20000 },
    { id: 'old-fun', type: 'expense', category: 'fun', date: '2026-10-04', amount: 10000 },
    { id: 'old-rent', type: 'expense', category: 'rent', title: 'Rent', account: 'a', date: '2026-10-02', amount: 80000 }
  );
  return state;
}

test('outlook adds remaining variable allowance without double-counting fixed costs or loans',()=>{const s=fixture(),before=structuredClone(s),v=planInsights(s,'2026-11','2026-11-15');assert.equal(v.forecast.expense,120000);assert.equal(v.forecast.balance,80000);assert.equal(v.forecast.variance,0);assert.deepEqual(s,before);});
test('extra variable expense lowers savings; transfers and unlinked adjustments do not inflate earnings',()=>{const s=fixture();s.transactions.push({id:'extra',type:'expense',category:'food',date:'2026-11-10',amount:3000},{id:'transfer',type:'transfer',date:'2026-11-05',amount:999999,account:'a',toAccount:'b'},{id:'adjust',type:'reimbursement',date:'2026-11-06',amount:999999,account:'a'});const v=planInsights(s,'2026-11','2026-11-15');assert.equal(v.forecast.balance,77000);assert.equal(v.forecast.variance,-3000);assert.equal(v.forecast.income,200000);});
test('linked paybacks offset original month; known future costs stay out of actual but raise the forecast floor',()=>{const s=fixture();s.transactions.push({id:'payback',type:'reimbursement',date:'2026-11-10',amount:2000,linkedId:'food'},{id:'future',type:'expense',category:'food',date:'2026-11-28',amount:50000});const v=planInsights(s,'2026-11','2026-11-15');assert.equal(v.actual.spent,98000);assert.equal(v.forecast.balance,42000);});
test('occasional cost replaces reserve up to its limit, with excess lowering forecast savings',()=>{const s=fixture();s.transactions.push({id:'fun',type:'expense',category:'fun',date:'2026-11-10',amount:15000});assert.equal(planInsights(s,'2026-11','2026-11-15').forecast.balance,75000);});
test('historical averages use completed recorded months, include net occasional spending, exclude missing months',()=>{const s=legacyFixture();s.transactions.push({id:'old',type:'expense',category:'fun',date:'2026-10-01',amount:10000},{id:'r',type:'reimbursement',linkedId:'old',date:'2026-11-10',amount:4000});const v=planInsights(s,'2026-11','2026-11-15');assert.equal(v.count,1);assert.equal(v.averages.spent,6000);assert.equal(v.categories.find(c=>c.id==='fun').average,6000);});
test('past results are recorded and prediction remains available without a target', () => {
  const state = fixture();
  assert.equal(planInsights(state, '2026-11', '2026-12-01').forecast.expense, 100000);
  state.plan = null;
  const insight = planInsights(state, '2026-11', '2026-11-15');
  assert.equal(insight.forecast.expense, 120000);
  assert.equal(insight.forecast.variance, null);
});
test('parent category drilldown includes child expenses and destination account filter includes inbound transfers',()=>{const s=fixture();assert.deepEqual(selectTransactions(s,'2026-11',{category:'home',type:'expense'}).map(t=>t.id),['rent']);s.transactions.push({id:'inbound',type:'transfer',title:'Transfer',date:'2026-11-02',account:'b',toAccount:'a',amount:5000});assert.ok(selectTransactions(s,'2026-11',{account:'a'}).some(t=>t.id==='inbound'));});
test('known future income is included once while future paybacks are not treated as received',()=>{const s=fixture();s.transactions.push({id:'bonus',type:'income',date:'2026-11-28',amount:5000},{id:'expected',type:'reimbursement',date:'2026-11-29',linkedId:'food',amount:5000});const v=planInsights(s,'2026-11','2026-11-15');assert.equal(v.actual.income,200000);assert.equal(v.forecast.income,205000);assert.equal(v.actual.spent,100000);assert.equal(v.forecast.balance,85000);});
