const k_fingerprintOffset = 0xcbf29ce484222325n;
const k_fingerprintPrime = 0x100000001b3n;
const k_fingerprintBits = 64;

export function movementFingerprint(row, sourceFields = []) {
  const { date, amount, direction } = row.movement;
  const source = JSON.stringify([date, amount, direction, row.title.trim().normalize('NFC'), ...sourceFields]);
  let hash = k_fingerprintOffset;
  for (const character of source) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(k_fingerprintBits, hash * k_fingerprintPrime);
  }
  return hash.toString(16);
}
