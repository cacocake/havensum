import { k_planArchiveStateVersion } from './stateSchema.js';

export const k_planYearConflictField = '$planYear';
export const k_planArchiveCollection = 'plans';

function sameSnapshot(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

// Approved revisions are append-only, so a history that begins with every
// snapshot of another history supersedes it.
function startsWith(history, prefix) {
  return prefix.length <= history.length && prefix.every((snapshot, index) => sameSnapshot(snapshot, history[index]));
}

function revisionNumber(snapshot) {
  return snapshot?.revision ?? 0;
}

// An older backup holds one snapshot of the year. It extends the shared
// baseline history when it follows it; otherwise it is offered on its own
// as a whole-history choice.
function legacyCandidateHistory(baseHistory, localHistory, legacyHistory) {
  const [legacySnapshot] = legacyHistory;
  if (localHistory.some(snapshot => snapshot.id === legacySnapshot.id)) {
    return localHistory;
  }
  if (baseHistory.some(snapshot => snapshot.id === legacySnapshot.id)) {
    return baseHistory;
  }
  if (baseHistory.length && revisionNumber(legacySnapshot) <= revisionNumber(baseHistory.at(-1))) {
    return legacyHistory;
  }
  return [...baseHistory, legacySnapshot];
}

// An older backup holds at most one plan year. Years it could never represent
// are not deletions. Null means the backup represents every year.
export function representedPlanYears(backup) {
  if (backup?.version >= k_planArchiveStateVersion) {
    return null;
  }
  return new Set(backup?.plan ? [String(backup.plan.year)] : []);
}

// Each year merges independently and no merge deletes an approved snapshot.
// Diverging changes to one year are offered as two whole revision histories,
// so matching revision numbers never overwrite each other.
export function mergePlanArchives(base = {}, local = {}, remote = {}, { remotePlanYears = null } = {}) {
  const plans = {};
  const conflicts = [];
  const yearKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const yearKey of [...yearKeys].sort()) {
    const baseHistory = base[yearKey] ?? [];
    const localHistory = local[yearKey] ?? [];
    const remoteRepresentsYear = remotePlanYears === null || remotePlanYears.has(yearKey);
    let remoteHistory = remoteRepresentsYear ? (remote[yearKey] ?? []) : [];
    if (remotePlanYears !== null && remoteHistory.length) {
      remoteHistory = legacyCandidateHistory(baseHistory, localHistory, remoteHistory);
    }
    if (startsWith(localHistory, remoteHistory)) {
      plans[yearKey] = localHistory;
      continue;
    }
    if (startsWith(remoteHistory, localHistory)) {
      plans[yearKey] = remoteHistory;
      continue;
    }
    plans[yearKey] = localHistory;
    conflicts.push({
      collection: k_planArchiveCollection,
      id: yearKey,
      field: k_planYearConflictField,
      base: base[yearKey],
      local: localHistory,
      remote: remoteHistory
    });
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
