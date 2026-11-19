import { cubicBezier } from 'react-native-reanimated';

// The shared ease-out curve for native press and meter transitions. Reanimated's CSS transitions
// on Android accept only named curves or its cubicBezier() builder, not a "cubic-bezier(...)" string.
const k_motionCurveStartX = 0.23;
const k_motionCurveStartY = 1;
const k_motionCurveEndX = 0.32;
const k_motionCurveEndY = 1;

export const k_motionTimingCurve = cubicBezier(k_motionCurveStartX, k_motionCurveStartY, k_motionCurveEndX, k_motionCurveEndY);
