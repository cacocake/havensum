import React, { useContext } from 'react';
import { Theme } from './ui.jsx';
import { k_brandViewBox, k_brandStrokeWidth, k_brandPaths, k_brandColors } from './brandGeometry.js';

export default function BrandMark({ size = 32 }) {
  const theme = useContext(Theme);
  const color = theme?.dark ? k_brandColors.dark : k_brandColors.light;

  return (
    <svg width={size} height={size} viewBox={k_brandViewBox} role="img" aria-label="Havensum" style={{ flexShrink: 0 }}>
      {k_brandPaths.map(path => (
        <path key={path} d={path} fill="none" stroke={color} strokeWidth={k_brandStrokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
