import React,{useState,useContext} from 'react';
import {View,useWindowDimensions,Keyboard} from 'react-native';
import {Theme,T,H,Row,TileIcon,Field,Dialog} from './ui.jsx';
import Icon from './Icon';
import {Squish} from './Playful.jsx';
import {categorySettings} from './engine.js';
export default function CategorySelect({label='Category',value,onChange,categories}){
 const c=useContext(Theme),{width}=useWindowDimensions(),[open,setOpen]=useState(false),[search,setSearch]=useState(''),current=categorySettings(categories,value);
 const choices=categories.filter(cat=>(cat.name+' '+(cat.parentId?categorySettings(categories,cat.parentId).name:'')).toLowerCase().includes(search.toLowerCase()));
 return <View style={{marginBottom:17,gap:7,minWidth:0}}><T style={{fontSize:12,fontWeight:'600',color:c.sub}}>{label}</T>
  <Squish accessibilityLabel={label} onPress={()=>{Keyboard.dismiss();setOpen(true)}} style={{flexDirection:'row',alignItems:'center',gap:10,padding:10,borderWidth:1,borderColor:current.color+'55',borderRadius:16,minHeight:56,backgroundColor:c.dark?current.color+'18':current.color+'10'}}><TileIcon name={current.icon} color={current.color} size={33}/><T numberOfLines={1} style={{flex:1,minWidth:0,fontSize:14}}>{current.name}</T><Icon name="ChevronDown" size={16} color={c.sub}/></Squish>
  {open&&<Dialog title="Pick a category" subtitle="Every little thing has its place." onClose={()=>setOpen(false)} width={520}>
   <Field label="Search categories" placeholder="Coffee, groceries, home…" value={search} onChangeText={setSearch}/>
   <Row style={{flexWrap:'wrap',gap:9,alignItems:'stretch'}}>{choices.map(cat=>{const x=categorySettings(categories,cat.id),selected=cat.id===value;return <Squish key={cat.id} accessibilityLabel={`Choose ${cat.name}`} accessibilityState={{selected}} aria-pressed={selected} onPress={()=>{onChange(cat.id);setOpen(false);setSearch('')}} style={{width:width<350?'48%':'31%',minHeight:106,borderRadius:20,padding:10,backgroundColor:c.dark?x.color+'1C':x.color+'17',borderWidth:selected?2:1,borderColor:selected?x.color:'transparent',alignItems:'center',justifyContent:'center',gap:7}}><TileIcon name={x.icon} color={x.color} size={42} plain/><T numberOfLines={2} style={{fontSize:12,fontWeight:selected?'600':'500',textAlign:'center'}}>{cat.name}</T>{selected&&<View style={{position:'absolute',top:7,right:7}}><Icon name="Check" size={13} color={c.text}/></View>}</Squish>})}</Row>
   {!choices.length&&<T style={{fontSize:13,color:c.sub,textAlign:'center',paddingVertical:25}}>No matching categories.</T>}
  </Dialog>}
 </View>;
}
