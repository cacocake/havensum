import React, { useContext } from 'react';
import { View } from 'react-native';
import { Theme, T } from './ui.jsx';
import { euro } from './money.js';

const k_monthLabelOptions = { month: 'short', year: 'numeric' };

function monthLabel(month) {
  return new Date(`${month}-01T12:00:00`).toLocaleString('en', k_monthLabelOptions);
}

export function planEvidenceSummary(evidence) {
  if (!evidence?.months.length) {
    return 'No usable history yet. Enter the amounts you expect.';
  }
  const months = evidence.months.map(monthLabel).join(', ');
  if (evidence.partial) {
    return `Partial estimate from recorded months not yet confirmed complete: ${months}.`;
  }
  return `Based on months you confirmed complete: ${months}.`;
}

export default function PlanDraftEvidence({ evidence, suggestedCushion }) {
  const colors = useContext(Theme);
  return <View testID="plan-draft-evidence" style={{ backgroundColor: colors.soft, padding: 15, borderRadius: 12, marginBottom: 14, gap: 6 }}>
    <T style={{ fontSize: 12, color: colors.text }}>{planEvidenceSummary(evidence)}</T>
    {evidence?.months.length > 0 && <T style={{ fontSize: 12, color: colors.sub }}>Suggested occasional cushion: {euro(suggestedCushion)} a month, excluding costs planned as named events.</T>}
  </View>;
}

export function PlanBillList({ bills, month }) {
  const colors = useContext(Theme);
  if (!bills.length) {
    return null;
  }
  return <View style={{ marginBottom: 8, gap: 2 }}>
    {bills.map(bill => {
      const isCancelled = Boolean(bill.cancelledSince && bill.cancelledSince <= month);
      const status = isCancelled ? `cancelled from ${monthLabel(bill.cancelledSince)}` : `latest ${euro(bill.amount)}`;
      return <T key={bill.key} style={{ fontSize: 10, color: colors.muted }}>{bill.name || 'Untitled bill'} · {status}</T>;
    })}
  </View>;
}
