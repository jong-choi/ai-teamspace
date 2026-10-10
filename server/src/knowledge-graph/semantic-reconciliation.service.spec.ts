import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { SemanticManualRequestRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-manual-request.repository';
import { SemanticRecoveryRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-recovery.repository';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import { SemanticReconciliationService } from '@/knowledge-graph/semantic-reconciliation.service';
import {
  semanticCurrentFixture,
  semanticStateFixture,
} from '@/knowledge-graph/testing/semantic-state.fixture';
import { SemanticRecoveryCandidateSchema } from '@/outbox/domain/semantic-source';

describe('의미 복구의 job 선택과 전달 실패 뒤 재개', () => {
  const scope = {
    organizationId: 'p7-unit-org',
    aggregateKind: 'wiki_document',
    aggregateId: '10000000-0000-4000-8000-000000000001',
  } as const;
  const requestId = '10000000-0000-4000-8000-000000000002';
  const manualState = semanticStateFixture({
    manualRequestSeq: 1,
    manualRequestId: requestId,
    manualRequestedAt: new Date(0),
    lastRequeuedAt: new Date(0),
    requeueCount: 1,
  });
  const recovery = {
    discoverMissing: jest.fn(),
    claimGapBatch: jest.fn(),
    releaseDeliveryFailure: jest.fn(),
    stats: jest.fn(),
  };
  const queue = { auto: jest.fn(), manual: jest.fn(), remove: jest.fn() };
  const manual = { markDelivered: jest.fn() };
  let service: SemanticReconciliationService;

  beforeEach(async () => {
    jest.resetAllMocks();
    recovery.discoverMissing.mockResolvedValue(0);
    recovery.claimGapBatch.mockResolvedValue([]);
    recovery.releaseDeliveryFailure.mockResolvedValue(true);
    queue.auto.mockResolvedValue(undefined);
    queue.manual.mockResolvedValue(undefined);
    queue.remove.mockResolvedValue(undefined);
    manual.markDelivered.mockResolvedValue(undefined);
    const app = await Test.createTestingModule({
      providers: [
        SemanticReconciliationService,
        { provide: SemanticRecoveryRepository, useValue: recovery },
        { provide: SemanticJobQueueProvider, useValue: queue },
        { provide: SemanticManualRequestRepository, useValue: manual },
      ],
    }).compile();
    service = app.get(SemanticReconciliationService);
  });
  afterEach(() => jest.restoreAllMocks());

  it('U7-20 수동 gap은 delay 없이 접수하고 queue 성공 뒤에만 delivered를 기록한다', async () => {
    recovery.claimGapBatch.mockResolvedValue([
      SemanticRecoveryCandidateSchema.parse({
        ...semanticCurrentFixture({ state: manualState }),
        scope,
      }),
    ]);
    expect(await service.runOnce()).toBe(1);
    expect(queue.manual).toHaveBeenCalledWith(scope, requestId);
    expect(manual.markDelivered).toHaveBeenCalledWith(scope, 1);
    expect(queue.auto.mock.calls.length).toBe(0);
  });
  it('U7-20 전달 실패는 자기 claim을 반납해 다음 tick에서 같은 영속 요청을 접수한다', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const candidate = SemanticRecoveryCandidateSchema.parse({
      ...semanticCurrentFixture({ state: manualState }),
      scope,
    });
    recovery.claimGapBatch.mockResolvedValue([candidate]);
    queue.manual.mockRejectedValueOnce(
      new Error('private-redis-broker-address'),
    );
    expect(await service.runOnce()).toBe(0);
    expect(recovery.releaseDeliveryFailure).toHaveBeenCalledWith(candidate);
    expect(manual.markDelivered.mock.calls.length).toBe(0);
    expect(await service.runOnce()).toBe(1);
    expect(manual.markDelivered).toHaveBeenCalledWith(scope, 1);
  });
  it('U7-20 삭제 gap은 자동 지연 없이 remove로 접수한다', async () => {
    recovery.claimGapBatch.mockResolvedValue([
      SemanticRecoveryCandidateSchema.parse({
        ...semanticCurrentFixture({
          version: { desiredSeq: 2, deleted: true, updatedAt: new Date(0) },
        }),
        scope,
      }),
    ]);
    expect(await service.runOnce()).toBe(1);
    expect(queue.remove).toHaveBeenCalledWith(scope, 2);
    expect(queue.auto.mock.calls.length).toBe(0);
  });
  it.each([
    {
      name: '자동 quiet',
      indexedSeq: 0,
      gcRequired: false,
      observedAt: new Date('2026-10-09T00:00:00Z'),
      delay: 30_000,
    },
    {
      name: '최신 세대 GC',
      indexedSeq: 1,
      gcRequired: true,
      observedAt: new Date(0),
      delay: 0,
    },
  ])(
    'U7-20 $name 접수는 이미 기록된 claim cooldown을 다시 적용하지 않는다',
    async ({ indexedSeq, gcRequired, observedAt, delay }) => {
      const fp = semanticPipelineFingerprint;
      recovery.claimGapBatch.mockResolvedValue([
        SemanticRecoveryCandidateSchema.parse({
          ...semanticCurrentFixture({
            state: semanticStateFixture({
              indexedSeq,
              indexedFingerprint: fp,
              gcRequired,
              observedAt,
              lastIndexedAt: new Date(0),
              lastRequeuedAt: new Date('2026-10-09T00:00:00Z'),
              requeueCount: 1,
            }),
          }),
          scope,
        }),
      ]);
      expect(await service.runOnce()).toBe(1);
      expect(queue.auto).toHaveBeenCalledWith(scope, delay);
    },
  );
});
