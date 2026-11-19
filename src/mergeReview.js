import { takeReviewedPaybackTask, takeReviewedTrackedExpense } from './paybackMerge.js';
import { k_planYearConflictField, takeReviewedPlanYear } from './planMerge.js';

// Applies the side chosen for each reviewed conflict to a merged result. Used
// by the reviewed backup merge and the shared-file sync review alike.
const k_mergeConflictFields = { outlook: '$outlook', record: '$record', trackedExpense: '$trackedExpense', paybackTask: '$paybackTask' };

export function mergeConflictKey(conflict) {
  return `${conflict.collection}|${conflict.id}|${conflict.field}`;
}

export function hasChosenEveryConflict(conflicts, choices) {
  return conflicts.every(conflict => Boolean(choices[mergeConflictKey(conflict)]));
}

export function applyMergeChoices(mergedResult, conflicts, choices) {
  let result = JSON.parse(JSON.stringify(mergedResult));
  for (const conflict of conflicts) {
    const selectedSide = choices[mergeConflictKey(conflict)];
    if (!selectedSide) {
      continue;
    }
    const selectedValue = conflict[selectedSide];
    if (conflict.field === k_mergeConflictFields.trackedExpense) {
      result = takeReviewedTrackedExpense(result, conflict.id, selectedValue);
      continue;
    }
    if (conflict.field === k_mergeConflictFields.paybackTask) {
      result = takeReviewedPaybackTask(result, conflict.id, selectedValue);
      continue;
    }
    if (conflict.field === k_planYearConflictField) {
      result = takeReviewedPlanYear(result, conflict.id, selectedValue);
      continue;
    }
    if (conflict.field === k_mergeConflictFields.outlook) {
      result[conflict.collection] = selectedValue;
      continue;
    }
    if (conflict.field === k_mergeConflictFields.record) {
      result[conflict.collection] = result[conflict.collection].filter(record => record.id !== conflict.id);
      if (selectedValue) {
        result[conflict.collection].push(selectedValue);
      }
      continue;
    }
    const record = result[conflict.collection].find(candidate => candidate.id === conflict.id);
    if (record) {
      record[conflict.field] = selectedValue;
    }
  }
  return result;
}
