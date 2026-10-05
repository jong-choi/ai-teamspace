import { deriveWikiCollaborationIndicator } from '@core/features/wiki/collaboration/wiki-collaboration-state';

import { describe, expect, it } from '@jest/globals';

const baseState = {
  accessDenied: false,
  authReconnecting: false,
  connectionState: 'synced' as const,
  hasLocalRecovery: true,
  localPersisted: true,
  localPersistenceError: false,
  readOnly: false,
  serverPersistenceError: false,
  updateRequired: false,
};

describe('위키 공동편집 상태 표시', () => {
  it.each([
    [{ updateRequired: true }, '업데이트 필요', 'error'],
    [{ accessDenied: true }, '접근 권한 없음', 'error'],
    [{ readOnly: true }, '읽기 전용', 'readonly'],
    [{ localPersistenceError: true }, '오프라인 저장 실패', 'error'],
    [{ serverPersistenceError: true }, '서버 저장 오류', 'error'],
    [{ authReconnecting: true }, '인증 갱신 중…', 'pending'],
    [
      {
        connectionState: 'offline' as const,
        hasLocalRecovery: true,
        localPersisted: true,
      },
      '오프라인 · 로컬 저장됨',
      'warning',
    ],
    [
      {
        connectionState: 'offline' as const,
        hasLocalRecovery: false,
        localPersisted: true,
      },
      '오프라인',
      'warning',
    ],
    [{ connectionState: 'connecting' as const }, '연결 중…', 'pending'],
    [{ connectionState: 'syncing' as const }, '동기화 중…', 'pending'],
    [{ connectionState: 'synced' as const }, '동기화됨', 'saved'],
  ])('%s 조건을 %s 상태로 표시한다', (override, label, tone) => {
    expect(
      deriveWikiCollaborationIndicator({ ...baseState, ...override }),
    ).toEqual({ label, tone });
  });

  it('높은 우선순위 오류가 낮은 우선순위 상태를 덮는다', () => {
    expect(
      deriveWikiCollaborationIndicator({
        ...baseState,
        readOnly: true,
        localPersistenceError: true,
        serverPersistenceError: true,
        authReconnecting: true,
        connectionState: 'offline',
      }),
    ).toEqual({ label: '읽기 전용', tone: 'readonly' });
  });
});
