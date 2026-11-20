import React, { useContext } from 'react';
import { View } from 'react-native';
import { Theme, T, H, Row, IB } from './ui.jsx';
import { loanPaymentHistory } from './loanPaymentHistory.js';
import { paymentEntryText } from './loanPaymentLabels.js';

// The loan form's history, oldest first. A later entry can be removed to
// correct a mistake; the starting payment changes with a payment from the
// loan's start month.
export function EditablePaymentHistory({ loan, onRemove }) {
  const colors = useContext(Theme);
  const [startingPayment, ...changes] = loanPaymentHistory(loan);
  return <View style={{ marginBottom: 17 }}>
    <H size={17} style={{ marginBottom: 6 }}>Payment history</H>
    <T style={{ fontSize: 12, color: colors.sub }}>{paymentEntryText(startingPayment)}</T>
    {changes.map(change => {
      const description = paymentEntryText(change);
      return <Row key={change.since} style={{ gap: 8, alignItems: 'center' }}>
        <T style={{ flex: 1, minWidth: 0, fontSize: 12, color: colors.sub }}>{description}</T>
        <IB name="Trash2" size={16} label={`Remove ${description}`} onPress={() => onRemove(change.since)} />
      </Row>;
    })}
  </View>;
}
