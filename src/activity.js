import {categorySettings,monthOf} from './engine.js';
export function categoryContains(categories,id,category){
 if(!id||id==='all')return true;
 const resolved=categorySettings(categories,category);
 return category===id||resolved.parentId===id;
}
export function selectTransactions(state,month,{type='all',account='all',category='all',search=''}={}){
 const query=search.trim().toLowerCase();
 return state.transactions.filter(t=>monthOf(t.date)===month&&(type==='all'||t.type===type)&&(account==='all'||t.account===account||t.toAccount===account)&&categoryContains(state.categories,category,t.category)&&`${t.title} ${t.note||''} ${categorySettings(state.categories,t.category).name}`.toLowerCase().includes(query)).sort((a,b)=>b.date.localeCompare(a.date));
}
