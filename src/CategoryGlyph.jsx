import React from 'react';
import Icon from './Icon';

// One flat, rounded vector family across Android, web, pickers and category editors.
// Stored category icon names remain compatible; only their presentation changes.
export default function CategoryGlyph({name,size=26,color='#775C89'}){
 return <Icon name={name} size={size*.94} color={color} strokeWidth={1.85}/>;
}
