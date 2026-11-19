import React, { useContext } from 'react';
import { View } from 'react-native';
import { Theme, H, T, Row, Button } from './ui.jsx';
import { euro, signedEuro } from './money.js';
import { formatReviewRowLabel } from './importOutcomes.js';

export function AccountBalanceReview({ balances, afterLabel }) {
  const colors = useContext(Theme);
  if (balances.length === 0) {
    return null;
  }
  return (
    <View style={{ backgroundColor: colors.soft, borderRadius: 14, padding: 12, gap: 8, marginBottom: 16 }}>
      <H size={18}>Account balances</H>
      <T style={{ fontSize: 12, color: colors.sub }}>Balances as of today. Entries dated later count from their date.</T>
      {balances.map(balance => (
        <View key={balance.id} style={{ gap: 4 }}>
          <T style={{ fontWeight: '600' }}>{balance.name}</T>
          <Row style={{ flexWrap: 'wrap', gap: 10 }}>
            <T style={{ fontSize: 12 }}>Before {euro(balance.before)}</T>
            <T style={{ fontSize: 12 }}>
              {balance.after === null ? 'Projected balance pending review' : `${afterLabel} ${euro(balance.after)}`}
            </T>
            {Boolean(balance.scheduledAfter) && <T style={{ fontSize: 12 }}>Scheduled after import {signedEuro(balance.scheduledAfter)}</T>}
          </Row>
        </View>
      ))}
    </View>
  );
}

export default function ImportResults({ results, fields, displayField, onDownloadRecovery, onDone }) {
  const colors = useContext(Theme);
  const multipleStatements = results.rows.some(row => row.bank?.statementNumber > 1);
  return (
    <>
      <Row style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {Object.entries(results.counts).map(([outcome, count]) => (
          <T key={outcome} style={{ fontWeight: '600' }}>{count} {outcome}</T>
        ))}
      </Row>
      <AccountBalanceReview balances={results.balances} afterLabel="After" />
      {results.rows.map(row => {
        const { transaction } = row;
        return (
          <View key={row.index} style={{ gap: 5, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line }}>
            <T style={{ fontSize: 12, color: colors.sub }}>{formatReviewRowLabel(row, multipleStatements)} · {row.label}</T>
            <T style={{ fontWeight: '600' }}>{transaction.title}</T>
            {transaction.amount !== undefined && (
              <T style={{ fontSize: 12, color: colors.sub }}>
                {transaction.date} · {transaction.type || row.bank?.direction} · {displayField('account', transaction.account)}
                {transaction.toAccount !== undefined && ` → ${displayField('toAccount', transaction.toAccount)}`}
                {' · '}{euro(transaction.amount)}
              </T>
            )}
            {row.status === 'invalid' && <T style={{ fontSize: 12, color: colors.sub }}>{row.error}</T>}
            {transaction.category != null && <T style={{ fontSize: 12, color: colors.sub }}>{displayField('category', transaction.category)}</T>}
            {transaction.note && <T style={{ fontSize: 12, color: colors.sub }}>{transaction.note}</T>}
            {transaction.kind && <T style={{ fontSize: 12, color: colors.sub }}>Spending behaviour · {transaction.kind}</T>}
            {transaction.linkedId != null && <T style={{ fontSize: 12, color: colors.sub }}>Linked expense · {displayField('linkedId', transaction.linkedId)}</T>}
            {transaction.loanId != null && <T style={{ fontSize: 12, color: colors.sub }}>Loan · {displayField('loanId', transaction.loanId)}</T>}
            {row.outcome === 'updated' && Object.entries(fields)
              .filter(([field]) => (row.existing[field] ?? '') !== (transaction[field] ?? ''))
              .map(([field, label]) => (
                <T key={field} style={{ fontSize: 12, color: colors.sub }}>
                  {label} · {displayField(field, row.existing[field])} → {displayField(field, transaction[field])}
                </T>
              ))}
          </View>
        );
      })}
      <Row style={{ gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        {onDownloadRecovery && <Button kind="soft" onPress={onDownloadRecovery}>Download pre-import backup</Button>}
        <Button onPress={onDone}>Done</Button>
      </Row>
    </>
  );
}
