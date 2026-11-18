import { validateState } from './stateSchema.js';

const k_unreadableBaselineMessage = 'Your saved merge baseline is unreadable. Keep this device data while recovering a verified backup.';

export function parseMergeBaseline(encodedBaseline) {
  try {
    return validateState(JSON.parse(encodedBaseline));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SyntaxError(k_unreadableBaselineMessage);
    }
    throw error;
  }
}
