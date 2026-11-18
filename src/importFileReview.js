import { getImportMapping, normalizeImportRows } from './importNormalization.js';
import { previewTransactionImport } from './importReview.js';

export function previewImportFile(state, data, options = {}) {
  const mapping = options.mapping || getImportMapping(data);
  const errors = new Map();
  const transactions = data.rows.map((row, index) => {
    try {
      return normalizeImportRows(state, { ...data, rows: [row] }, { ...options, mapping })[0];
    } catch (error) {
      errors.set(index, error.message.replace(/^Row 1: /, ''));
      return { title: String(row[mapping.title] || 'Unmapped transaction') };
    }
  });
  const review = previewTransactionImport(state, transactions);
  for (const [index, error] of errors) {
    review.rows[index].normalizationError = error;
    review.rows[index].status = 'invalid';
    review.rows[index].error = error;
  }
  return review;
}
