import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateOfTimestamp } from '../src/calendar.js';
import { atLocalTime } from './helpers/localClock.js';

// Owner decision L02: a stored UTC timestamp is shown and compared by the
// phone's local calendar day.
test('a stored UTC timestamp falls on its local calendar day', () => {
  const lateUtcEvening = '2026-11-19T19:00:00.000Z';

  const inAuckland = atLocalTime('Pacific/Auckland', lateUtcEvening, () => localDateOfTimestamp(lateUtcEvening));
  const inLisbon = atLocalTime('Europe/Lisbon', lateUtcEvening, () => localDateOfTimestamp(lateUtcEvening));
  const inLosAngeles = atLocalTime('America/Los_Angeles', '2026-11-20T03:00:00.000Z', () => localDateOfTimestamp('2026-11-20T03:00:00.000Z'));

  assert.deepEqual([inAuckland, inLisbon, inLosAngeles], ['2026-11-20', '2026-11-19', '2026-11-19']);
});
