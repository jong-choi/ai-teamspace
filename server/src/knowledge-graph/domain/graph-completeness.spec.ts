import { deriveGraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import type {
  GraphRebuildRequest,
  GraphRebuildStatus,
} from '@/knowledge-graph/domain/graph-rebuild';

function requestWithStatus(status: GraphRebuildStatus): GraphRebuildRequest {
  const now = new Date('2026-10-09T00:00:00.000Z');
  return {
    id: '10000000-0000-4000-8000-000000000001',
    organizationId: 'org-a',
    requestedByUserId: 'user-a',
    mode: 'full',
    status,
    pipelineFingerprint: 'a'.repeat(64),
    phase: status === 'accepted' ? 'projection' : null,
    cursorKind: null,
    cursorAfterId: null,
    leaseToken: null,
    leaseExpiresAt: null,
    fenceToken: 0,
    pagesCommitted: 0,
    projectionIntents: 0,
    semanticRequests: 0,
    skippedDeleted: 0,
    failedSources: status === 'failed' ? 1 : null,
    lastErrorCode: status === 'failed' ? 'REBUILD_INTERNAL' : null,
    acceptedAt: now,
    startedAt: null,
    catchUpStartedAt: null,
    cancelRequestedAt:
      status === 'cancel_requested' || status === 'cancelled' ? now : null,
    completedAt:
      status === 'succeeded' || status === 'failed' || status === 'cancelled'
        ? now
        : null,
    updatedAt: now,
  };
}

describe('U8-15 graph completeness', () => {
  it('rebuild 요청이 없으면 complete다', () => {
    expect(deriveGraphCompleteness(null)).toBe('complete');
  });

  it.each(['accepted', 'running', 'catching_up', 'cancel_requested'] as const)(
    '활성 상태 %s는 rebuilding이다',
    (status) => {
      expect(deriveGraphCompleteness(requestWithStatus(status))).toBe(
        'rebuilding',
      );
    },
  );

  it('succeeded는 complete다', () => {
    expect(deriveGraphCompleteness(requestWithStatus('succeeded'))).toBe(
      'complete',
    );
  });

  it.each(['failed', 'cancelled'] as const)('%s는 degraded다', (status) => {
    expect(deriveGraphCompleteness(requestWithStatus(status))).toBe('degraded');
  });
});
