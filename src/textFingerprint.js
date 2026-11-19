const k_fingerprintOffset = 0xcbf29ce484222325n;
const k_fingerprintPrime = 0x100000001b3n;
const k_fingerprintBits = 64;
const k_hexadecimalRadix = 16;

// A stable 64-bit FNV-1a digest of text. Identifies content; it is not a secret.
export function fingerprintText(text) {
  let hash = k_fingerprintOffset;
  for (const character of text) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(k_fingerprintBits, hash * k_fingerprintPrime);
  }
  return hash.toString(k_hexadecimalRadix);
}
