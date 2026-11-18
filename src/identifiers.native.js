import { randomUUID } from 'expo-crypto';

export function createEntityId(prefix) {
  return `${prefix}-${randomUUID()}`;
}
