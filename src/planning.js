import { categorySettings, hasCategoryParent } from './ledger.js';
import { localCalendarDate, monthKeyOf, previousMonths, yearOfMonth } from './calendar.js';
import { latestPlan } from './planArchive.js';
import { eventsInMonth, plannedCostAmount } from './plannedCosts.js';
import { billsDueInMonth, lineSpending, planDraftEstimates } from './planDraftEstimates.js';
import { postedLedger } from './posting.js';
import { loanChangesFromHistory } from './loanPaymentHistory.js';
import { k_defaultHistoryWindow, k_monthsPerYear, k_spendingBehaviors, k_systemCategoryIds } from './domainConstants.js';

export const k_defaultPlanIncome = 245000;
export const k_defaultPlanCushion = 12000;
export const k_defaultFixedTolerance = 200;
export const k_defaultVariableDrift = 0.3;
const k_completedMonthsForDrift = 2;
const k_driftReasons = {
  fixed: 'Fixed spending moved outside its tolerance.',
  variable: 'Variable spending moved outside the configured drift band for two completed months.'
};

export function buildPlan(state, {
  year,
  fromMonth = 1,
  income = k_defaultPlanIncome,
  cushion = k_defaultPlanCushion,
  window = k_defaultHistoryWindow,
  overrides = {},
  today = localCalendarDate(),
  estimates = planDraftEstimates(state, { year, fromMonth, window, today }),
  incomeChanges = latestPlan(state, year)?.incomeChanges || [],
  loanChanges = loanChangesFromHistory(state.loans, monthKeyOf(year, fromMonth))
}) {
  const approvedPlan = latestPlan(state, year);
  const rootCategories = state.categories.filter(category => !hasCategoryParent(category) && category.id !== k_systemCategoryIds.loan);
  const lineTemplates = rootCategories.flatMap(category => {
    const settings = categorySettings(state.categories, category.id);
    const behaviors = new Set([settings.kind, ...estimates.behaviorsFor(category.id)]);
    if (estimates.bills.some(bill => bill.category === category.id)) {
      behaviors.add(k_spendingBehaviors.fixed);
    }
    return [...behaviors].filter(behavior => behavior !== k_spendingBehaviors.occasional).map(behavior => {
      const matchesDefaultBehavior = behavior === settings.kind;
      const lineId = matchesDefaultBehavior ? category.id : `${category.id}:${behavior}`;
      const behaviorSuffix = matchesDefaultBehavior ? '' : ` · ${behavior.toLowerCase()}`;
      return { id: lineId, category: category.id, name: category.name + behaviorSuffix, kind: behavior };
    });
  });
  function linesForMonth(month) {
    return lineTemplates.map(line => {
      // Fixed lines total the bills still due that month; others use net averages.
      const calculatedAmount = line.kind === k_spendingBehaviors.fixed
        ? billsDueInMonth(estimates.bills, line.category, month).reduce((total, bill) => total + bill.amount, 0)
        : estimates.averageFor(line.category, line.kind);
      return { ...line, amount: overrides[line.id] ?? calculatedAmount, override: overrides[line.id] !== undefined };
    });
  }

  const carriedMonths = approvedPlan?.months ?? {};
  // Plans are JSON data. Clone carried history too, using the same operation on
  // Hermes and web, so a returned revision cannot mutate the source snapshot.
  const months = JSON.parse(JSON.stringify(carriedMonths));
  for (let monthNumber = fromMonth; monthNumber <= k_monthsPerYear; monthNumber += 1) {
    const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
    const monthlyIncome = incomeChanges
      .filter(change => change.since <= month)
      .sort((first, second) => first.since.localeCompare(second.since))
      .reduce((previousIncome, change) => change.amount, income);
    const monthlyLoan = state.loans
      .filter(loan => loan.start <= month && loan.end >= month)
      .reduce((total, loan) => {
        const payment = loanChanges
          .filter(change => change.loanId === loan.id && change.since <= month)
          .sort((first, second) => first.since.localeCompare(second.since))
          .reduce((previousPayment, change) => change.amount, loan.payment);
        return total + payment;
      }, 0);
    const event = eventsInMonth(state.events || [], month)
      .reduce((total, event) => total + plannedCostAmount(event, year), 0);
    const monthLines = linesForMonth(month);
    const expense = monthLines.reduce((total, line) => total + line.amount, 0) + monthlyLoan + cushion + event;
    months[month] = { income: monthlyIncome, expense, cushion, loan: monthlyLoan, event, lines: monthLines, balance: monthlyIncome - expense };
  }
  return {
    year, incomeChanges, loanChanges, createdAt: new Date().toISOString(), window,
    evidence: estimates.evidence, suggestedCushion: estimates.suggestedCushion,
    tolerance: approvedPlan?.tolerance ?? k_defaultFixedTolerance,
    drift: approvedPlan?.drift ?? k_defaultVariableDrift,
    months, revision: (approvedPlan?.revision || 0) + 1
  };
}
// Drift compares what has posted by today (L01); later entries count from their date.
export function driftAlerts(registeredState, month, today = localCalendarDate()) {
  const state = postedLedger(registeredState, today);
  const approvedPlan = latestPlan(state, yearOfMonth(month));
  const plannedMonth = approvedPlan?.months[month];
  if (!plannedMonth) {
    return [];
  }
  const alerts = [];
  const completedMonths = previousMonths(month, k_completedMonthsForDrift);
  const confirmedMonths = new Set(state.outlook?.completeMonths || []);
  const isConfirmed = completedMonth => confirmedMonths.has(completedMonth);
  const fixedTolerance = approvedPlan.tolerance ?? k_defaultFixedTolerance;
  const variableDrift = approvedPlan.drift ?? k_defaultVariableDrift;

  for (const line of plannedMonth.lines) {
    const latestSpending = lineSpending(state, completedMonths[0], line, month);
    if (line.kind === k_spendingBehaviors.fixed) {
      if (isConfirmed(completedMonths[0]) && latestSpending > 0 && Math.abs(latestSpending - line.amount) > fixedTolerance) {
        alerts.push({ category: line.name, reason: k_driftReasons.fixed });
      }
      continue;
    }
    // Missing or unconfirmed history must not look like a drift.
    if (line.kind !== k_spendingBehaviors.variable || line.amount <= 0 || !completedMonths.every(isConfirmed)) {
      continue;
    }
    const outsideBandForBothMonths = completedMonths.every(completedMonth => (
      Math.abs(lineSpending(state, completedMonth, line, month) - line.amount) / line.amount > variableDrift
    ));
    if (outsideBandForBothMonths) {
      alerts.push({ category: line.name, reason: k_driftReasons.variable });
    }
  }
  return alerts;
}
