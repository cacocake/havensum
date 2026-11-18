import React, { useContext } from 'react';
import { View } from 'react-native';
import { Theme, Card, H, T, Row, Button, TileIcon, Divider } from './ui.jsx';
import { useApp } from './context.js';
import { exportTransactionsCsv, downloadCsvTemplate, downloadCsvGuide, downloadJSON } from './files';
import { readImportRecovery } from './storage';

export default function DataTools({ onImport, onBackup, onExcel, busy }) {
  const { state, notify } = useApp();
  const colors = useContext(Theme);

  async function downloadFile(action) {
    try {
      await action();
    } catch (error) {
      notify(error.message);
    }
  }

  async function downloadRecovery() {
    const recovery = await readImportRecovery();
    if (!recovery) {
      notify('No pre-import backup is saved on this device.');
      return;
    }
    await downloadJSON(recovery);
  }

  return (
    <Card>
      <Row style={{ gap: 12, marginBottom: 20 }}>
        <TileIcon name="ArrowDownToLine" color="#91A4CE" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <H size={22}>Your data travels with you</H>
          <T style={{ fontSize: 12, color: colors.sub, marginTop: 4 }}>Portable files. No bank connection.</T>
        </View>
      </Row>
      <Row style={{ gap: 10, flexWrap: 'wrap' }}>
        <Button small icon="Download" onPress={() => downloadFile(() => exportTransactionsCsv(state))}>Export transactions CSV</Button>
        <Button small kind="outline" icon="Upload" onPress={onImport}>Import transactions</Button>
        <Button small kind="outline" onPress={() => downloadFile(downloadCsvTemplate)}>Download CSV template</Button>
        <Button small kind="soft" onPress={() => downloadFile(downloadCsvGuide)}>Download CSV guide</Button>
      </Row>
      <T style={{ fontSize: 12, color: colors.sub, marginTop: 16 }}>Enter dates, titles, positive EUR amounts, account and category names in the blank template. Expenses are the default. Preview mappings and duplicate choices before appending.</T>
      <Divider />
      <Row style={{ gap: 10, flexWrap: 'wrap' }}>
        <Button small kind="outline" icon="Download" onPress={onBackup}>Full JSON backup</Button>
        <Button small kind="soft" icon="Sheet" disabled={busy} onPress={onExcel}>{busy ? 'Preparing Excel…' : 'Export Excel'}</Button>
        <Button small kind="soft" onPress={() => downloadFile(downloadRecovery)}>Download pre-import backup</Button>
      </Row>
      <T style={{ fontSize: 12, color: colors.sub, marginTop: 16 }}>CSV exchanges transactions. JSON preserves settings, links and frozen plans. Excel remains available as a legacy summary and import format. Exact Cashew and bank compatibility need verified samples.</T>
    </Card>
  );
}
