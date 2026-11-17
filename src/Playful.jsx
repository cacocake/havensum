import React,{useContext,useEffect,useRef,useState} from 'react';
import {View,Pressable,Animated,AccessibilityInfo,Platform} from 'react-native';
import {Theme,T} from './ui.jsx';
import Icon from './Icon';
export {MotionPressable as Squish} from './Motion';
import {MotionPressable as Squish} from './Motion';
export function useReducedMotion(){const [reduced,setReduced]=useState(true);useEffect(()=>{let alive=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setReduced(v)});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{alive=false;sub.remove();}},[]);return reduced;}
export function PocketBuddy({size=90,quiet=false}){
 const c=useContext(Theme),[happy,setHappy]=useState(false),bob=useRef(new Animated.Value(0)).current,reduced=useReducedMotion(),timer=useRef(null);
 useEffect(()=>{if(reduced||quiet)return;const loop=Animated.loop(Animated.sequence([Animated.timing(bob,{toValue:1,duration:1800,useNativeDriver:Platform.OS!=='web'}),Animated.timing(bob,{toValue:0,duration:1800,useNativeDriver:Platform.OS!=='web'})]));loop.start();return()=>loop.stop()},[reduced,quiet]);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 return <Squish accessibilityLabel={happy?'Melo waves hello':'Say hello to Melo'} onPress={()=>{setHappy(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setHappy(false),1500)}} style={{width:size,height:size,flexShrink:0}}><Animated.View style={{width:100,height:100,transform:[{scale:size/100},{translateY:bob.interpolate({inputRange:[0,1],outputRange:[0,-4]})}],transformOrigin:'top left'}}>
 <View style={{position:'absolute',left:17,top:90,width:63,height:5,borderRadius:30,backgroundColor:c.dark?'#0002':'#b8875020'}}/>
 <View style={{position:'absolute',left:7,top:48,width:20,height:9,borderRadius:8,backgroundColor:'#EE9860',transform:[{rotate:happy?'-45deg':'-15deg'}]}}/>
 <View style={{position:'absolute',left:70,top:42,width:23,height:9,borderRadius:8,backgroundColor:'#EE9860',transform:[{rotate:happy?'-45deg':'-22deg'}]}}/>
 <View style={{position:'absolute',left:22,top:78,width:10,height:15,borderRadius:8,backgroundColor:'#EE9860',transform:[{rotate:'16deg'}]}}/><View style={{position:'absolute',left:58,top:78,width:10,height:15,borderRadius:8,backgroundColor:'#EE9860',transform:[{rotate:'-12deg'}]}}/>
 <View style={{position:'absolute',left:16,top:21,width:62,height:65,borderTopLeftRadius:29,borderTopRightRadius:27,borderBottomLeftRadius:24,borderBottomRightRadius:30,backgroundColor:'#F8CB65',borderWidth:1.5,borderColor:'#E9AE50',transform:[{rotate:'-7deg'}]}}>
 <View style={{position:'absolute',left:14,top:25,width:5,height:happy?2:6,borderRadius:4,backgroundColor:'#594334'}}/><View style={{position:'absolute',left:37,top:25,width:5,height:6,borderRadius:4,backgroundColor:'#594334'}}/>
 <View style={{position:'absolute',left:8,top:35,width:11,height:5,borderRadius:4,backgroundColor:'#F1A16F'}}/><View style={{position:'absolute',left:38,top:35,width:11,height:5,borderRadius:4,backgroundColor:'#F1A16F'}}/>
 <View style={{position:'absolute',left:23,top:34,width:12,height:7,borderBottomWidth:2,borderColor:'#594334',borderBottomLeftRadius:9,borderBottomRightRadius:9}}/>
 </View>
 <View style={{position:'absolute',left:29,top:10,width:14,height:21,borderRadius:12,backgroundColor:'#AFA0D3',transform:[{rotate:'-35deg'}]}}/><View style={{position:'absolute',left:41,top:9,width:13,height:21,borderRadius:12,backgroundColor:'#C7B8E5',transform:[{rotate:'23deg'}]}}/>
 <View style={{position:'absolute',left:73,top:10,transform:[{rotate:'12deg'}]}}><Icon name={happy?'Heart':'Sparkles'} size={happy?20:16} color={happy?'#CA96AF':'#B49ACC'}/></View>
 </Animated.View></Squish>;
}
export function ConfettiNotice({message}){
 const c=useContext(Theme),motion=useRef(new Animated.Value(0)).current,reduced=useReducedMotion();
 useEffect(()=>{motion.setValue(reduced?1:0);if(!reduced)Animated.spring(motion,{toValue:1,damping:17,stiffness:210,useNativeDriver:Platform.OS!=='web'}).start()},[message,reduced]);
 const success=/added|saved|updated|exported|imported|merged|frozen|cleared/i.test(message);
 return <Animated.View style={{backgroundColor:c.text,borderRadius:20,paddingHorizontal:17,paddingVertical:14,maxWidth:570,boxShadow:'0 6px 30px #34224425',flexDirection:'row',alignItems:'center',gap:12,transform:[{translateY:motion.interpolate({inputRange:[0,1],outputRange:[16,0]})},{scale:motion.interpolate({inputRange:[0,1],outputRange:[.95,1]})}],opacity:motion}}><View style={{width:31,height:31,borderRadius:12,backgroundColor:success?'#F7CC72':'#D2C2ED',alignItems:'center',justifyContent:'center'}}><Icon name={success?'Check':'Info'} size={17} color="#48394D"/></View><T style={{fontSize:13,color:c.bg,flexShrink:1}}>{message}</T></Animated.View>;
}
