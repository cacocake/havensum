import React, { useContext } from 'react';
import { useApp } from './context.js';
import { Theme, T, Button, Dialog } from './ui.jsx';
import { longMonthLabel } from './monthLabels.js';

// Owner decision P09: after a loan payment change, the owner chooses whether
// the plan follows it. Keeping the plan changes nothing; revising opens the
// interview from the month the payment changed.
export function LoanPlanPrompt({ offer, previousLoan, loanName, onClose }) {
  const { setModal } = useApp();
  const colors = useContext(Theme);
  return <Dialog title="Revise your plan?" onClose={onClose}>
    <T style={{ marginBottom: 10 }}>Your {offer.year} plan still uses the earlier {loanName} payment.</T>
    <T style={{ fontSize: 12, color: colors.sub, marginBottom: 20 }}>Keep my plan: nothing changes, and the difference shows against the plan. Revise: the interview opens with the payment history prefilled and freezes a new revision; earlier revisions stay viewable.</T>
    <Button onPress={() => setModal({ type: 'plan', loanRevision: offer, previousLoan })}>{`Revise from ${longMonthLabel(offer.reviseFrom)}`}</Button>
    <Button kind="outline" style={{ marginTop: 10 }} onPress={onClose}>Keep my plan</Button>
  </Dialog>;
}
