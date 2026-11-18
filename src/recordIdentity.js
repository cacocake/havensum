export function isRecordIdentifier(value) {
  return (typeof value === 'string' && value.trim().length > 0) || Number.isSafeInteger(value);
}
