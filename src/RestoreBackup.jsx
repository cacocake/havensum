import React, { useContext, useState } from 'react';
import { View } from 'react-native';
import { useApp } from './context.js';
import { Theme, T, H, Row, Button, Toggle, Dialog, Divider } from './ui.jsx';
import MissingCategoryReview from './MissingCategoryReview.jsx';
import { applyCategoryReviewEdits, categoryReviewRows } from './categoryReview.js';
import { isRestorePreviewCurrent, prepareFullRestore, restoreSummary } from './fullRestore.js';
import { validateState } from './stateSchema.js';
import { chooseFile, downloadJSON } from './files';
import { isDemoSession, readRestoreRecovery, writeRestoreRecovery, writeState } from './storage';

const k_restoreMessages = Object.freeze({
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
  return <Row style={{ gap: 8, paddingVertical: 5, borderTopWidth: 1, borderColor: colors.line }}>
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
  const current = restoreSummary(state);
  const restored = preview.summary;
  const rows = categoryReviewRows(preview.restoredState, preview.missingCategories);

  async function replaceLedger() {
    if (!isRestorePreviewCurrent(preview, state)) {
      notify(k_restoreMessages.stale);
      onCancel();
      return;
    }
    setBusy(true);
    try {
      const restoredState = validateState(applyCategoryReviewEdits(preview.restoredState, rows, categoryEdits));
      try {
        await writeRestoreRecovery(state);
      } catch {
        setError(k_restoreMessages.recoveryFailed);
        return;
      }
      try {
        await writeState(restoredState);
      } catch {
        setError(k_restoreMessages.saveFailed);
        return;
      }
      setState(restoredState);
      notify(k_restoreMessages.restored);
      onRestored();
    } catch (validationError) {
      setError(validationError.message);
    } finally {
      setBusy(false);
    }
  }

  return <Dialog title="Restore a full backup" subtitle="Review what will replace this device's ledger. Nothing changes until you confirm." onClose={onCancel} width={600}>
    <Row style={{ gap: 8, paddingBottom: 5 }}>
      <T style={{ flex: 2, fontSize: 10, color: colors.muted }}>Records</T>
      <T style={{ flex: 1, fontSize: 10, color: colors.muted, textAlign: 'right' }}>This device</T>
      <T style={{ flex: 1, fontSize: 10, color: colors.muted, textAlign: 'right' }}>Backup</T>
    </Row>
    <View testID="restore-summary">
      <SummaryRow label="Accounts" current={current.accounts} restored={restored.accounts} />
      <SummaryRow label="Transactions" current={current.transactions} restored={restored.transactions} />
      <SummaryRow label="Categories" current={current.categories} restored={restored.categories} />
      <SummaryRow label="Loans" current={current.loans} restored={restored.loans} />
      <SummaryRow label="Planned costs" current={current.events} restored={restored.events} />
      <SummaryRow label="Accounts with scheduled rates" current={current.scheduledRateAccounts} restored={restored.scheduledRateAccounts} />
    </View>
    <T style={{ fontSize: 12, color: colors.sub, marginTop: 10 }}>Archived plans in the backup: {planYearsText(restored.planYears)}.</T>
    <MissingCategoryReview rows={rows} categories={preview.restoredState.categories} edits={categoryEdits}
      onChange={(key, change) => setCategoryEdits(previous => ({ ...previous, [key]: { ...previous[key], ...change } }))} />
    <Divider />
    <Toggle value={confirmed} onChange={setConfirmed} label="Replace this device's ledger"
      description="Every account, transaction, plan and setting here is replaced by the backup. The current ledger is kept as a pre-restore copy first. The shared merge baseline is not changed." />
    {error ? <T accessibilityRole="alert" style={{ color: colors.negative, marginTop: 12 }}>{error}</T> : null}
    <Row style={{ justifyContent: 'space-between', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
      <Button kind="soft" onPress={onCancel}>Cancel</Button>
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
      notify(k_restoreMessages.preview);
      return;
    }
    try {
      const file = await chooseFile('.json');
      if (!file) {
        return;
      }
      setPreview(prepareFullRestore(await file.text(), state));
    } catch (error) {
      notify(error.message);
    }
  }

  async function downloadPreRestoreCopy() {
    try {
      const recovery = await readRestoreRecovery();
      if (!recovery) {
        notify(k_restoreMessages.noRecovery);
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
