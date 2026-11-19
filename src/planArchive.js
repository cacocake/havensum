import { monthNumberOf, monthOf, yearOfMonth } from './calendar.js';
import { k_monthsPerYear } from './domainConstants.js';
import { fingerprintText } from './textFingerprint.js';

const k_legacyPlanIdPrefix = 'plan-legacy';

export const k_planRevisionStartKinds = Object.freeze({
  editable: 'editable',
  readOnly: 'readOnly'
});

export function planRevisions(state, year) {
  return state.plans?.[String(year)] ?? [];
}

export function latestPlan(state, year) {
  const revisions = planRevisions(state, year);
  return revisions.length ? revisions[revisions.length - 1] : null;
}

// Selecting an unknown revision falls back to the latest approved snapshot.
export function selectedPlan(state, year, revisionId = null) {
  const revisions = planRevisions(state, year);
  const selectedRevision = revisions.find(revision => revision.id === revisionId);
  return selectedRevision ?? latestPlan(state, year);
}

export function plannedMonth(state, month, revisionId = null) {
  return selectedPlan(state, yearOfMonth(month), revisionId)?.months[month] ?? null;
}

export function plannedYears(state) {
  return Object.keys(state.plans ?? {}).map(Number).sort((first, second) => first - second);
}

// The revision starts at the later of the selected month and today's month in
// the current year, and in January for a future year. Past years are read-only.
export function planRevisionStart(year, selectedMonth, today) {
  const currentMonth = monthOf(today);
  const currentYear = yearOfMonth(currentMonth);
  if (year < currentYear) {
    return { kind: k_planRevisionStartKinds.readOnly };
  }
  if (year > currentYear) {
    return { kind: k_planRevisionStartKinds.editable, fromMonth: 1 };
  }
  const selectedMonthNumber = yearOfMonth(selectedMonth) === year ? monthNumberOf(selectedMonth) : 1;
  return {
    kind: k_planRevisionStartKinds.editable,
    fromMonth: Math.max(selectedMonthNumber, monthNumberOf(currentMonth))
  };
}

function copyPlanData(plan) {
  // Plans are JSON data. The same copy works on Hermes and web.
  return JSON.parse(JSON.stringify(plan));
}

export class ReadOnlyPlanYearError extends Error {}

export class HistoricalPlanMonthError extends Error {}

function monthsBefore(months, firstMonth) {
  return Object.fromEntries(Object.entries(months ?? {}).filter(([month]) => month < firstMonth).sort(([first], [second]) => first.localeCompare(second)));
}

// Appends an approved snapshot. Earlier snapshots and other years stay intact,
// and months before the revision start must match the latest approved snapshot.
export function approvePlanRevision(state, revision, { id, fromMonth, today }) {
  if (planRevisionStart(revision.year, `${revision.year}-01`, today).kind === k_planRevisionStartKinds.readOnly) {
    throw new ReadOnlyPlanYearError(`${revision.year} is now a past year. Its plans are read-only.`);
  }
  if (!Number.isInteger(fromMonth) || fromMonth < 1 || fromMonth > k_monthsPerYear) {
    throw new RangeError('A plan revision needs a start month from 1 to 12.');
  }
  const firstRevisedMonth = `${revision.year}-${String(fromMonth).padStart(2, '0')}`;
  const carriedMonths = monthsBefore(latestPlan(state, revision.year)?.months, firstRevisedMonth);
  if (JSON.stringify(monthsBefore(revision.months, firstRevisedMonth)) !== JSON.stringify(carriedMonths)) {
    throw new HistoricalPlanMonthError('A revision cannot change earlier months of the approved plan.');
  }
  const yearKey = String(revision.year);
  const approvedRevision = { ...copyPlanData(revision), id };
  return {
    ...state,
    plans: { ...state.plans, [yearKey]: [...planRevisions(state, revision.year), approvedRevision] }
  };
}

// A content-derived ID: the same legacy snapshot migrates to the same ID on
// every device, while different legacy snapshots cannot share one.
export function legacyPlanArchive(plan) {
  if (!plan) {
    return {};
  }
  const id = `${k_legacyPlanIdPrefix}-${plan.year}-r${plan.revision ?? 0}-${fingerprintText(JSON.stringify(plan))}`;
  return { [String(plan.year)]: [{ ...plan, id }] };
}
