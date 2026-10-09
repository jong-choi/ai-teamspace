import { Test } from '@nestjs/testing';

import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { RefreshKnowledgeGraphSchema } from '@/knowledge-graph/dto/wiki-knowledge-graph.dto';
import { GraphIndexStatusService } from '@/knowledge-graph/graph-index-status.service';
import { SemanticSourceStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-source-state.repository';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import {
  semanticCurrentFixture,
  semanticStateFixture,
} from '@/knowledge-graph/testing/semantic-state.fixture';
import { WikiProjectionQueryService } from '@/wiki/wiki-projection-query.service';

import { jest } from '@jest/globals';

const organizationId = 'organization-a';
const documentId = '10000000-0000-4000-8000-000000000001';
const requestId = '10000000-0000-4000-8000-000000000002';
const updatedAt = new Date('2026-10-09T00:00:00Z');
const owner = {
  id: documentId,
  organizationId,
  collectionId: '10000000-0000-4000-8000-000000000003',
  parentDocumentId: null,
  title: '현재 문서',
  position: 0,
  contentMarkdown: '현재 본문',
  updatedAt,
};

describe('U8-01 위키 의미 색인 status mapper', () => {
  const assertReadable = jest.fn<GraphSourceAccessProvider['assertReadable']>();
  const currentSemantic =
    jest.fn<WikiProjectionQueryService['currentSemantic']>();
  const current = jest.fn<SemanticSourceStateRepository['current']>();
  let service: GraphIndexStatusService;

  beforeEach(async () => {
    jest.clearAllMocks();
    assertReadable.mockResolvedValue(undefined);
    currentSemantic.mockResolvedValue(owner);
    const module = await Test.createTestingModule({
      providers: [
        GraphIndexStatusService,
        {
          provide: GraphSourceAccessProvider,
          useValue: { assertReadable },
        },
        {
          provide: WikiProjectionQueryService,
          useValue: { currentSemantic },
        },
        { provide: SemanticSourceStateRepository, useValue: { current } },
      ],
    }).compile();
    service = module.get(GraphIndexStatusService);
  });

  it('추적되지 않은 현재 문서는 쓰기 없이 not_indexed로 반환한다', async () => {
    current.mockResolvedValue(null);

    await expect(
      service.getWikiStatus({ userId: 'actor-a' }, organizationId, documentId),
    ).resolves.toMatchObject({
      status: 'not_indexed',
      sourceUpdatedAt: updatedAt.toISOString(),
      latestRequest: null,
    });
    expect(current).toHaveBeenCalledTimes(1);
  });

  it('최신 수동 요청 receipt와 만족 여부를 gap 상태와 별도로 반환한다', async () => {
    current.mockResolvedValue(
      semanticCurrentFixture({
        version: { desiredSeq: 1, deleted: false, updatedAt },
        state: semanticStateFixture({
          organizationId,
          aggregateId: documentId,
          observedAt: updatedAt,
          manualRequestSeq: 2,
          manualRequestId: requestId,
          manualRequestedAt: updatedAt,
          indexedSeq: 1,
          indexedManualSeq: 2,
          indexedFingerprint: semanticPipelineFingerprint,
          activeGenerationId: '10000000-0000-4000-8000-000000000004',
          lastIndexedAt: updatedAt,
        }),
        dbNow: updatedAt,
      }),
    );

    await expect(
      service.getWikiStatus({ userId: 'actor-a' }, organizationId, documentId),
    ).resolves.toMatchObject({
      status: 'up_to_date',
      requestId: null,
      latestRequest: {
        requestId,
        requestedAt: updatedAt.toISOString(),
        satisfied: true,
      },
      completedAt: updatedAt.toISOString(),
    });
  });

  it('refresh body의 추가 필드를 거부한다', () => {
    expect(RefreshKnowledgeGraphSchema.safeParse({}).success).toBe(true);
    expect(
      RefreshKnowledgeGraphSchema.safeParse({ model: 'arbitrary' }).success,
    ).toBe(false);
  });
});
