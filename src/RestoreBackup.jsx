import React, { useContext, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useApp } from './context.js';
import { Theme, T, H, Row, Button, Toggle, Dialog, Divider } from './ui.jsx';
import MissingCategoryReview from './MissingCategoryReview.jsx';
import { applyCategoryReviewEdits, categoryReviewRows } from './categoryReview.js';
import { isRestorePreviewCurrent, prepareFullRestore, restoreSummary } from './fullRestore.js';
import { validateState } from './stateSchema.js';
import { chooseFile, downloadJSON } from './files';
import { isDemoSession, readRestoreRecovery, readSavedLedgerCopy, writeRestoreRecovery, writeState } from './storage';
import { prepareLoadedLedger } from './startupLedger.js';
import { currentLocalMonth } from './calendar.js';

const k_restoreOutcomeMessages = Object.freeze({
  preview: 'Restoring replaces data only on this device and is not available in the preview.',
  stale: 'Your ledger changed after this preview. Choose the backup again to review it against the current ledger.',
  recoveryFailed: 'The current ledger could not be copied for recovery, so nothing was replaced.',
  saveFailed: 'The backup could not be saved, so your ledger is unchanged. A recovery copy of it was kept.',
  restored: 'Backup restored. Your previous ledger is kept as a pre-restore copy.',
  noRecovery: 'No pre-restore copy is saved on this device.'
});

function planYearsText(planYears) {
  if (!planYears.length) {
    return 'none';
  }
  return planYears.map(({ year, revisions }) => `${year} (${revisions} ${revisions === 1 ? 'revision' : 'revisions'})`).join(', ');
}

function SummaryRow({ label, current, restored }) {
  const colors = useContext(Theme);
  return <Row accessible accessibilityLabel={`${label}: ${current} on this device, ${restored} in the backup`} style={{ gap: 8, paddingVertical: 5, borderTopWidth: 1, borderColor: colors.line }}>
    <T style={{ flex: 2, fontSize: 12 }}>{label}</T>
    <T style={{ flex: 1, fontSize: 12, color: colors.sub, textAlign: 'right' }}>{current}</T>
    <T style={{ flex: 1, fontSize: 12, textAlign: 'right' }}>{restored}</T>
  </Row>;
}

function RestorePreview({ preview, onCancel, onRestored }) {
  const { state, setState, notify } = useApp();
  const colors = useContext(Theme);
  const [categoryEdits, setCategoryEdits] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const deviceSummary = restoreSummary(state);
  const backupSummary = preview.summary;
  const reviewRows = useMemo(() => categoryReviewRows(preview.restoredState, preview.missingCategories), [preview]);
  const hasChoices = confirmed || Object.keys(categoryEdits).length > 0;

  function closeUnlessWriting() {
    if (busy) {
      return;
    }
    onCancel();
  }

  async function isStillCurrent() {
    // Another tab or window may have saved since the preview was made.
    return isRestorePreviewCurrent(preview, state, await readSavedLedgerCopy());
  }

  async function replaceLedger() {
    setBusy(true);
    try {
      if (!await isStillCurrent()) {
        notify(k_restoreOutcomeMessages.stale);
        onCancel();
        return;
      }
      const reviewedState = validateState(applyCategoryReviewEdits(preview.restoredState, reviewRows, categoryEdits));
      const restoredState = prepareLoadedLedger(reviewedState, currentLocalMonth());
      try {
        await writeRestoreRecovery(state);
      } catch {
        setError(k_restoreOutcomeMessages.recoveryFailed);
        return;
      }
      try {
        await writeState(restoredState);
      } catch {
        setError(k_restoreOutcomeMessages.saveFailed);
        return;
      }
      setState(restoredState);
      notify(k_restoreOutcomeMessages.restored);
      onRestored();
    } catch (validationError) {
      setError(validationError.message);
    } finally {
      setBusy(false);
    }
  }

  return <Dialog dirty={hasChoices && !busy} title="Restore a full backup" subtitle="Review what will replace this device's ledger. Nothing changes until you confirm." onClose={closeUnlessWriting} width={600}>
    <Row style={{ gap: 8, paddingBottom: 5 }}>
      <T style={{ flex: 2, fontSize: 10, color: colors.muted }}>Records</T>
      <T style={{ flex: 1, fontSize: 10, color: colors.muted, textAlign: 'right' }}>This device</T>
      <T style={{ flex: 1, fontSize: 10, color: colors.muted, textAlign: 'right' }}>Backup</T>
    </Row>
    <View testID="restore-summary">
      <SummaryRow label="Accounts" current={deviceSummary.accounts} restored={backupSummary.accounts} />
      <SummaryRow label="Transactions" current={deviceSummary.transactions} restored={backupSummary.transactions} />
      <SummaryRow label="Categories" current={deviceSummary.categories} restored={backupSummary.categories} />
      <SummaryRow label="Loans" current={deviceSummary.loans} restored={backupSummary.loans} />
      <SummaryRow label="Planned costs" current={deviceSummary.events} restored={backupSummary.events} />
      <SummaryRow label="Accounts with scheduled rates" current={deviceSummary.scheduledRateAccounts} restored={backupSummary.scheduledRateAccounts} />
    </View>
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 10 }}>Accounts on this device: {deviceSummary.accountNames.join(', ') || 'none'}.</T>
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 4 }}>Accounts in the backup: {backupSummary.accountNames.join(', ') || 'none'}.</T>
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 4 }}>Archived plans on this device: {planYearsText(deviceSummary.planYears)}.</T>
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 4 }}>Archived plans in the backup: {planYearsText(backupSummary.planYears)}.</T>
    <MissingCategoryReview rows={reviewRows} categories={preview.restoredState.categories} edits={categoryEdits}
      onChange={(key, change) => setCategoryEdits(previous => ({ ...previous, [key]: { ...previous[key], ...change } }))} />
    <Divider />
    <Toggle value={confirmed} onChange={setConfirmed} label="Replace this device's ledger"
      description="Every account, transaction, plan and setting here is replaced by the backup. The current ledger is kept as a pre-restore copy first. The shared merge baseline is not changed." />
    {error ? <T accessibilityRole="alert" style={{ color: colors.negative, marginTop: 12 }}>{error}</T> : null}
    <Row style={{ justifyContent: 'space-between', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
      <Button kind="soft" disabled={busy} onPress={closeUnlessWriting}>Cancel</Button>
      <Button icon="Check" disabled={!confirmed || busy} onPress={replaceLedger}>Restore this backup</Button>
    </Row>
  </Dialog>;
}

export default function RestoreBackup() {
  const { state, notify } = useApp();
  const colors = useContext(Theme);
  const [preview, setPreview] = useState(null);
  const isPreviewSession = isDemoSession();

  async function chooseBackup() {
    if (isPreviewSession) {
      notify(k_restoreOutcomeMessages.preview);
      return;
    }
    try {
      const file = await chooseFile('.json');
      if (!file) {
        return;
      }
      const fileText = await file.text();
      setPreview(prepareFullRestore(fileText, state));
    } catch (error) {
      notify(error.message);
    }
  }

  async function downloadPreRestoreCopy() {
    try {
      const recovery = await readRestoreRecovery();
      if (!recovery) {
        notify(k_restoreOutcomeMessages.noRecovery);
        return;
      }
      await downloadJSON(recovery);
    } catch (error) {
      notify(error.message);
    }
  }

  return <View style={{ gap: 10 }}>
    <H size={18}>Restore everything from a backup</H>
    <T style={{ fontSize: 12, color: colors.sub }}>Replaces this device's ledger with a full JSON backup after a preview. Use backup merge to combine two devices, and Import transactions to append entries.</T>
    <Row style={{ gap: 10, flexWrap: 'wrap' }}>
      <Button small kind="outline" icon="Upload" disabled={isPreviewSession} onPress={chooseBackup}>Restore full backup</Button>
      <Button small kind="soft" disabled={isPreviewSession} onPress={downloadPreRestoreCopy}>Download pre-restore copy</Button>
    </Row>
    {preview && <RestorePreview preview={preview} onCancel={() => setPreview(null)} onRestored={() => setPreview(null)} />}
  </View>;
}
