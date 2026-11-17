import React,{useState} from 'react';
import {Pressable,View} from 'react-native';
import Animated,{FadeIn,useReducedMotion} from 'react-native-reanimated';
const AnimatedPressable=Animated.createAnimatedComponent(Pressable);
const curve='cubic-bezier(0.23, 1, 0.32, 1)';
export function MotionPressable({children,style,onPressIn,onPressOut,...props}){
 const [pressed,setPressed]=useState(false),reduced=useReducedMotion();
 return <AnimatedPressable {...props} accessibilityRole={props.accessibilityRole||'button'} pressRetentionOffset={16} onPressIn={e=>{setPressed(true);onPressIn?.(e)}} onPressOut={e=>{setPressed(false);onPressOut?.(e)}} style={[style,{transform:[{scale:pressed&&!reduced?.97:1}],transitionProperty:'transform',transitionDuration:reduced?0:120,transitionTimingFunction:curve}]}>{children}</AnimatedPressable>;
}
export function Reveal({children}){const reduced=useReducedMotion();return <Animated.View entering={reduced?undefined:FadeIn.duration(140)}>{children}</Animated.View>}
export function Meter({value,color,track}){const reduced=useReducedMotion();return <View style={{height:8,backgroundColor:track,borderRadius:8,overflow:'hidden'}}><Animated.View style={{position:'absolute',left:0,top:0,bottom:0,width:'100%',borderRadius:8,backgroundColor:color,transformOrigin:'left center',transform:[{scaleX:Math.max(0,Math.min(1,value))}],transitionProperty:'transform',transitionDuration:reduced?0:180,transitionTimingFunction:curve}}/></View>}
