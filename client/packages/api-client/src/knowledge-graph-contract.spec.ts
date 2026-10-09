import {
  getKnowledgeGraphControllerExploreUrl,
  getKnowledgeGraphOperationsControllerStatusUrl,
  getKnowledgeGraphSearchControllerSearchUrl,
  getWikiKnowledgeGraphControllerStatusUrl,
} from './generated/work-os';
import {
  GraphEditTarget,
  GraphNode,
  ProblemDetails,
  RefreshKnowledgeGraphAccepted,
  WikiKnowledgeGraphStatus,
} from './generated/schemas';

const id = '10000000-0000-4000-8000-000000000001';
const at = '2026-10-09T00:00:00.000Z';

describe('H8-20 Orval 지식 그래프 계약', () => {
  it('P9가 사용할 route export를 생성한다', () => {
    expect(getWikiKnowledgeGraphControllerStatusUrl('org', id)).toContain(
      '/knowledge-graph/status',
    );
    expect(getKnowledgeGraphSearchControllerSearchUrl('org')).toContain(
      '/knowledge-graph/search',
    );
    expect(getKnowledgeGraphControllerExploreUrl('org')).toContain(
      '/knowledge-graph/explore',
    );
    expect(getKnowledgeGraphOperationsControllerStatusUrl('org')).toContain(
      '/knowledge-graph/operations/status',
    );
  });

  it('202 receipt와 status 8종·nullable·ISO를 검증한다', () => {
    expect(
      RefreshKnowledgeGraphAccepted.parse({
        requestId: id,
        status: 'accepted',
        sourceUpdatedAt: at,
        acceptedAt: at,
      }).status,
    ).toBe('accepted');

    for (const status of [
      'accepted',
      'queued',
      'running',
      'waiting',
      'stale',
      'not_indexed',
      'up_to_date',
      'failed',
    ] as const) {
      expect(
        WikiKnowledgeGraphStatus.parse({
          status,
          sourceUpdatedAt: at,
          indexedSourceUpdatedAt: null,
          autoEligibleAt: null,
          requestId: null,
          requestedAt: null,
          latestRequest: null,
          completedAt: null,
          errorCode: null,
        }).status,
      ).toBe(status);
    }
    expect(() =>
      WikiKnowledgeGraphStatus.parse({ status: 'unknown' }),
    ).toThrow();
  });

  it('editTarget union·opaque ID와 ProblemDetails 상태를 보존한다', () => {
    expect(
      GraphEditTarget.parse({
        kind: 'owner',
        ownerKind: 'member',
        sourceId: 'better-auth-user-id',
      }),
    ).toMatchObject({ kind: 'owner' });
    expect(() =>
      GraphEditTarget.parse({ kind: 'owner', nodeId: id }),
    ).toThrow();
    expect(
      GraphNode.parse({
        id: 'opaque-node-id',
        kind: 'member',
        title: '사용자',
        factClass: 'authoritative',
        sourceRef: null,
        permissions: {
          canEdit: false,
          canDelete: false,
          canCorrect: false,
          canSuppress: false,
        },
        editTarget: { kind: 'none', reason: 'authoritative' },
        projectionState: null,
        completeness: 'complete',
        provenance: null,
      }).id,
    ).toBe('opaque-node-id');
    for (const status of [409, 429, 503]) {
      expect(
        ProblemDetails.parse({
          type: 'about:blank',
          title: '오류',
          status,
        }).status,
      ).toBe(status);
    }
  });
});
