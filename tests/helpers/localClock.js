import { mock } from 'node:test';

// Runs `action` as if the device clock read `instant` in `timeZone`, so a
// test can tell the device's local calendar date apart from the UTC date.
export function atLocalTime(timeZone, instant, action) {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = timeZone;
  mock.timers.enable({ apis: ['Date'], now: new Date(instant) });
  try {
    return action();
  } finally {
    mock.timers.reset();
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  }
}
