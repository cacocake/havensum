import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { loadReanimatedCssHelpers } from '../helpers/reanimatedInNode.js';

const { cubicBezier, normalizeTimingFunction } = await loadReanimatedCssHelpers();

// The full Reanimated entry needs the native runtime; give the app Reanimated's real easing builder.
mock.module('react-native-reanimated', { namedExports: { cubicBezier } });

const { k_motionTimingCurve } = await import('../../src/motionTimingCurve.native.js');

test('the native press and meter transitions use a timing curve Reanimated accepts on Android', () => {
  assert.doesNotThrow(() => normalizeTimingFunction(k_motionTimingCurve));
});

test('the native timing curve keeps the same ease-out shape as the web transitions', () => {
  assert.deepEqual(normalizeTimingFunction(k_motionTimingCurve), { name: 'cubicBezier', x1: 0.23, y1: 1, x2: 0.32, y2: 1 });
});
