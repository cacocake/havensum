import { cubicBezier } from 'react-native-reanimated';

// Reanimated CSS transition settings for native press feedback and meter fills. Reanimated's
// transitionTimingFunction accepts only named curves or its easing builders, not a "cubic-bezier(...)" string.
const k_motionTimingCurve = cubicBezier(0.23, 1, 0.32, 1);
const k_transitionedProperty = 'transform';
const k_reducedMotionDurationMilliseconds = 0;
const k_pressDurationMilliseconds = 120;
const k_meterDurationMilliseconds = 180;

function transformTransitionStyle(durationMilliseconds, reducedMotion) {
  return {
    transitionProperty: k_transitionedProperty,
    transitionDuration: reducedMotion ? k_reducedMotionDurationMilliseconds : durationMilliseconds,
    transitionTimingFunction: k_motionTimingCurve
  };
}

export function pressTransitionStyle(reducedMotion) {
  return transformTransitionStyle(k_pressDurationMilliseconds, reducedMotion);
}

export function meterTransitionStyle(reducedMotion) {
  return transformTransitionStyle(k_meterDurationMilliseconds, reducedMotion);
}
