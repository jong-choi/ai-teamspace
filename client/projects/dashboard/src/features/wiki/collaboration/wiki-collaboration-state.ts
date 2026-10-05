export type WikiCollaborationConnectionState =
  'connecting' | 'syncing' | 'synced' | 'offline';

export type WikiCollaborationIndicator = {
  label: string;
  tone: 'saved' | 'pending' | 'warning' | 'error' | 'readonly';
};

export type WikiCollaborationStateInput = {
  accessDenied: boolean;
  authReconnecting: boolean;
  connectionState: WikiCollaborationConnectionState;
  hasLocalRecovery: boolean;
  localPersisted: boolean;
  localPersistenceError: boolean;
  readOnly: boolean;
  serverPersistenceError: boolean;
  updateRequired: boolean;
};

export function deriveWikiCollaborationIndicator(
  input: WikiCollaborationStateInput,
): WikiCollaborationIndicator {
  if (input.updateRequired) return { label: '업데이트 필요', tone: 'error' };
  if (input.accessDenied) return { label: '접근 권한 없음', tone: 'error' };
  if (input.readOnly) return { label: '읽기 전용', tone: 'readonly' };
  if (input.localPersistenceError) {
    return { label: '오프라인 저장 실패', tone: 'error' };
  }
  if (input.serverPersistenceError) {
    return { label: '서버 저장 오류', tone: 'error' };
  }
  if (input.authReconnecting) {
    return { label: '인증 갱신 중…', tone: 'pending' };
  }
  if (input.connectionState === 'offline') {
    return input.localPersisted && input.hasLocalRecovery
      ? { label: '오프라인 · 로컬 저장됨', tone: 'warning' }
      : { label: '오프라인', tone: 'warning' };
  }
  if (input.connectionState === 'connecting') {
    return { label: '연결 중…', tone: 'pending' };
  }
  if (input.connectionState === 'syncing') {
    return { label: '동기화 중…', tone: 'pending' };
  }
  return { label: '동기화됨', tone: 'saved' };
}
