import { Test, type TestingModule } from '@nestjs/testing';

import { SemanticGraphReader } from '@/knowledge-graph/infrastructure/graph/semantic-graph-reader.provider';
import { SemanticCorrectionRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-correction.repository';
import { SemanticSourceStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-source-state.repository';
import { SemanticCorrectionService } from '@/knowledge-graph/semantic-correction.service';

describe('R8-07 의미 보정 current transaction generation 검증', () => {
  const scope = {
    organizationId: 'p8a4-unit',
    aggregateKind: 'wiki_document' as const,
    aggregateId: '11111111-1111-4111-8111-111111111111',
  };
  const generationId = '22222222-2222-4222-8222-222222222222';
  const actorUserId = 'actor-a4';
  const entityKey = 'a'.repeat(64);
  const targetKey = 'b'.repeat(64);
  const relationKey = 'c'.repeat(64);
  const sourceAnchor = {
    v: 1 as const,
    entityType: 'Person' as const,
    normalizedName: '지윤',
    evidenceDigest: 'd'.repeat(64),
    occurrence: 1,
    extractorFingerprint: 'e'.repeat(64),
  };
  const targetAnchor = {
    v: 1 as const,
    entityType: 'Technology' as const,
    normalizedName: 'neo4j',
    evidenceDigest: 'f'.repeat(64),
    occurrence: 1,
    extractorFingerprint: '1'.repeat(64),
  };
  const graph = {
    entities: [
      { key: entityKey, anchor: sourceAnchor, localId: '지윤' },
      { key: targetKey, anchor: targetAnchor, localId: 'neo4j' },
    ],
    relations: [
      {
        key: relationKey,
        sourceKey: entityKey,
        targetKey,
        anchor: {
          v: 1 as const,
          source: sourceAnchor,
          target: targetAnchor,
          predicate: 'USES' as const,
        },
      },
    ],
  };

  let moduleRef: TestingModule;
  let service: SemanticCorrectionService;
  let stateCurrent: jest.Mock;
  let readGeneration: jest.Mock;
  let createInCurrentTransaction: jest.Mock;
  let createLinkedPairInCurrentTransaction: jest.Mock;

  beforeEach(async () => {
    stateCurrent = jest.fn();
    readGeneration = jest.fn(async () => graph);
    createInCurrentTransaction = jest.fn(async () => ({
      editRevision: 1,
      corrections: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          linkedCorrectionId: null,
        },
      ],
    }));
    createLinkedPairInCurrentTransaction = jest.fn(async () => ({
      editRevision: 2,
      corrections: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          linkedCorrectionId: '55555555-5555-4555-8555-555555555555',
        },
        {
          id: '55555555-5555-4555-8555-555555555555',
          linkedCorrectionId: '44444444-4444-4444-8444-444444444444',
        },
      ],
    }));

    moduleRef = await Test.createTestingModule({
      providers: [
        SemanticCorrectionService,
        {
          provide: SemanticSourceStateRepository,
          useValue: { current: stateCurrent },
        },
        {
          provide: SemanticGraphReader,
          useValue: { readGeneration },
        },
        {
          provide: SemanticCorrectionRepository,
          useValue: {
            createInCurrentTransaction,
            createLinkedPairInCurrentTransaction,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(SemanticCorrectionService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('active generation이 처음부터 다르면 graph와 repository를 건드리지 않고 view_changed다', async () => {
    stateCurrent.mockResolvedValue(current('old-generation'));

    await expect(
      service.createSuppressInCurrentTransaction(
        scope,
        generationId,
        'entity',
        entityKey,
        actorUserId,
      ),
    ).resolves.toEqual({ outcome: 'view_changed' });
    expect(readGeneration).not.toHaveBeenCalled();
    expect(createInCurrentTransaction).not.toHaveBeenCalled();
  });

  it('target anchor가 current graph에서 유일하게 매치되면 current transaction repository를 사용한다', async () => {
    stateCurrent.mockResolvedValue(current(generationId));

    await expect(
      service.createLabelOverrideInCurrentTransaction(
        scope,
        generationId,
        entityKey,
        '지윤님',
        actorUserId,
      ),
    ).resolves.toMatchObject({ outcome: 'created', editRevision: 1 });
    expect(readGeneration).toHaveBeenCalledWith(scope, generationId);
    expect(createInCurrentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: scope.organizationId,
        sourceKind: 'wiki_document',
        sourceId: scope.aggregateId,
        targetKind: 'entity',
        action: 'label_override',
        value: { label: '지윤님' },
        createdByUserId: actorUserId,
      }),
    );
    expect(stateCurrent).toHaveBeenCalledTimes(2);
  });

  it('repository write 뒤 active generation이 바뀌면 view_changed를 반환해 outer ALS rollback을 유도한다', async () => {
    stateCurrent
      .mockResolvedValueOnce(current(generationId))
      .mockResolvedValueOnce(current('new-generation'));

    await expect(
      service.createSuppressInCurrentTransaction(
        scope,
        generationId,
        'entity',
        entityKey,
        actorUserId,
      ),
    ).resolves.toEqual({ outcome: 'view_changed' });
    expect(createInCurrentTransaction).toHaveBeenCalledTimes(1);
  });

  it('현재 generation에서 target을 찾지 못하거나 anchor가 모호하면 ambiguous_review로 닫힌다', async () => {
    stateCurrent.mockResolvedValue(current(generationId));

    await expect(
      service.createSuppressInCurrentTransaction(
        scope,
        generationId,
        'entity',
        '0'.repeat(64),
        actorUserId,
      ),
    ).resolves.toEqual({ outcome: 'ambiguous_review' });
    expect(createInCurrentTransaction).not.toHaveBeenCalled();
  });

  it('predicate correction은 suppress+asserted linked pair를 revision 한 번의 repository 호출로 만든다', async () => {
    stateCurrent.mockResolvedValue(current(generationId));

    await expect(
      service.correctPredicateInCurrentTransaction(
        scope,
        generationId,
        relationKey,
        'RELATED_TO',
        actorUserId,
      ),
    ).resolves.toMatchObject({ outcome: 'created', editRevision: 2 });
    expect(createLinkedPairInCurrentTransaction).toHaveBeenCalledTimes(1);
    const [first, second] = createLinkedPairInCurrentTransaction.mock.calls[0]!;
    expect(first).toMatchObject({
      action: 'suppress',
      targetKind: 'relation',
      value: null,
    });
    expect(second).toMatchObject({
      action: 'asserted_relation',
      targetKind: 'relation',
      value: expect.objectContaining({ predicate: 'RELATED_TO' }),
    });
  });

  function current(activeGenerationId: string) {
    return {
      version: {
        desiredSeq: 1,
        deleted: false,
        updatedAt: new Date('2026-10-09T00:00:00.000Z'),
      },
      state: { activeGenerationId },
      dbNow: new Date('2026-10-09T00:00:00.000Z'),
    };
  }
});
