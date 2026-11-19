import { k_interestScheduleStateVersion } from './stateSchema.js';

const k_interestScheduleField = 'interestSchedule';

function sameValue(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function agreesWithSchedule(legacySchedule, schedule) {
  return (legacySchedule ?? []).every(legacyPeriod => (schedule ?? []).some(period => sameValue(period, legacyPeriod)));
}

// An older backup cannot represent a rate schedule. When its single rate is
// already in this device's schedule, the schedule stays. When it differs, the
// schedule stays and the legacy rate is offered for review, never collapsed.
export function protectInterestSchedules(local, remote, result, conflicts) {
  for (const localAccount of local.accounts ?? []) {
    const remoteAccount = (remote.accounts ?? []).find(account => account.id === localAccount.id);
    const mergedIndex = result.accounts.findIndex(account => account.id === localAccount.id);
    if (!remoteAccount || mergedIndex < 0 || remoteAccount[k_interestScheduleField] === undefined) {
      continue;
    }
    const existingConflictIndex = conflicts.findIndex(conflict =>
      conflict.collection === 'accounts' && conflict.id === localAccount.id && conflict.field === k_interestScheduleField);
    if (existingConflictIndex >= 0) {
      conflicts.splice(existingConflictIndex, 1);
    }
    // Replace rather than mutate: the merged record may be the backup's own object.
    result.accounts[mergedIndex] = { ...result.accounts[mergedIndex], [k_interestScheduleField]: localAccount[k_interestScheduleField] };
    if (agreesWithSchedule(remoteAccount[k_interestScheduleField], localAccount[k_interestScheduleField])) {
      continue;
    }
    conflicts.push({
      collection: 'accounts',
      id: localAccount.id,
      field: k_interestScheduleField,
      base: undefined,
      local: localAccount[k_interestScheduleField],
      remote: remoteAccount[k_interestScheduleField]
    });
  }
}

// Backups before version 4 hold at most one rate per account.
export function representsInterestSchedules(backup) {
  return backup?.version >= k_interestScheduleStateVersion;
}
