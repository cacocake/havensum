const k_randomByteCount = 16;
const k_hexadecimalRadix = 16;
const k_hexadecimalByteWidth = 2;

export function createEntityId(prefix) {
  // getRandomValues also supports browser previews outside secure contexts.
  const randomBytes = globalThis.crypto.getRandomValues(new Uint8Array(k_randomByteCount));
  const randomPart = Array.from(randomBytes, byte => byte.toString(k_hexadecimalRadix).padStart(k_hexadecimalByteWidth, '0')).join('');
  return `${prefix}-${randomPart}`;
}
