import React, { useContext } from 'react';
import { View } from 'react-native';
import { Theme, T, Row, Button, Badge } from './ui.jsx';
import { sharedFileStatusView } from './sharedFileStatus.js';

const k_actionIcons = Object.freeze({
  open: 'FolderOpen',
  create: 'FilePlus2',
  syncNow: 'RefreshCw',
  reconnect: 'LogIn',
  review: 'GitMerge',
  downloadRemote: 'Download'
});

// The Google Drive row of the sharing card. Until DRIVE-2b supplies a real
// transport, it reports that sync is not set up and keeps its actions disabled.
export default function SharedFileStatus({ status = 'notConnected', reason = null, isDemo, isTransportAvailable = false, onAction = () => {} }) {
  const c = useContext(Theme);
  const view = sharedFileStatusView({ status, reason, isDemo, isTransportAvailable });
  const hints = [...new Set(view.actions.map(action => action.hint).filter(Boolean))];
  return (
    <View testID="shared-file-status">
      <Row style={{ justifyContent: 'space-between', gap: 12 }}>
        <T style={{ fontSize: 13 }}>Google Drive</T>
        <Badge>{view.title}</Badge>
      </Row>
      <T style={{ fontSize: 12, color: c.sub, marginTop: 12 }}>{view.description}</T>
      {view.actions.length > 0 && (
        <Row style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {view.actions.map(action => (
            <Button key={action.id} small kind={action.id === 'create' ? 'soft' : 'outline'} icon={k_actionIcons[action.id]} disabled={action.disabled} onPress={() => onAction(action.id)}>
              {action.label}
            </Button>
          ))}
        </Row>
      )}
      {hints.map(hint => (
        <T key={hint} style={{ fontSize: 11, color: c.muted, marginTop: 8 }}>{hint}</T>
      ))}
    </View>
  );
}
