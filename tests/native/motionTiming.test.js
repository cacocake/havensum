import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { loadReanimatedCssHelpers } from '../helpers/reanimatedInNode.js';

const { cubicBezier, normalizeCSSTransitionProperties } = await loadReanimatedCssHelpers();

// The full Reanimated entry needs the native runtime; give the app Reanimated's real easing builder.
mock.module('react-native-reanimated', { exports: { cubicBezier } });

const { meterTransitionStyle, pressTransitionStyle } = await import('../../src/motionTransitions.native.js');

const k_motionSettings = [
  { name: 'press feedback', transitionStyle: pressTransitionStyle, durationMilliseconds: 120 },
  { name: 'meter fill', transitionStyle: meterTransitionStyle, durationMilliseconds: 180 }
];
const k_easeOutCurve = { name: 'cubicBezier', x1: 0.23, y1: 1, x2: 0.32, y2: 1 };

for (const { name, transitionStyle, durationMilliseconds } of k_motionSettings) {
  test(`the native ${name} transition passes Reanimated's startup validation with normal and reduced motion`, () => {
    for (const reducedMotion of [false, true]) {
      assert.doesNotThrow(() => normalizeCSSTransitionProperties(transitionStyle(reducedMotion)));
    }
  });

  test(`the native ${name} transition animates transform with the shared ease-out curve, and not at all with reduced motion`, () => {
    const normalTransition = normalizeCSSTransitionProperties(transitionStyle(false));
    const reducedTransition = normalizeCSSTransitionProperties(transitionStyle(true));
    assert.deepEqual(normalTransition.properties, ['transform']);
    assert.deepEqual(normalTransition.settings.transform, { duration: durationMilliseconds, timingFunction: k_easeOutCurve, delay: 0, allowDiscrete: false });
    assert.equal(reducedTransition.settings.transform.duration, 0);
  });
}
