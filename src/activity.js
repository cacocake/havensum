import {categorySettings,monthOf} from './engine.js';
import { expenseReportingMonth } from './plannedCosts.js';
import { k_transactionTypes } from './domainConstants.js';
export function categoryContains(categories,id,category){
 if(!id||id==='all')return true;
 const resolved=categorySettings(categories,category);
 return category===id||resolved.parentId===id;
}
export function selectTransactions(state,month,{type='all',account='all',category='all',search=''}={}){
 const query=search.trim().toLowerCase();
 return state.transactions.filter(transaction => {
   if (type !== 'all' && transaction.type !== type) {
     return false;
   }
   const selectedMonth = type === k_transactionTypes.expense ? expenseReportingMonth(transaction) : monthOf(transaction.date);
   return selectedMonth === month
     && (account === 'all' || transaction.account === account || transaction.toAccount === account)
     && categoryContains(state.categories, category, transaction.category)
     && `${transaction.title} ${transaction.note || ''} ${categorySettings(state.categories, transaction.category).name}`.toLowerCase().includes(query);
 }).sort((first, second) => second.date.localeCompare(first.date));
}
