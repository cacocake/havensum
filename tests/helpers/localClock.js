import { mock } from 'node:test';

// Runs `action` as if the device clock read `instant` in `timeZone`, so a
// test can tell the device's local calendar date apart from the UTC date.
export function atLocalTime(timeZone, instant, action) {
  const restore = installLocalTime(timeZone, instant);
  try {
    return action();
  } finally {
    restore();
  }
}

// The same for an asynchronous action: the clock is restored once it settles.
export async function atLocalTimeAsync(timeZone, instant, action) {
  const restore = installLocalTime(timeZone, instant);
  try {
    return await action();
  } finally {
    restore();
  }
}

function installLocalTime(timeZone, instant) {
  const originalTimeZone = process.env.TZ;
  process.env.TZ = timeZone;
  mock.timers.enable({ apis: ['Date'], now: new Date(instant) });
  return () => {
    mock.timers.reset();
    if (originalTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimeZone;
    }
  };
}
