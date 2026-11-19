import { latestPlan, plannedYears } from './planArchive.js';
import { monthKeyOf } from './calendar.js';

// The plan whose assumptions a draft starts from: this year's latest approved
// revision, otherwise the latest plan of the nearest earlier year.
function sourcePlan(state, year) {
  const sameYearPlan = latestPlan(state, year);
  if (sameYearPlan) {
    return sameYearPlan;
  }
  const earlierYear = plannedYears(state).filter(plannedYear => plannedYear < year).at(-1);
  return earlierYear === undefined ? null : latestPlan(state, earlierYear);
}

function latestChangeBefore(changes, month) {
  return changes
    .filter(change => change.since <= month)
    .sort((first, second) => first.since.localeCompare(second.since))
    .at(-1);
}

function latestPlannedMonthBefore(plan, month) {
  return Object.keys(plan.months).filter(plannedMonth => plannedMonth <= month).sort().at(-1);
}

// Monthly income in effect when the period starts. Deliberate zeros survive.
function incomeAtStart(plan, startMonth) {
  const plannedMonth = plan.months[startMonth];
  if (plannedMonth) {
    return plannedMonth.income;
  }
  const change = latestChangeBefore(plan.incomeChanges ?? [], startMonth);
  if (change) {
    return change.amount;
  }
  const earlierMonth = latestPlannedMonthBefore(plan, startMonth);
  return earlierMonth ? plan.months[earlierMonth].income : null;
}

function isLoanActiveFrom(state, loanId, startMonth) {
  const loan = state.loans.find(candidate => candidate.id === loanId);
  return Boolean(loan) && loan.end >= startMonth;
}

// A payment change already in effect becomes a change at the period start;
// later changes carry once. Changes for removed or closed loans are reported.
function carriedLoanChanges(state, plan, startMonth) {
  const loanChanges = [];
  const staleLoanChanges = [];
  const loanIds = new Set((plan.loanChanges ?? []).map(change => change.loanId));
  for (const loanId of loanIds) {
    const changes = plan.loanChanges.filter(change => change.loanId === loanId);
    if (!isLoanActiveFrom(state, loanId, startMonth)) {
      staleLoanChanges.push(...changes);
      continue;
    }
    const effectiveChange = latestChangeBefore(changes, startMonth);
    if (effectiveChange) {
      loanChanges.push({ loanId, since: startMonth, amount: effectiveChange.amount });
    }
    loanChanges.push(...changes.filter(change => change.since > startMonth));
  }
  return { loanChanges, staleLoanChanges };
}

// Earlier manual overrides are offered beside fresh suggestions. A same-year
// revision keeps that year's current overrides; other years start unkept.
function earlierOverrides(state, plan, startMonth, isSameYear) {
  const referenceMonth = plan.months[startMonth] ? startMonth : Object.keys(plan.months).sort().at(-1);
  const categoryIds = new Set(state.categories.map(category => category.id));
  return (plan.months[referenceMonth]?.lines ?? [])
    .filter(line => line.override)
    .map(line => {
      const stale = !categoryIds.has(line.category);
      return { lineId: line.id ?? line.category, name: line.name, amount: line.amount, stale, keep: isSameYear && !stale };
    });
}

export function carriedPlanAssumptions(state, { year, fromMonth }) {
  const plan = sourcePlan(state, year);
  if (!plan) {
    return { source: null, income: null, incomeChanges: [], loanChanges: [], staleLoanChanges: [], overrides: [], window: null, tolerance: null, drift: null, cushion: null };
  }
  const startMonth = monthKeyOf(year, fromMonth);
  const isSameYear = plan.year === year;
  const { loanChanges, staleLoanChanges } = carriedLoanChanges(state, plan, startMonth);
  const referenceMonth = plan.months[startMonth] ?? plan.months[latestPlannedMonthBefore(plan, startMonth)];
  return {
    source: { year: plan.year, revision: plan.revision },
    income: incomeAtStart(plan, startMonth),
    incomeChanges: (plan.incomeChanges ?? []).filter(change => change.since > startMonth),
    loanChanges,
    staleLoanChanges,
    overrides: earlierOverrides(state, plan, startMonth, isSameYear),
    window: plan.window ?? null,
    tolerance: plan.tolerance ?? null,
    drift: plan.drift ?? null,
    cushion: referenceMonth?.cushion ?? null
  };
}
