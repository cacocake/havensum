import React, { useContext, useMemo } from 'react';
import { View } from 'react-native';
import { useApp } from './context.js';
import { Theme, T, H, Row, Badge, Card } from './ui.jsx';
import Icon from './Icon';
import { Squish } from './Playful.jsx';
import { euro, signedEuro } from './money.js';
import { yearOutlook } from './yearOutlook.js';
import { k_monthsPerYear, k_reportingPeriods } from './domainConstants.js';
import { monthNumberOf } from './calendar.js';

const k_metrics = [
  { key: 'income', label: 'Income', format: euro },
  { key: 'expense', label: 'Expenses', format: euro },
  { key: 'balance', label: 'Savings', format: signedEuro }
];
const k_valueMinimumWidth = 92;

function monthDate(month) {
  return new Date(`${month}-01T12:00:00`);
}

function shortMonthName(month) {
  return monthDate(month).toLocaleString('en', { month: 'short' });
}

function longMonthName(month) {
  return monthDate(month).toLocaleString('en', { month: 'long' });
}

function monthYearName(month) {
  return monthDate(month).toLocaleString('en', { month: 'long', year: 'numeric' });
}

// "Jun–Dec" for consecutive months, otherwise a list of short names.
function monthRangeName(months) {
  if (!months.length) {
    return '';
  }
  const isConsecutive = months.every((month, index) => index === 0 || monthNumberOf(month) === monthNumberOf(months[index - 1]) + 1);
  if (isConsecutive && months.length > 2) {
    return `${shortMonthName(months[0])}–${shortMonthName(months.at(-1))}`;
  }
  return months.map(shortMonthName).join(', ');
}

// Recorded, Expected and Planned side by side for one year. Read-only:
// estimates never enter the ledger and a target never moves the forecast.
export default function YearOutlook({ year, selectedMonth, planRevisionId, ink, onSelectMonth }) {
  const { state } = useApp();
  const outlook = useMemo(() => yearOutlook(state, year, undefined, { planRevisionId }), [state, year, planRevisionId]);
  return <View style={{ gap: 18 }}>
    <YearSummary outlook={outlook} ink={ink}/>
    <OutlookDrivers drivers={outlook.drivers}/>
    <OutlookMonths outlook={outlook} selectedMonth={selectedMonth} ink={ink} onSelectMonth={onSelectMonth}/>
  </View>;
}

function YearSummary({ outlook, ink }) {
  const colors = useContext(Theme);
  const isPartialPlan = outlook.planned && outlook.plannedMonths.length < k_monthsPerYear;
  const plannedLabel = isPartialPlan ? `Planned · ${monthRangeName(outlook.plannedMonths)}` : 'Planned';
  const columns = [
    { key: 'recorded', label: 'Recorded', color: ink.actual, totals: outlook.recorded },
    { key: 'expected', label: 'Expected', color: ink.forecast, totals: outlook.expected },
    { key: 'planned', label: plannedLabel, color: ink.plan, totals: outlook.planned }
  ];
  return <Card testID="year-outlook-summary" style={{ padding: 21, backgroundColor: colors.cream, borderColor: 'transparent' }}>
    <Row style={{ justifyContent: 'space-between', gap: 10 }}>
      <H size={25} style={{ flex: 1 }}>{outlook.year} at a glance</H>
      <Icon name="ChartNoAxesCombined" size={21} color={ink.forecast}/>
    </Row>
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 8 }}>Expected combines recorded past months with estimates for this month and later. This month’s estimate already includes its recorded activity, so it counts once.</T>
    {k_metrics.map(metric => <View key={metric.key} style={{ marginTop: 16 }}>
      <T style={{ fontWeight: '600' }}>{metric.label}</T>
      <Row style={{ flexWrap: 'wrap', gap: 10, marginTop: 6, alignItems: 'flex-start' }}>
        {columns.map(column => <View key={column.key} accessible accessibilityLabel={`${metric.label} ${column.label}: ${column.totals ? metric.format(column.totals[metric.key]) : 'no target'}`} style={{ flex: 1, minWidth: k_valueMinimumWidth }}>
          <T style={{ fontSize: 12, color: column.color }}>{column.label}</T>
          <T testID={`year-${column.key}-${metric.key}`} style={{ color: column.color, fontWeight: '600' }}>{column.totals ? metric.format(column.totals[metric.key]) : 'No target'}</T>
        </View>)}
      </Row>
    </View>)}
    <VarianceNote outlook={outlook}/>
    <EvidenceNotes outlook={outlook}/>
  </Card>;
}

function VarianceNote({ outlook }) {
  const colors = useContext(Theme);
  if (!outlook.planned) {
    return <T testID="year-variance" style={{ fontSize: 12, color: colors.sub, marginTop: 14 }}>No frozen target for {outlook.year}. The forecast is shown without a variance.</T>;
  }
  if (outlook.variance === null) {
    return <T testID="year-variance" style={{ fontSize: 12, color: colors.sub, marginTop: 14 }}>No planned month has an outlook to compare yet.</T>;
  }
  const isAbove = outlook.variance >= 0;
  const color = isAbove ? colors.positive : colors.negative;
  const comparedMonths = outlook.comparableMonths.length < k_monthsPerYear ? ` across ${monthRangeName(outlook.comparableMonths)}` : '';
  const message = outlook.variance === 0
    ? `Expected savings match planned savings${comparedMonths}`
    : `${euro(Math.abs(outlook.variance))} ${isAbove ? 'above' : 'below'} planned savings${comparedMonths}`;
  return <Row style={{ gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
    <Icon name={isAbove ? 'ArrowUpRight' : 'ArrowDownRight'} size={19} color={color}/>
    <T testID="year-variance" style={{ flex: 1, minWidth: 160, color, fontWeight: '600' }}>{message}</T>
  </Row>;
}

function EvidenceNotes({ outlook }) {
  const colors = useContext(Theme);
  return <>
    {outlook.unavailableMonths.length > 0 && <T testID="year-unavailable-months" style={{ fontSize: 12, color: colors.sub, marginTop: 10 }}>Not enough evidence for {monthRangeName(outlook.unavailableMonths)}. {outlook.unavailableMonths.length === 1 ? 'It is' : 'They are'} left out of the expected total.</T>}
    {outlook.partialMonths.length > 0 && <T testID="year-partial-months" style={{ fontSize: 12, color: colors.sub, marginTop: 10 }}>Partial estimate for {monthRangeName(outlook.partialMonths)}: history has not been confirmed complete.</T>}
  </>;
}

function DriverLine({ label, amount, children }) {
  const colors = useContext(Theme);
  return <View style={{ paddingVertical: 10, borderTopWidth: 1, borderColor: colors.line }}>
    <Row style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <T style={{ flex: 1, minWidth: 140 }}>{label}</T>
      {amount !== undefined && <T style={{ fontWeight: '600' }}>{euro(amount)}</T>}
    </Row>
    {children}
  </View>;
}

function DriverDetail({ children }) {
  const colors = useContext(Theme);
  return <T style={{ fontSize: 12, color: colors.sub, marginTop: 3 }}>{children}</T>;
}

function ratePeriodsText(periods) {
  return periods.map(period => `${period.rate}% from ${monthYearName(period.since)}`).join(' · ');
}

// What the expected months rest on. Read-only; it explains, never applies.
function OutlookDrivers({ drivers }) {
  const colors = useContext(Theme);
  if (!drivers.forecastMonths.length) {
    return null;
  }
  return <Card testID="year-outlook-drivers" style={{ padding: 19 }}>
    <H size={22}>What shapes the expected months</H>
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 8, marginBottom: 8 }}>Totals for {monthRangeName(drivers.forecastMonths)}. Estimates stay out of your ledger.</T>
    <DriverLine label="Income changes">
      {drivers.incomeChanges.length
        ? drivers.incomeChanges.map(change => <DriverDetail key={change.since}>{euro(change.amount)}/month from {monthYearName(change.since)}</DriverDetail>)
        : <DriverDetail>None scheduled this year. Income follows your history.</DriverDetail>}
    </DriverLine>
    <DriverLine label="Bills" amount={drivers.fixed}>
      {drivers.bills.map(bill => <DriverDetail key={bill.key}>{bill.name} · {euro(bill.expected)}{bill.cancelledSince ? ` · cancelled from ${monthYearName(bill.cancelledSince)}` : ''}</DriverDetail>)}
    </DriverLine>
    <DriverLine label="Loans" amount={drivers.loans}>
      {drivers.activeLoans.map(loan => <DriverDetail key={loan.id}>{loan.name} · {euro(loan.payment)}/month through {monthYearName(loan.end)}</DriverDetail>)}
      {drivers.loanChanges.map(change => <DriverDetail key={`${change.loanId}-${change.since}`}>{change.name} · {euro(change.amount)}/month from {monthYearName(change.since)}</DriverDetail>)}
    </DriverLine>
    <DriverLine label="Everyday spending" amount={drivers.variable}/>
    <DriverLine label="Named costs and reserve" amount={drivers.occasional}>
      <DriverDetail>Occasional reserve {euro(drivers.monthlyReserve)}/month. Known costs use it up first.</DriverDetail>
      {drivers.namedCosts.map(cost => <DriverDetail key={`${cost.id}-${cost.month}`}>{cost.name} · {longMonthName(cost.month)} · {euro(cost.remaining)} still to pay of {euro(cost.amount)}</DriverDetail>)}
    </DriverLine>
    {drivers.interest.map(line => <DriverLine key={line.account} label={`Interest · ${line.name}`} amount={line.expected}>
      <DriverDetail>{line.estimated ? `${euro(line.estimated)} estimated from scheduled rates` : 'No estimated interest'}{line.recorded ? ` · ${euro(line.recorded)} recorded` : ''}</DriverDetail>
      {line.periods.length > 0 && <DriverDetail>{ratePeriodsText(line.periods)}</DriverDetail>}
    </DriverLine>)}
  </Card>;
}

function expectedText(month) {
  if (!month.expected) {
    return 'Unavailable';
  }
  return signedEuro(month.expected.balance);
}

// L01: Recorded is what has posted by today; a future month records only
// early payments linked to it.
function recordedCell(month, color) {
  if (month.period === k_reportingPeriods.future && !month.recorded) {
    return { key: 'recorded', label: 'Recorded', color, text: '—', spokenText: 'nothing yet' };
  }
  if (!month.hasRecords && !month.isConfirmedComplete) {
    return { key: 'recorded', label: 'Recorded', color, text: 'No records' };
  }
  return { key: 'recorded', label: 'Recorded', color, text: signedEuro(month.recorded.balance) };
}

// Entries dated after today, in any month. They count from their date.
function scheduledCells(month, color) {
  if (!month.scheduled) {
    return [];
  }
  return [{ key: 'scheduled', label: 'Scheduled', color, text: signedEuro(month.scheduled.balance) }];
}

function monthCells(month, ink) {
  return [
    { key: 'plan', label: 'Plan', color: ink.plan, text: month.planned ? signedEuro(month.planned.balance) : 'Not set' },
    recordedCell(month, ink.actual),
    ...scheduledCells(month, ink.actual),
    { key: 'expected', label: month.partial ? 'Expected · partial' : 'Expected', color: ink.forecast, text: expectedText(month) }
  ];
}

// The row's label replaces its children for screen readers, so it carries every value.
function monthAccessibilityLabel(month, cells) {
  const values = cells.map(cell => `${cell.label} ${cell.spokenText ?? cell.text}`).join('. ');
  return `${monthYearName(month.month)}. ${values}. Opens the month's plan`;
}

function OutlookMonths({ outlook, selectedMonth, ink, onSelectMonth }) {
  const colors = useContext(Theme);
  return <Card style={{ padding: 19 }}>
    <H size={25}>{outlook.year}, month by month</H>
    <T style={{ color: colors.sub, fontSize: 12, marginTop: 8, marginBottom: 15 }}>Purple is planned savings, blue is recorded and amber is expected. Scheduled entries are dated after today and count from their date. Select a month to see its forecast and breakdown.</T>
    {outlook.months.map(month => {
      const isSelected = month.month === selectedMonth;
      const cells = monthCells(month, ink);
      return <Squish key={month.month} testID={`year-month-${month.month}`} accessibilityLabel={monthAccessibilityLabel(month, cells)} onPress={() => onSelectMonth(month.month)} style={{ padding: 14, minHeight: 85, marginBottom: 8, borderRadius: 17, borderWidth: 1, borderColor: isSelected ? ink.plan : colors.line, backgroundColor: isSelected ? colors.soft : 'transparent' }}>
        <Row style={{ justifyContent: 'space-between', gap: 12 }}>
          <H size={20} style={{ flex: 1 }}>{longMonthName(month.month)}</H>
          {month.period === k_reportingPeriods.current && <Badge color={ink.forecast}>THIS MONTH</Badge>}
          <Icon name="ChevronRight" size={16} color={colors.sub}/>
        </Row>
        <Row style={{ gap: 12, marginTop: 9, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {cells.map(cell => <View key={cell.key} style={{ flex: 1, minWidth: k_valueMinimumWidth }}>
            <T style={{ fontSize: 12, color: cell.color }}>{cell.label}</T>
            <T testID={`year-month-${month.month}-${cell.key}`} style={{ color: cell.color, fontWeight: '600' }}>{cell.text}</T>
          </View>)}
        </Row>
      </Squish>;
    })}
  </Card>;
}
