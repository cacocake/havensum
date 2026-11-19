import { fingerprintText } from './textFingerprint.js';

export function movementFingerprint(row, sourceFields = []) {
  const { date, amount, direction } = row.movement;
  const source = JSON.stringify([date, amount, direction, row.title.trim().normalize('NFC'), ...sourceFields]);
  return fingerprintText(source);
}
