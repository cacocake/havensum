import React from 'react';
export default function DateControl({label,value,onChange}){return <input type="date" aria-label={label} value={value} onChange={e=>onChange(e.target.value)}/>;}
