import React, { useContext } from 'react';
import Svg, { Path } from 'react-native-svg';
import { Theme } from './ui.jsx';
import { k_brandViewBox, k_brandStrokeWidth, k_brandPaths, k_brandColors } from './brandGeometry.js';

export default function BrandMark({ size = 32 }) {
  const theme = useContext(Theme);
  const color = theme?.dark ? k_brandColors.dark : k_brandColors.light;

  return (
    <Svg width={size} height={size} viewBox={k_brandViewBox} accessibilityRole="image" accessibilityLabel="Havensum">
      {k_brandPaths.map(path => (
        <Path key={path} d={path} fill="none" stroke={color} strokeWidth={k_brandStrokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
