import React, { useContext } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Theme, T, H, Row, Card } from './ui.jsx';
import { euro } from './money.js';

const k_phoneComparisonWidth = 600;

export default function MonthComparison({ actual, plan, prediction, ink }) {
  const colors = useContext(Theme);
  const { width } = useWindowDimensions();
  const stacked = width < k_phoneComparisonWidth;
  const columns = [
    { label: 'Recorded', color: ink.actual },
    { label: 'Planned', color: ink.plan },
    { label: 'Expected', color: ink.forecast }
  ];
  const rows = [
    { label: 'Income', values: [actual.income, plan?.income, prediction?.income] },
    { label: 'Spending', values: [actual.spent, plan?.expense, prediction?.expense] },
    { label: 'Savings', values: [actual.balance, plan?.balance, prediction?.balance] }
  ];
  return <Card testID="month-comparison" style={{ padding: 19 }}>
    <H size={23}>Three views of your month</H>
    <T style={{ color: colors.sub, fontSize: 12, marginTop: 8, marginBottom: 18 }}>Recorded is activity so far. Planned stays frozen. Expected estimates the final result independently.</T>
    {!stacked && <Row style={{ marginBottom: 12, gap: 12 }}>
      <View style={{ flex: 1 }} />
      {columns.map(column => <T key={column.label} style={{ flex: 1, color: column.color, textAlign: 'right' }}>{column.label}</T>)}
    </Row>}
    {rows.map(row => <View key={row.label} style={{ paddingVertical: 14, borderTopWidth: 1, borderColor: colors.line }}>
      {stacked ? <>
        <T style={{ fontWeight: '700', marginBottom: 10 }}>{row.label}</T>
        {columns.map((column, index) => <Row key={column.label} style={{ gap: 8, justifyContent: 'space-between', marginTop: 7 }}>
          <T style={{ color: column.color, fontSize: 12 }}>{column.label}</T>
          <T style={{ color: column.color, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{row.values[index] == null ? '—' : euro(row.values[index])}</T>
        </Row>)}
      </> : <Row style={{ gap: 12 }}>
        <T style={{ flex: 1, fontWeight: row.label === 'Savings' ? '700' : '500' }}>{row.label}</T>
        {columns.map((column, index) => <T key={column.label} style={{ flex: 1, color: column.color, textAlign: 'right' }}>{row.values[index] == null ? '—' : euro(row.values[index])}</T>)}
      </Row>}
    </View>)}
    <T style={{ color: colors.sub, fontSize: 12, marginTop: 8 }}>Savings = income − net spending. Transfers to savings accounts do not count as spending.</T>
  </Card>;
}
