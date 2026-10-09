import { Test } from '@nestjs/testing';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { KnowledgeGraphAuthorizationUnavailableError } from '@/knowledge-graph/domain/graph-query.error';
import { KnowledgeGraphSemanticSearchUnavailableError } from '@/knowledge-graph/domain/graph-search.error';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { computeSemanticSourceSignature } from '@/knowledge-graph/domain/semantic-source-signature';
import { GraphCompletenessService } from '@/knowledge-graph/graph-completeness.service';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { KnowledgeGraphSemanticSearchReader } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-semantic-search-reader.provider';
import { SearchQuotaRepository } from '@/knowledge-graph/infrastructure/persistence/search-quota.repository';
import { SemanticSearchStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-search-state.repository';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import { KnowledgeGraphSearchService } from '@/knowledge-graph/knowledge-graph-search.service';

const ORGANIZATION_ID = 'p8a3-unit-org';
const ACTOR = { userId: 'p8a3-unit-user' };
const NOW = new Date('2026-10-09T10:00:00.000Z');
const GENERATION = '10000000-0000-4000-8000-000000000201';
const OTHER_GENERATION = '10000000-0000-4000-8000-000000000202';

function owner(id: string, title: string, contentMarkdown = '검색 본문') {
  return {
    id,
    organizationId: ORGANIZATION_ID,
    collectionId: '10000000-0000-4000-8000-000000000901',
    parentDocumentId: null,
    title,
    position: 0,
    contentMarkdown,
    updatedAt: NOW,
  };
}

function searchable(id: string) {
  return {
    aggregateId: id,
    deleted: false,
    activeGenerationId: GENERATION,
    indexedSignature: '0'.repeat(64),
    indexedSourceUpdatedAt: NOW,
    indexedFingerprint: semanticPipelineFingerprint,
  };
}

function current(
  id: string,
  currentOwner: ReturnType<typeof owner>,
  overrides: {
    deleted?: boolean;
    activeGenerationId?: string | null;
    indexedFingerprint?: string | null;
    indexedSignature?: string | null;
  } = {},
) {
  return {
    aggregateId: id,
    desiredSeq: 1,
    deleted: overrides.deleted ?? false,
    updatedAt: NOW,
    activeGenerationId: overrides.activeGenerationId ?? GENERATION,
    indexedSignature:
      overrides.indexedSignature ??
      computeSemanticSourceSignature(currentOwner),
    indexedSourceUpdatedAt: NOW,
    indexedFingerprint:
      overrides.indexedFingerprint ?? semanticPipelineFingerprint,
  };
}

function hit(id: string, generationId = GENERATION) {
  return {
    sourceId: id,
    generationId,
    chunkIndex: 0,
    text: '검색 본문에서 찾은 의미 결과',
    score: 0.9,
  };
}

async function createHarness(options?: {
  queryEnabled?: boolean;
  semanticEnabled?: boolean;
  ennMaxSources?: number;
}) {
  const access = {
    assertReadable: jest.fn().mockResolvedValue(undefined),
  };
  const snapshots = {
    wikiKeyword: jest.fn().mockResolvedValue([]),
    wikiSemantic: jest.fn().mockResolvedValue([]),
  };
  const quota = {
    consume: jest.fn().mockResolvedValue(undefined),
  };
  const completeness = {
    forOrganization: jest.fn().mockResolvedValue('complete'),
  };
  const embedder = {
    embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  };
  const searchState = {
    listSearchableSources: jest.fn().mockResolvedValue([]),
    currentBatch: jest.fn().mockResolvedValue([]),
  };
  const reader = {
    semanticExact: jest.fn().mockResolvedValue([]),
    semanticApproximate: jest.fn().mockResolvedValue([]),
  };

  const module = await Test.createTestingModule({
    providers: [
      KnowledgeGraphSearchService,
      {
        provide: knowledgeGraphConfig.KEY,
        useValue: {
          query: {
            enabled: options?.queryEnabled ?? true,
            graphReadTimeoutMs: 3_000,
          },
          semanticEnabled: options?.semanticEnabled ?? true,
          searchEnnMaxSources: options?.ennMaxSources ?? 2_000,
        },
      },
      { provide: GraphSourceAccessProvider, useValue: access },
      { provide: GraphSourceSnapshotProvider, useValue: snapshots },
      { provide: SearchQuotaRepository, useValue: quota },
      { provide: GraphCompletenessService, useValue: completeness },
      { provide: SemanticEmbedder, useValue: embedder },
      { provide: SemanticSearchStateRepository, useValue: searchState },
      { provide: KnowledgeGraphSemanticSearchReader, useValue: reader },
    ],
  }).compile();

  return {
    service: module.get(KnowledgeGraphSearchService),
    access,
    snapshots,
    quota,
    completeness,
    embedder,
    searchState,
    reader,
  };
}

describe('U8-05·06 지식 그래프 검색 서비스', () => {
  it('owner 없음·삭제·generation·fingerprint·signature 불일치 semantic 결과를 모두 제거한다', async () => {
    const harness = await createHarness();
    const freshId = '10000000-0000-4000-8000-000000000101';
    const missingId = '10000000-0000-4000-8000-000000000102';
    const deletedId = '10000000-0000-4000-8000-000000000103';
    const generationId = '10000000-0000-4000-8000-000000000104';
    const fingerprintId = '10000000-0000-4000-8000-000000000105';
    const signatureId = '10000000-0000-4000-8000-000000000106';
    const freshOwner = owner(freshId, 'fresh');
    const deletedOwner = owner(deletedId, 'deleted');
    const generationOwner = owner(generationId, 'generation');
    const fingerprintOwner = owner(fingerprintId, 'fingerprint');
    const signatureOwner = owner(signatureId, 'signature', '수정된 본문');
    const ids = [
      freshId,
      missingId,
      deletedId,
      generationId,
      fingerprintId,
      signatureId,
    ];

    harness.searchState.listSearchableSources.mockResolvedValue(
      ids.map(searchable),
    );
    harness.reader.semanticExact.mockResolvedValue(ids.map((id) => hit(id)));
    harness.searchState.currentBatch.mockResolvedValue([
      current(freshId, freshOwner),
      current(missingId, owner(missingId, 'missing')),
      current(deletedId, deletedOwner, { deleted: true }),
      current(generationId, generationOwner, {
        activeGenerationId: OTHER_GENERATION,
      }),
      current(fingerprintId, fingerprintOwner, {
        indexedFingerprint: 'f'.repeat(64),
      }),
      current(signatureId, signatureOwner, {
        indexedSignature: '0'.repeat(64),
      }),
    ]);
    harness.snapshots.wikiSemantic.mockResolvedValue([
      freshOwner,
      deletedOwner,
      generationOwner,
      fingerprintOwner,
      signatureOwner,
    ]);

    const result = await harness.service.search(ACTOR, ORGANIZATION_ID, {
      q: '검색',
      mode: 'semantic',
      limit: 20,
    });

    expect(result.items.map((item) => item.source.id)).toEqual([freshId]);
    expect(result.items[0]?.matchedBy).toEqual(['semantic']);
    expect(harness.embedder.embedQuery).toHaveBeenCalledTimes(1);
    expect(harness.quota.consume).toHaveBeenCalledTimes(1);
    expect(harness.access.assertReadable).toHaveBeenCalledTimes(2);
    expect(harness.completeness.forOrganization).toHaveBeenCalledTimes(1);
  });

  it('ANN은 PG active generation으로 남은 결과가 부족할 때만 최대 3단계 재질의하고 embedding은 한 번만 호출한다', async () => {
    const harness = await createHarness({ ennMaxSources: 1 });
    const staleId = '10000000-0000-4000-8000-000000000301';
    const freshId = '10000000-0000-4000-8000-000000000302';
    const freshOwner = owner(freshId, 'fresh-ann');

    harness.searchState.listSearchableSources.mockResolvedValue([
      searchable('10000000-0000-4000-8000-000000000311'),
      searchable('10000000-0000-4000-8000-000000000312'),
    ]);
    harness.reader.semanticApproximate
      .mockResolvedValueOnce(Array.from({ length: 100 }, () => hit(staleId)))
      .mockResolvedValueOnce(Array.from({ length: 400 }, () => hit(staleId)))
      .mockResolvedValueOnce([hit(freshId)]);
    harness.searchState.currentBatch
      .mockResolvedValueOnce([
        current(staleId, owner(staleId, 'stale'), {
          activeGenerationId: OTHER_GENERATION,
        }),
      ])
      .mockResolvedValueOnce([
        current(staleId, owner(staleId, 'stale'), {
          activeGenerationId: OTHER_GENERATION,
        }),
      ])
      .mockResolvedValueOnce([current(freshId, freshOwner)])
      .mockResolvedValueOnce([current(freshId, freshOwner)]);
    harness.snapshots.wikiSemantic.mockResolvedValue([freshOwner]);

    const result = await harness.service.search(ACTOR, ORGANIZATION_ID, {
      q: '검색',
      mode: 'semantic',
      limit: 1,
    });

    expect(harness.reader.semanticApproximate).toHaveBeenCalledTimes(3);
    expect(
      harness.reader.semanticApproximate.mock.calls.map(([input]) => input.k),
    ).toEqual([100, 400, 1600]);
    expect(harness.reader.semanticExact).not.toHaveBeenCalled();
    expect(harness.embedder.embedQuery).toHaveBeenCalledTimes(1);
    expect(result.semanticRecall).toBe('approximate');
    expect(result.items[0]?.source.id).toBe(freshId);
  });

  it('ANN 전역 top-k가 scope 필터 뒤 부족해도 3단계 상한까지만 재질의하고 recall은 approximate로 유지한다', async () => {
    const harness = await createHarness({ ennMaxSources: 1 });
    const staleId = '10000000-0000-4000-8000-000000000321';

    harness.searchState.listSearchableSources.mockResolvedValue([
      searchable('10000000-0000-4000-8000-000000000331'),
      searchable('10000000-0000-4000-8000-000000000332'),
    ]);
    harness.reader.semanticApproximate
      .mockResolvedValueOnce(Array.from({ length: 100 }, () => hit(staleId)))
      .mockResolvedValueOnce(Array.from({ length: 400 }, () => hit(staleId)))
      .mockResolvedValueOnce(Array.from({ length: 1600 }, () => hit(staleId)));
    harness.searchState.currentBatch.mockResolvedValue([
      current(staleId, owner(staleId, 'stale-ann'), {
        activeGenerationId: OTHER_GENERATION,
      }),
    ]);
    harness.snapshots.wikiSemantic.mockResolvedValue([]);

    const result = await harness.service.search(ACTOR, ORGANIZATION_ID, {
      q: '검색',
      mode: 'semantic',
      limit: 5,
    });

    expect(harness.reader.semanticApproximate).toHaveBeenCalledTimes(3);
    expect(
      harness.reader.semanticApproximate.mock.calls.map(([input]) => input.k),
    ).toEqual([100, 400, 1600]);
    expect(result.semanticRecall).toBe('approximate');
    expect(result.items).toEqual([]);
  });

  it('Neo4j 의미 검색 장애 시 hybrid는 keyword 결과를 반환하고 graph_unavailable로 degraded 된다', async () => {
    const harness = await createHarness();
    const sourceId = '10000000-0000-4000-8000-000000000401';
    const sourceOwner = owner(sourceId, 'keyword fallback');

    harness.searchState.listSearchableSources.mockResolvedValue([
      searchable(sourceId),
    ]);
    harness.reader.semanticExact.mockRejectedValue(
      new KnowledgeGraphSemanticSearchUnavailableError('KG_GRAPH_UNAVAILABLE'),
    );
    harness.snapshots.wikiKeyword.mockResolvedValue([
      {
        id: sourceId,
        title: sourceOwner.title,
        updatedAt: NOW,
        matchedIn: ['title'],
      },
    ]);
    harness.searchState.currentBatch.mockResolvedValue([]);
    harness.snapshots.wikiSemantic.mockResolvedValue([sourceOwner]);

    const result = await harness.service.search(ACTOR, ORGANIZATION_ID, {
      q: 'keyword',
      mode: 'hybrid',
      limit: 5,
    });

    expect(result.degradedReasons).toContain('graph_unavailable');
    expect(result.items[0]?.matchedBy).toEqual(['keyword']);
    expect(result.items[0]?.source.title).toBe('keyword fallback');
  });

  it('PG 원본 조회 장애는 Neo4j 후보를 반환하지 않고 인가 확인 불가 503 오류로 변환한다', async () => {
    const harness = await createHarness();
    harness.snapshots.wikiKeyword.mockRejectedValue(
      new Error('db-secret-should-not-leak'),
    );

    await expect(
      harness.service.search(ACTOR, ORGANIZATION_ID, {
        q: '검색',
        mode: 'keyword',
        limit: 5,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'KG_AUTHORIZATION_UNAVAILABLE',
      }),
    );
    await expect(
      harness.service.search(ACTOR, ORGANIZATION_ID, {
        q: '검색',
        mode: 'keyword',
        limit: 5,
      }),
    ).rejects.toBeInstanceOf(KnowledgeGraphAuthorizationUnavailableError);
  });

  it('KG_QUERY_ENABLED=false이면 다른 port를 호출하기 전에 거부한다', async () => {
    const harness = await createHarness({ queryEnabled: false });

    await expect(
      harness.service.search(ACTOR, ORGANIZATION_ID, {
        q: '검색',
        mode: 'keyword',
        limit: 5,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'KG_QUERY_DISABLED' }));
    expect(harness.access.assertReadable).not.toHaveBeenCalled();
  });
});
