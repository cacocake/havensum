const isDemo=()=>new URLSearchParams(window.location.search).get('demo')==='1';
export async function readState(){if(isDemo())return null;try{return JSON.parse(localStorage.getItem('melo-state-v1'));}catch{return null;}}
export async function writeState(state){if(isDemo())return;localStorage.setItem('melo-state-v1',JSON.stringify(state));}
export async function readSnapshot(){try{return JSON.parse(localStorage.getItem('melo-sync-base'));}catch{return null;}}
export async function writeSnapshot(state){localStorage.setItem('melo-sync-base',JSON.stringify(state));}
