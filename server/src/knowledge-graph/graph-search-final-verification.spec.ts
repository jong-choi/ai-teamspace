import { Test } from '@nestjs/testing';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
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

const ORGANIZATION_ID = 'p8a3-u8-06-org';
const ACTOR = { userId: 'p8a3-u8-06-user' };
const SOURCE_ID = '20000000-0000-4000-8000-000000000101';
const GENERATION_ID = '20000000-0000-4000-8000-000000000201';
const OTHER_GENERATION_ID = '20000000-0000-4000-8000-000000000202';
const UPDATED_AT = new Date('2026-10-09T12:00:00.000Z');

function owner() {
  return {
    id: SOURCE_ID,
    organizationId: ORGANIZATION_ID,
    collectionId: '20000000-0000-4000-8000-000000000901',
    parentDocumentId: null,
    title: 'U8-06 owner',
    position: 0,
    contentMarkdown: '최종 검증 대상 본문',
    updatedAt: UPDATED_AT,
  };
}

function state(
  currentOwner: ReturnType<typeof owner>,
  overrides: Partial<{
    deleted: boolean;
    activeGenerationId: string | null;
    indexedFingerprint: string | null;
    indexedSignature: string | null;
  }> = {},
) {
  return {
    aggregateId: SOURCE_ID,
    desiredSeq: 1,
    deleted: overrides.deleted ?? false,
    updatedAt: UPDATED_AT,
    activeGenerationId: overrides.activeGenerationId ?? GENERATION_ID,
    indexedSignature:
      overrides.indexedSignature ??
      computeSemanticSourceSignature(currentOwner),
    indexedSourceUpdatedAt: UPDATED_AT,
    indexedFingerprint:
      overrides.indexedFingerprint ?? semanticPipelineFingerprint,
  };
}

async function createHarness() {
  const sourceOwner = owner();
  const access = { assertReadable: jest.fn().mockResolvedValue(undefined) };
  const snapshots = {
    wikiKeyword: jest.fn().mockResolvedValue([]),
    wikiSemantic: jest.fn().mockResolvedValue([sourceOwner]),
  };
  const searchState = {
    listSearchableSources: jest.fn().mockResolvedValue([
      {
        aggregateId: SOURCE_ID,
        deleted: false,
        activeGenerationId: GENERATION_ID,
        indexedSignature: computeSemanticSourceSignature(sourceOwner),
        indexedSourceUpdatedAt: UPDATED_AT,
        indexedFingerprint: semanticPipelineFingerprint,
      },
    ]),
    currentBatch: jest.fn().mockResolvedValue([state(sourceOwner)]),
  };
  const reader = {
    semanticExact: jest.fn().mockResolvedValue([
      {
        sourceId: SOURCE_ID,
        generationId: GENERATION_ID,
        chunkIndex: 0,
        text: '최종 검증 대상 본문',
        score: 0.95,
      },
    ]),
    semanticApproximate: jest.fn().mockResolvedValue([]),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      KnowledgeGraphSearchService,
      {
        provide: knowledgeGraphConfig.KEY,
        useValue: {
          query: { enabled: true, graphReadTimeoutMs: 3_000 },
          semanticEnabled: true,
          searchEnnMaxSources: 2_000,
        },
      },
      { provide: GraphSourceAccessProvider, useValue: access },
      { provide: GraphSourceSnapshotProvider, useValue: snapshots },
      {
        provide: SearchQuotaRepository,
        useValue: { consume: jest.fn().mockResolvedValue(undefined) },
      },
      {
        provide: GraphCompletenessService,
        useValue: { forOrganization: jest.fn().mockResolvedValue('complete') },
      },
      {
        provide: SemanticEmbedder,
        useValue: { embedQuery: jest.fn().mockResolvedValue([1, 0, 0]) },
      },
      { provide: SemanticSearchStateRepository, useValue: searchState },
      { provide: KnowledgeGraphSemanticSearchReader, useValue: reader },
    ],
  }).compile();

  return {
    service: moduleRef.get(KnowledgeGraphSearchService),
    sourceOwner,
    snapshots,
    searchState,
  };
}

async function search(harness: Awaited<ReturnType<typeof createHarness>>) {
  return harness.service.search(ACTOR, ORGANIZATION_ID, {
    q: '검증',
    mode: 'semantic',
    limit: 5,
  });
}

describe('U8-06 검색 최종 검증 drop 규칙', () => {
  it('owner가 사라진 후보를 제거한다', async () => {
    const harness = await createHarness();
    harness.snapshots.wikiSemantic.mockResolvedValue([]);

    expect((await search(harness)).items).toEqual([]);
  });

  it('deleted=true인 후보를 제거한다', async () => {
    const harness = await createHarness();
    harness.searchState.currentBatch.mockResolvedValue([
      state(harness.sourceOwner, { deleted: true }),
    ]);

    expect((await search(harness)).items).toEqual([]);
  });

  it('active generation이 후보 generation과 다른 후보를 제거한다', async () => {
    const harness = await createHarness();
    harness.searchState.currentBatch.mockResolvedValue([
      state(harness.sourceOwner, {
        activeGenerationId: OTHER_GENERATION_ID,
      }),
    ]);

    expect((await search(harness)).items).toEqual([]);
  });

  it('indexed fingerprint가 현재 pipeline과 다른 후보를 제거한다', async () => {
    const harness = await createHarness();
    harness.searchState.currentBatch.mockResolvedValue([
      state(harness.sourceOwner, { indexedFingerprint: 'f'.repeat(64) }),
    ]);

    expect((await search(harness)).items).toEqual([]);
  });

  it('현재 owner signature와 indexed signature가 다른 후보를 제거한다', async () => {
    const harness = await createHarness();
    harness.searchState.currentBatch.mockResolvedValue([
      state(harness.sourceOwner, { indexedSignature: '0'.repeat(64) }),
    ]);

    expect((await search(harness)).items).toEqual([]);
  });
});
