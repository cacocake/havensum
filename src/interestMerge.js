import { k_interestScheduleStateVersion } from './stateSchema.js';

export const k_interestScheduleField = 'interestSchedule';

function sameValue(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function agreesWithSchedule(legacySchedule, schedule) {
  return (legacySchedule ?? []).every(legacyPeriod => (schedule ?? []).some(period => sameValue(period, legacyPeriod)));
}

function hasSchedule(account) {
  return Boolean(account?.[k_interestScheduleField]?.length);
}

function onlyZeroRates(schedule) {
  return schedule.every(period => period.rate === 0);
}

function removeScheduleConflict(conflicts, accountId) {
  const index = conflicts.findIndex(conflict =>
    conflict.collection === 'accounts' && conflict.id === accountId && conflict.field === k_interestScheduleField);
  if (index >= 0) {
    conflicts.splice(index, 1);
  }
}

// An older backup cannot represent a rate schedule. Old app versions also
// stored a 0% rate on every account, which is not a schedule worth merging.
// When this device has a schedule, it stays: a matching legacy rate is
// accepted silently and a differing one is offered as a single inserted
// period for review, never collapsing the schedule.
export function protectInterestSchedules(local, remote, result, conflicts) {
  for (const localAccount of local.accounts ?? []) {
    const remoteAccount = (remote.accounts ?? []).find(account => account.id === localAccount.id);
    const mergedIndex = result.accounts.findIndex(account => account.id === localAccount.id);
    const legacySchedule = remoteAccount?.[k_interestScheduleField];
    if (mergedIndex < 0 || !legacySchedule) {
      continue;
    }
    const keepsLocalSchedule = hasSchedule(localAccount) || onlyZeroRates(legacySchedule);
    if (!keepsLocalSchedule) {
      continue;
    }
    removeScheduleConflict(conflicts, localAccount.id);
    // Replace rather than mutate: the merged record may be the backup's own object.
    const mergedAccount = { ...result.accounts[mergedIndex] };
    if (localAccount[k_interestScheduleField] === undefined) {
      delete mergedAccount[k_interestScheduleField];
    } else {
      mergedAccount[k_interestScheduleField] = localAccount[k_interestScheduleField];
    }
    result.accounts[mergedIndex] = mergedAccount;
    if (!hasSchedule(localAccount) || agreesWithSchedule(legacySchedule, localAccount[k_interestScheduleField])) {
      continue;
    }
    const localSchedule = localAccount[k_interestScheduleField];
    const insertedSchedule = [...localSchedule.filter(period => !legacySchedule.some(legacyPeriod => legacyPeriod.since === period.since)), ...legacySchedule]
      .sort((first, second) => first.since.localeCompare(second.since));
    conflicts.push({
      collection: 'accounts',
      id: localAccount.id,
      field: k_interestScheduleField,
      legacyRate: true,
      base: undefined,
      local: localSchedule,
      remote: insertedSchedule
    });
  }
}

// Backups before version 4 hold at most one rate per account.
export function representsInterestSchedules(backup) {
  return backup?.version >= k_interestScheduleStateVersion;
}
