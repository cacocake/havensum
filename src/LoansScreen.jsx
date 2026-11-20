import React, { useContext } from 'react';
import { View } from 'react-native';
import { useApp } from './context.js';
import { Theme, T, H, Row, Button, IB, TileIcon, Card, Divider, Empty } from './ui.jsx';
import Icon from './Icon';
import { euro } from './money.js';
import { monthOf } from './calendar.js';
import { k_systemCategoryIds, k_transactionTypes } from './domainConstants.js';
import { loanPaymentInMonth } from './loanPaymentHistory.js';
import { paymentHistoryText } from './loanPaymentLabels.js';

const k_loanTileColor = '#C3A58D';
const k_monthKeyLength = 7;

// Loan repayments recorded within the loan's months: linked to the loan, or
// legacy entries matching its name and account.
function recordedLoanPayments(state, loan) {
  return state.transactions
    .filter(transaction => {
      const isRepayment = transaction.type === k_transactionTypes.expense && transaction.category === k_systemCategoryIds.loan;
      const isForLoan = transaction.loanId === loan.id || (!transaction.loanId && transaction.title === loan.name);
      const month = transaction.date.slice(0, k_monthKeyLength);
      return isRepayment && isForLoan && transaction.account === loan.account && month >= loan.start && month <= loan.end;
    })
    .reduce((total, transaction) => total + transaction.amount, 0);
}

function LoanFigure({ label, amount }) {
  const colors = useContext(Theme);
  return <View>
    <T style={{ fontSize: 11, color: colors.sub }}>{label}</T>
    <H size={28} style={{ marginTop: 5 }}>{euro(amount)}</H>
  </View>;
}

function LoanCard({ loan }) {
  const { state, setModal, today } = useApp();
  const colors = useContext(Theme);
  const accountName = state.accounts.find(account => account.id === loan.account)?.name;
  return <Card>
    <Row style={{ gap: 15 }}>
      <TileIcon name="Landmark" color={k_loanTileColor} size={49} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <H size={23}>{loan.name}</H>
        <T style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{loan.start} → {loan.end} · {accountName}</T>
      </View>
      <IB name="Pencil" label={`Edit ${loan.name}`} onPress={() => setModal({ type: 'loan', item: loan })} />
    </Row>
    <Row style={{ gap: 30, marginTop: 26, flexWrap: 'wrap' }}>
      <LoanFigure label="Recorded remaining balance" amount={loan.remaining} />
      <LoanFigure label="Monthly repayment" amount={loanPaymentInMonth(loan, monthOf(today))} />
      <LoanFigure label="Payments recorded in Havensum" amount={recordedLoanPayments(state, loan)} />
    </Row>
    <T style={{ fontSize: 11, color: colors.sub, marginTop: 12 }}>Payment history · {paymentHistoryText(loan)}</T>
    <Divider />
    <T style={{ fontSize: 11, color: colors.sub }}>Repayments count as expenses when recorded. Your recorded remaining balance is manual; interest and principal allocations are not guessed.</T>
    <Row style={{ marginTop: 17, justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
      <Button small kind="soft" icon="Plus" onPress={() => setModal({ type: 'transaction', item: null, initialType: k_transactionTypes.expense, loan })}>Record payment</Button>
    </Row>
  </Card>;
}

export function Loans() {
  const { state, setModal } = useApp();
  const colors = useContext(Theme);
  return <View style={{ gap: 20 }}>
    <Row style={{ justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <H size={24}>Steady steps, month by month.</H>
        <T style={{ fontSize: 12, color: colors.sub, marginTop: 8 }}>Track an existing loan without changing any account balance.</T>
      </View>
      <Button small icon="Plus" onPress={() => setModal({ type: 'loan' })}>Add loan</Button>
    </Row>
    {state.loans.length
      ? state.loans.map(loan => <LoanCard key={loan.id} loan={loan} />)
      : <Card><Empty title="Room to start" description="Add a loan to forecast monthly repayments. Proceeds are optional." /></Card>}
    <Card>
      <Row style={{ gap: 12 }}>
        <Icon name="Info" color={colors.sub} size={20} />
        <T style={{ flex: 1, fontSize: 12, color: colors.sub }}>Adding a loan suggests a remaining-year plan revision. The frozen plan changes only when you approve a new snapshot.</T>
      </Row>
    </Card>
  </View>;
}
