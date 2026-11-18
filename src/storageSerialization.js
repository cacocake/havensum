import { validateOutlookState } from './outlookInputs.js';

const k_unreadableBaselineMessage = 'Your saved merge baseline is unreadable. Export a new baseline.';

export function parseMergeBaseline(encodedBaseline) {
  try {
    return validateOutlookState(JSON.parse(encodedBaseline));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SyntaxError(k_unreadableBaselineMessage);
    }
    throw error;
  }
}
