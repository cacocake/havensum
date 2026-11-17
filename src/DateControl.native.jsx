import React from 'react';
import {Pressable,Text} from 'react-native';
import {DateTimePickerAndroid} from '@react-native-community/datetimepicker';
import Icon from './Icon';
export default function DateControl({label,value,onChange,theme}){
 function open(){DateTimePickerAndroid.open({value:new Date(value+'T12:00:00'),mode:'date',onChange:(event,date)=>{if(event.type==='set'&&date)onChange(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`);}});}
 return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={open} hitSlop={12} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',minHeight:24}}><Text style={{fontFamily:'DM Sans',fontSize:14,color:theme.text}}>{new Date(value+'T12:00:00').toLocaleDateString('en-GB')}</Text><Icon name="CalendarDays" color={theme.sub} size={18}/></Pressable>;
}
