import { Test, type TestingModule } from '@nestjs/testing';

import { CuratedGraphService } from '@/knowledge-graph/curated-graph.service';
import {
  KnowledgeGraphCorrectionNotActiveError,
  KnowledgeGraphCorrectionNotFoundError,
  KnowledgeGraphCorrectionTargetAmbiguousError,
  KnowledgeGraphCuratedNodeNotFoundError,
} from '@/knowledge-graph/domain/graph-command.error';
import {
  encodeGraphEdgeId,
  encodeGraphNodeId,
} from '@/knowledge-graph/domain/graph-identity';
import { KnowledgeGraphViewChangedError } from '@/knowledge-graph/domain/graph-read.error';
import { GraphCommandService } from '@/knowledge-graph/graph-command.service';
import { GraphCorrectionCommandService } from '@/knowledge-graph/graph-correction-command.service';
import { CuratedGraphQueryRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph-query.repository';
import { GraphCorrectionWriteRepository } from '@/knowledge-graph/infrastructure/persistence/graph-correction-write.repository';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { GraphSourceSnapshotProvider } from '@/knowledge-graph/infrastructure/source-snapshot/graph-source-snapshot.provider';
import { SemanticCorrectionService } from '@/knowledge-graph/semantic-correction.service';

describe('A4 그래프 명령 application service', () => {
  const organizationId = 'org-a4';
  const actorUserId = 'actor-a4';
  const sourceId = '11111111-1111-4111-8111-111111111111';
  const generationId = '22222222-2222-4222-8222-222222222222';
  const semanticKey = 'a'.repeat(64);
  const actor = { userId: actorUserId };

  let moduleRef: TestingModule;
  let service: GraphCommandService;
  let curated: {
    createNode: jest.Mock;
    updateNode: jest.Mock;
    deleteNode: jest.Mock;
    createEdge: jest.Mock;
    updateEdge: jest.Mock;
    deleteEdge: jest.Mock;
  };
  let corrections: {
    createLabelOverrideInCurrentTransaction: jest.Mock;
    createSuppressInCurrentTransaction: jest.Mock;
    correctPredicateInCurrentTransaction: jest.Mock;
    isActiveGeneration: jest.Mock;
    listActive: jest.Mock;
    findById: jest.Mock;
    replaceLabelOverrideByIdInCurrentTransaction: jest.Mock;
    cancelByIdInCurrentTransaction: jest.Mock;
  };
  let access: { assertReadable: jest.Mock };
  let snapshots: {
    listWiki: jest.Mock;
    listProjects: jest.Mock;
    listTickets: jest.Mock;
    listMeetings: jest.Mock;
  };
  let curatedQuery: { listNodes: jest.Mock };
  let correctionWrites: { runLockedWiki: jest.Mock };

  beforeEach(async () => {
    curated = {
      createNode: jest.fn(),
      updateNode: jest.fn(),
      deleteNode: jest.fn(),
      createEdge: jest.fn(),
      updateEdge: jest.fn(),
      deleteEdge: jest.fn(),
    };
    corrections = {
      createLabelOverrideInCurrentTransaction: jest.fn(),
      createSuppressInCurrentTransaction: jest.fn(),
      correctPredicateInCurrentTransaction: jest.fn(),
      isActiveGeneration: jest.fn(),
      listActive: jest.fn(),
      findById: jest.fn(),
      replaceLabelOverrideByIdInCurrentTransaction: jest.fn(),
      cancelByIdInCurrentTransaction: jest.fn(),
    };
    access = { assertReadable: jest.fn(async () => undefined) };
    snapshots = {
      listWiki: jest.fn(async () => []),
      listProjects: jest.fn(async () => []),
      listTickets: jest.fn(async () => []),
      listMeetings: jest.fn(async () => []),
    };
    curatedQuery = { listNodes: jest.fn(async () => []) };
    correctionWrites = {
      runLockedWiki: jest.fn(
        async (
          _organizationId: string,
          _actorUserId: string,
          _documentId: string,
          operation: () => Promise<unknown>,
        ) => ({ outcome: 'locked' as const, value: await operation() }),
      ),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        GraphCommandService,
        GraphCorrectionCommandService,
        { provide: CuratedGraphService, useValue: curated },
        { provide: SemanticCorrectionService, useValue: corrections },
        { provide: GraphSourceAccessProvider, useValue: access },
        { provide: GraphSourceSnapshotProvider, useValue: snapshots },
        { provide: CuratedGraphQueryRepository, useValue: curatedQuery },
        { provide: GraphCorrectionWriteRepository, useValue: correctionWrites },
      ],
    }).compile();
    service = moduleRef.get(GraphCommandService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('curated 생성 응답은 PG UUID와 pending projection·ISO 시각을 돌려준다', async () => {
    const updatedAt = new Date('2026-10-09T01:02:03.000Z');
    curated.createNode.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'custom',
      title: '사용자 노드',
      properties: { priority: 1 },
      revision: 1,
      updatedAt,
    });

    await expect(
      service.createCuratedNode(organizationId, actorUserId, {
        kind: 'custom',
        title: '사용자 노드',
        properties: { priority: 1 },
      }),
    ).resolves.toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'custom',
      title: '사용자 노드',
      properties: { priority: 1 },
      revision: 1,
      updatedAt: updatedAt.toISOString(),
      projectionState: 'pending',
    });
  });

  it('curated update에서 현재 조직의 활성 node가 없으면 전용 404 오류다', async () => {
    curated.updateNode.mockResolvedValue(null);

    await expect(
      service.updateCuratedNode(
        organizationId,
        '33333333-3333-4333-8333-333333333333',
        actorUserId,
        { title: '수정', expectedRevision: 1 },
      ),
    ).rejects.toBeInstanceOf(KnowledgeGraphCuratedNodeNotFoundError);
  });

  it('endpoint 후보는 curated와 권위 원본을 합치고 predicate 정책·kind·limit을 적용한다', async () => {
    curatedQuery.listNodes.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: '가 curated',
      },
    ]);
    snapshots.listWiki.mockResolvedValue([
      {
        id: '44444444-4444-4444-8444-444444444444',
        title: '나 wiki',
      },
    ]);
    snapshots.listProjects.mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        name: '다 project',
      },
    ]);

    await expect(
      service.endpointOptions(actor, organizationId, { limit: 20 }),
    ).resolves.toEqual({
      items: [
        {
          nodeId: '33333333-3333-4333-8333-333333333333',
          kind: 'curated_node',
          title: '가 curated',
          allowedPredicates: [
            'related_to',
            'depends_on',
            'contains',
            'references',
          ],
        },
        {
          nodeId: '44444444-4444-4444-8444-444444444444',
          kind: 'wiki_document',
          title: '나 wiki',
          allowedPredicates: ['references'],
        },
        {
          nodeId: '55555555-5555-4555-8555-555555555555',
          kind: 'project',
          title: '다 project',
          allowedPredicates: ['references'],
        },
      ],
    });
    expect(access.assertReadable).toHaveBeenCalledWith(actor, organizationId);

    await expect(
      service.endpointOptions(actor, organizationId, {
        kind: 'wiki_document',
        limit: 1,
      }),
    ).resolves.toEqual({
      items: [
        {
          nodeId: '44444444-4444-4444-8444-444444444444',
          kind: 'wiki_document',
          title: '나 wiki',
          allowedPredicates: ['references'],
        },
      ],
    });
  });

  it('semantic label 보정은 opaque ID의 source로 ALS 잠금을 잡고 정확한 응답을 반환한다', async () => {
    const nodeId = encodeGraphNodeId([
      1,
      'e',
      'wiki_document',
      sourceId,
      generationId,
      semanticKey,
    ]);
    corrections.createLabelOverrideInCurrentTransaction.mockResolvedValue({
      outcome: 'created',
      editRevision: 4,
      corrections: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          linkedCorrectionId: null,
        },
      ],
    });

    await expect(
      service.createCorrection(actor, organizationId, actorUserId, {
        action: 'label_override',
        nodeId,
        value: { label: '새 이름' },
      }),
    ).resolves.toEqual({
      correctionId: '66666666-6666-4666-8666-666666666666',
      linkedCorrectionId: null,
      action: 'label_override',
      editRevision: 4,
      matchState: 'matched',
    });
    expect(correctionWrites.runLockedWiki).toHaveBeenCalledWith(
      organizationId,
      actorUserId,
      sourceId,
      expect.any(Function),
    );
    expect(
      corrections.createLabelOverrideInCurrentTransaction,
    ).toHaveBeenCalledWith(
      {
        organizationId,
        aggregateKind: 'wiki_document',
        aggregateId: sourceId,
      },
      generationId,
      semanticKey,
      '새 이름',
      actorUserId,
    );
  });

  it('semantic generation이 바뀌면 보정 write는 409 view changed로 중단된다', async () => {
    const nodeId = encodeGraphNodeId([
      1,
      'e',
      'wiki_document',
      sourceId,
      generationId,
      semanticKey,
    ]);
    corrections.createSuppressInCurrentTransaction.mockResolvedValue({
      outcome: 'view_changed',
    });

    await expect(
      service.createCorrection(actor, organizationId, actorUserId, {
        action: 'suppress',
        nodeId,
      }),
    ).rejects.toBeInstanceOf(KnowledgeGraphViewChangedError);
  });

  it('현재 generation에서 semantic 대상이 하나로 결정되지 않으면 409 ambiguous다', async () => {
    const edgeId = encodeGraphEdgeId([
      1,
      'sr',
      sourceId,
      generationId,
      semanticKey,
    ]);
    corrections.correctPredicateInCurrentTransaction.mockResolvedValue({
      outcome: 'ambiguous_review',
    });

    await expect(
      service.createCorrection(actor, organizationId, actorUserId, {
        action: 'correct_predicate',
        edgeId,
        value: { predicate: 'USES' },
      }),
    ).rejects.toBeInstanceOf(KnowledgeGraphCorrectionTargetAmbiguousError);
  });

  it('보정 잠금에서 원본이 사라진 경우 node/edge 정보는 404로 숨긴다', async () => {
    correctionWrites.runLockedWiki.mockResolvedValue({ outcome: 'not_found' });
    const nodeId = encodeGraphNodeId([
      1,
      'e',
      'wiki_document',
      sourceId,
      generationId,
      semanticKey,
    ]);

    await expect(
      service.createCorrection(actor, organizationId, actorUserId, {
        action: 'suppress',
        nodeId,
      }),
    ).rejects.toMatchObject({ code: 'KG_NODE_NOT_FOUND', kind: 'not_found' });
  });

  it('보정 PATCH는 기존 행을 찾지 못하면 404, 이미 비활성이면 409다', async () => {
    const correctionId = '66666666-6666-4666-8666-666666666666';
    corrections.findById.mockResolvedValueOnce(null);

    await expect(
      service.updateCorrection(organizationId, correctionId, actorUserId, {
        value: { label: '교체' },
      }),
    ).rejects.toBeInstanceOf(KnowledgeGraphCorrectionNotFoundError);

    corrections.findById.mockResolvedValueOnce({ sourceId });
    corrections.replaceLabelOverrideByIdInCurrentTransaction.mockResolvedValue({
      outcome: 'not_active',
    });
    await expect(
      service.updateCorrection(organizationId, correctionId, actorUserId, {
        value: { label: '교체' },
      }),
    ).rejects.toBeInstanceOf(KnowledgeGraphCorrectionNotActiveError);
  });

  it('보정 DELETE는 짝 취소 capability를 호출하고 이미 비활성이면 409다', async () => {
    const correctionId = '66666666-6666-4666-8666-666666666666';
    corrections.findById.mockResolvedValue({ sourceId });
    corrections.cancelByIdInCurrentTransaction.mockResolvedValue({
      outcome: 'not_active',
    });

    await expect(
      service.deleteCorrection(organizationId, correctionId, actorUserId),
    ).rejects.toBeInstanceOf(KnowledgeGraphCorrectionNotActiveError);
    expect(corrections.cancelByIdInCurrentTransaction).toHaveBeenCalledWith(
      organizationId,
      correctionId,
      actorUserId,
    );
  });

  it('보정 목록은 review 상태와 generation을 보존하고 시각만 ISO wire 형식으로 바꾼다', async () => {
    const createdAt = new Date('2026-10-09T03:00:00.000Z');
    corrections.listActive.mockResolvedValue({
      editRevision: 7,
      corrections: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          linkedCorrectionId: null,
          targetKind: 'entity',
          action: 'label_override',
          anchor: {
            v: 1,
            entityType: 'Person',
            normalizedName: '지윤',
            evidenceDigest: 'b'.repeat(64),
            occurrence: 1,
            extractorFingerprint: 'c'.repeat(64),
          },
          value: { label: '지윤님' },
          createdRevision: 7,
          lastMatchState: 'pending_review',
          lastMatchedGenerationId: generationId,
          createdAt,
        },
      ],
    });

    await expect(
      service.listCorrections(actor, organizationId, { sourceId }),
    ).resolves.toMatchObject({
      editRevision: 7,
      items: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          lastMatchState: 'pending_review',
          lastMatchedGenerationId: generationId,
          createdAt: createdAt.toISOString(),
        },
      ],
    });
  });
});
