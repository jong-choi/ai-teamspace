import { Test } from '@nestjs/testing';

import { GraphDocument } from '@repo/knowledge-graph';
import { SemanticProviderError } from '@/knowledge-graph/domain/semantic-error';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { SemanticChunkerProvider } from '@/knowledge-graph/infrastructure/chunking/semantic-chunker.provider';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';
import { SemanticGraphExtractor } from '@/knowledge-graph/infrastructure/extraction/semantic-graph-extractor.provider';
import { SemanticGraphStore } from '@/knowledge-graph/infrastructure/graph/semantic-graph-store.provider';
import { SemanticSourceStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-source-state.repository';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import { TeamspaceSourceProvider } from '@/knowledge-graph/infrastructure/source/teamspace-source.provider';
import { SemanticCorrectionService } from '@/knowledge-graph/semantic-correction.service';
import { SemanticIngestionService } from '@/knowledge-graph/semantic-ingestion.service';
import {
  semanticCurrentFixture,
  semanticStateFixture,
} from '@/knowledge-graph/testing/semantic-state.fixture';
import type { SemanticActivation } from '@/outbox/domain/semantic-source';
import { SemanticLeaseSchema } from '@/outbox/domain/semantic-source';
import type { WikiSemanticSource } from '@/wiki/domain/wiki-semantic-source';

import { Document } from '@langchain/core/documents';

describe('의미 worker의 quiet·force·snapshot·fence 수락', () => {
  const scope = {
    organizationId: 'p7-unit-org',
    aggregateKind: 'wiki_document',
    aggregateId: '10000000-0000-4000-8000-000000000001',
  } as const;
  const owner: WikiSemanticSource = {
    id: scope.aggregateId,
    organizationId: scope.organizationId,
    collectionId: '10000000-0000-4000-8000-000000000010',
    title: '현재 제목',
    parentDocumentId: null,
    position: 0,
    contentMarkdown: '현재 본문',
    updatedAt: new Date(0),
  };
  const state = {
    current: jest.fn(),
    observeCommitted: jest.fn(),
    acquireLease: jest.fn(),
    heartbeat: jest.fn(),
    release: jest.fn(),
    activate: jest.fn(),
    satisfyWithoutReindex: jest.fn(),
    markRemoved: jest.fn(),
    clearGc: jest.fn(),
  };
  const sources = { wikiSemantic: jest.fn() };
  const queue = { auto: jest.fn(), manual: jest.fn(), remove: jest.fn() };
  const chunker = { chunks: jest.fn() };
  const extractor = { extract: jest.fn() };
  const embedder = { embedDocuments: jest.fn() };
  const graph = {
    stageGeneration: jest.fn(),
    deleteGeneration: jest.fn(),
    deleteInactiveGenerations: jest.fn(),
  };
  let service: SemanticIngestionService;
  const lease = SemanticLeaseSchema.parse({
    leaseToken: '10000000-0000-4000-8000-000000000011',
    fenceToken: 1,
    attemptSeq: 1,
    attemptManualSeq: 0,
    attemptFingerprint: semanticPipelineFingerprint,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    state.current.mockResolvedValue(semanticCurrentFixture());
    sources.wikiSemantic.mockResolvedValue(owner);
    state.acquireLease.mockResolvedValue(lease);
    state.heartbeat.mockResolvedValue(true);
    state.release.mockResolvedValue(true);
    state.activate.mockResolvedValue({
      outcome: 'activated',
      previousGenerationId: null,
    });
    chunker.chunks.mockResolvedValue([]);
    graph.deleteInactiveGenerations.mockResolvedValue(false);
    const app = await Test.createTestingModule({
      providers: [
        SemanticIngestionService,
        { provide: SemanticSourceStateRepository, useValue: state },
        { provide: TeamspaceSourceProvider, useValue: sources },
        { provide: SemanticJobQueueProvider, useValue: queue },
        { provide: SemanticChunkerProvider, useValue: chunker },
        { provide: SemanticGraphExtractor, useValue: extractor },
        { provide: SemanticEmbedder, useValue: embedder },
        { provide: SemanticGraphStore, useValue: graph },
        {
          provide: SemanticCorrectionService,
          useValue: { reportMatches: jest.fn() },
        },
      ],
    }).compile();
    service = app.get(SemanticIngestionService);
  });

  it('U7-17 최초 관측의 quiet 이전 자동 실행은 delay만 재예약하고 공급자를 호출하지 않는다', async () => {
    const current = semanticCurrentFixture({
      state: semanticStateFixture({
        observedAt: new Date('2026-10-09T00:00:00Z'),
      }),
    });
    state.current.mockResolvedValue(current);
    expect(await service.run(scope, false, new AbortController().signal)).toBe(
      'done',
    );
    expect(queue.auto).toHaveBeenCalledWith(scope, 30_000);
    expect(state.acquireLease.mock.calls.length).toBe(0);
    expect(extractor.extract.mock.calls.length).toBe(0);
  });
  it('U7-17 수동 요구는 quiet를 생략하며 빈 본문 세대는 공급자 호출 없이 활성화한다', async () => {
    const current = semanticCurrentFixture({
      state: semanticStateFixture({
        manualRequestSeq: 1,
        manualRequestId: '10000000-0000-4000-8000-000000000012',
        manualRequestedAt: new Date(0),
        observedAt: new Date('2026-10-09T00:00:00Z'),
      }),
    });
    state.current.mockResolvedValue(current);
    state.acquireLease.mockResolvedValue({ ...lease, attemptManualSeq: 1 });
    await service.run(scope, false, new AbortController().signal);
    expect(state.activate.mock.calls.length).toBe(1);
    expect(queue.auto.mock.calls.length).toBe(0);
    expect(extractor.extract.mock.calls.length).toBe(0);
    expect(embedder.embedDocuments.mock.calls.length).toBe(0);
  });
  it('U7-17 seq sandwich가 달라지면 공급자·staging·활성화 모두 수행하지 않는다', async () => {
    state.current
      .mockResolvedValueOnce(semanticCurrentFixture())
      .mockResolvedValueOnce(semanticCurrentFixture())
      .mockResolvedValue(
        semanticCurrentFixture({
          version: { desiredSeq: 2, deleted: false, updatedAt: new Date(0) },
        }),
      );
    await service.run(scope, false, new AbortController().signal);
    expect(state.release).toHaveBeenCalledWith(scope, lease, {
      runStatus: 'idle',
      lastErrorCode: null,
    });
    expect(extractor.extract.mock.calls.length).toBe(0);
    expect(state.activate.mock.calls.length).toBe(0);
  });
  it('U7-17 바쁜 source는 공급자 호출 없이 processor에 지연 결과를 반환한다', async () => {
    state.acquireLease.mockResolvedValue('busy');
    expect(await service.run(scope, false, new AbortController().signal)).toBe(
      'busy',
    );
    expect(extractor.extract.mock.calls.length).toBe(0);
  });
  it('긴 공급자 처리 뒤 staging 생성 시각은 실제 저장 직전의 PG 시각이다', async () => {
    const stageAt = new Date('2026-10-09T00:30:00Z');
    chunker.chunks.mockResolvedValue(['현재 본문']);
    extractor.extract.mockImplementation(async () => {
      state.current.mockResolvedValue(
        semanticCurrentFixture({ dbNow: stageAt }),
      );
      return new GraphDocument({
        nodes: [],
        relationships: [],
        source: new Document({ pageContent: '현재 본문' }),
      });
    });
    embedder.embedDocuments.mockResolvedValue([
      [1, ...Array.from({ length: 767 }, () => 0)],
    ]);
    await service.run(scope, false, new AbortController().signal);
    expect(graph.stageGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: stageAt }),
    );
  });
  it('U7-17 lease 상실 뒤에는 다음 chunk pair·embedding·staging·활성화 모두 중단한다', async () => {
    chunker.chunks.mockResolvedValue([
      '첫 chunk',
      '둘째 chunk',
      '셋째 chunk',
      '넷째 chunk',
    ]);
    extractor.extract.mockResolvedValue(
      new GraphDocument({
        nodes: [],
        relationships: [],
        source: new Document({ pageContent: '현재 본문' }),
      }),
    );
    state.heartbeat.mockResolvedValueOnce(true).mockResolvedValue(false);
    await service.run(scope, false, new AbortController().signal);
    expect(extractor.extract).toHaveBeenCalledTimes(2);
    expect(extractor.extract.mock.calls.map((call) => call[0])).toEqual([
      '첫 chunk',
      '둘째 chunk',
    ]);
    expect(embedder.embedDocuments).not.toHaveBeenCalled();
    expect(graph.stageGeneration).not.toHaveBeenCalled();
    expect(state.activate).not.toHaveBeenCalled();
  });
  it.each(['PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT'] as const)(
    '같은 요구의 %s는 queue 시도 수가 재설정돼도 PG4회 상한으로 종결한다',
    async (code) => {
      state.current.mockResolvedValue(
        semanticCurrentFixture({
          state: semanticStateFixture({
            attemptSeq: 1,
            attemptFingerprint: semanticPipelineFingerprint,
            retryCount: 3,
          }),
        }),
      );
      chunker.chunks.mockResolvedValue(['현재 본문']);
      extractor.extract.mockRejectedValue(new SemanticProviderError(code));
      await expect(
        service.run(scope, false, new AbortController().signal),
      ).rejects.toMatchObject({ code, terminal: true });
      expect(state.release).toHaveBeenCalledWith(scope, lease, {
        runStatus: 'failed',
        lastErrorCode: code,
      });
    },
  );
  it('새 desired 요구는 이전 queue의 마지막 시도와 PG 실패 횟수를 상속하지 않는다', async () => {
    state.current.mockResolvedValue(
      semanticCurrentFixture({
        version: { desiredSeq: 2, deleted: false, updatedAt: new Date(0) },
        state: semanticStateFixture({
          observedSeq: 2,
          attemptSeq: 1,
          attemptFingerprint: semanticPipelineFingerprint,
          retryCount: 4,
        }),
      }),
    );
    const latestLease = { ...lease, attemptSeq: 2 };
    state.acquireLease.mockResolvedValue(latestLease);
    chunker.chunks.mockResolvedValue(['현재 본문']);
    extractor.extract.mockRejectedValue(
      new SemanticProviderError('PROVIDER_UNAVAILABLE'),
    );
    await expect(
      service.run(scope, true, new AbortController().signal),
    ).rejects.toMatchObject({ terminal: false });
    expect(state.release).toHaveBeenCalledWith(scope, latestLease, {
      runStatus: 'retry_waiting',
      lastErrorCode: 'PROVIDER_UNAVAILABLE',
    });
  });
  it('U7-17 자동 자격 확인 뒤 새 owner 변경이 commit되면 새 lease snapshot에서도 quiet를 다시 확인한다', async () => {
    const changedAt = new Date('2026-10-09T00:00:00Z');
    const latest = semanticCurrentFixture({
      version: { desiredSeq: 2, deleted: false, updatedAt: changedAt },
      state: semanticStateFixture({ observedSeq: 2, observedAt: changedAt }),
    });
    state.current
      .mockResolvedValueOnce(semanticCurrentFixture())
      .mockResolvedValue(latest);
    sources.wikiSemantic.mockResolvedValueOnce(owner).mockResolvedValue({
      ...owner,
      updatedAt: changedAt,
      contentMarkdown: '새 변경 본문',
    });
    state.acquireLease.mockResolvedValue({ ...lease, attemptSeq: 2 });
    await service.run(scope, false, new AbortController().signal);
    expect(state.activate.mock.calls.length).toBe(0);
    expect(extractor.extract.mock.calls.length).toBe(0);
    expect(state.release).toHaveBeenCalledWith(
      scope,
      { ...lease, attemptSeq: 2 },
      { runStatus: 'idle', lastErrorCode: null },
    );
    expect(queue.auto).toHaveBeenCalledWith(scope, 30_000);
  });
  it('완료된 source의 만료된 GC lease는 takeover해 잔여 정리를 재개한다', async () => {
    const generation = '10000000-0000-4000-8000-000000000050';
    const current = semanticCurrentFixture({
      state: semanticStateFixture({
        indexedSeq: 1,
        indexedFingerprint: semanticPipelineFingerprint,
        activeGenerationId: generation,
        gcRequired: true,
        lastIndexedAt: new Date(0),
        leaseToken: lease.leaseToken,
        leaseExpiresAt: new Date(0),
        runStatus: 'running',
      }),
    });
    state.current.mockResolvedValue(current);
    graph.deleteInactiveGenerations.mockResolvedValue(true);
    await service.run(scope, false, new AbortController().signal);
    expect(state.acquireLease.mock.calls.length).toBe(1);
    expect(graph.deleteInactiveGenerations).toHaveBeenCalledWith(
      scope,
      generation,
      expect.any(Date),
    );
    expect(state.clearGc).toHaveBeenCalledWith(scope, generation);
    expect(extractor.extract.mock.calls.length).toBe(0);
  });
  it('F7-14 PG 활성화 commit 뒤 응답만 유실되면 이미 활성인 세대를 삭제하지 않는다', async () => {
    let persisted = semanticCurrentFixture();
    state.current.mockImplementation(async () => persisted);
    chunker.chunks.mockResolvedValue(['현재 본문']);
    extractor.extract.mockResolvedValue(
      new GraphDocument({
        nodes: [],
        relationships: [],
        source: new Document({ pageContent: '현재 본문' }),
      }),
    );
    embedder.embedDocuments.mockResolvedValue([
      [1, ...Array.from({ length: 767 }, () => 0)],
    ]);
    state.activate.mockImplementation(
      async (_scope, _lease, result: SemanticActivation) => {
        persisted = semanticCurrentFixture({
          state: semanticStateFixture({
            ...result,
            indexedSeq: 1,
            indexedManualSeq: 0,
            runStatus: 'idle',
            gcRequired: true,
          }),
        });
        throw new Error('PG 활성화 응답 유실');
      },
    );
    await expect(
      service.run(scope, false, new AbortController().signal),
    ).resolves.toBe('done');
    expect(persisted.state?.activeGenerationId).toBeTruthy();
    expect(graph.deleteGeneration.mock.calls.length).toBe(0);
    expect(state.release.mock.calls.length).toBe(0);
  });
});
