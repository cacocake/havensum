import AsyncStorage from '@react-native-async-storage/async-storage';
export async function readState(){const s=await AsyncStorage.getItem('melo-state-v1');return s?JSON.parse(s):null;}
let writeQueue=Promise.resolve();
export function writeState(state){const encoded=JSON.stringify(state);const current=writeQueue.catch(()=>{}).then(()=>AsyncStorage.setItem('melo-state-v1',encoded));writeQueue=current;return current;}
export async function readSnapshot(){const s=await AsyncStorage.getItem('melo-sync-base');return s?JSON.parse(s):null;}
export async function writeSnapshot(state){await AsyncStorage.setItem('melo-sync-base',JSON.stringify(state));}
