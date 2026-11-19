import { k_currentStateVersion } from './stateSchema.js';

export const k_planYearConflictField = '$planYear';
export const k_planArchiveCollection = 'plans';

function sameHistory(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

// An older backup holds at most one plan year. Years it could never represent
// are not deletions. Null means the backup represents every year.
export function representedPlanYears(backup) {
  if (backup?.version === k_currentStateVersion) {
    return null;
  }
  return new Set(backup?.plan ? [String(backup.plan.year)] : []);
}

// Each year merges independently. Concurrent changes to one year are offered
// as two whole revision histories, so matching revision numbers never collide.
export function mergePlanArchives(base = {}, local = {}, remote = {}, { remotePlanYears = null } = {}) {
  const plans = {};
  const conflicts = [];
  const yearKeys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const yearKey of [...yearKeys].sort()) {
    const baseHistory = base[yearKey];
    const localHistory = local[yearKey];
    const remoteHistory = remote[yearKey];
    const remoteRepresentsYear = remotePlanYears === null || remotePlanYears.has(yearKey);
    let mergedHistory = localHistory;
    if (!remoteRepresentsYear || sameHistory(localHistory, remoteHistory) || sameHistory(baseHistory, remoteHistory)) {
      mergedHistory = localHistory;
    } else if (sameHistory(baseHistory, localHistory)) {
      mergedHistory = remoteHistory;
    } else {
      conflicts.push({
        collection: k_planArchiveCollection,
        id: yearKey,
        field: k_planYearConflictField,
        base: baseHistory,
        local: localHistory,
        remote: remoteHistory
      });
    }
    if (mergedHistory) {
      plans[yearKey] = mergedHistory;
    }
  }
  return { plans, conflicts };
}

export function takeReviewedPlanYear(state, yearKey, selectedHistory) {
  const plans = { ...state.plans };
  delete plans[yearKey];
  if (selectedHistory) {
    plans[yearKey] = selectedHistory;
  }
  return { ...state, plans };
}
