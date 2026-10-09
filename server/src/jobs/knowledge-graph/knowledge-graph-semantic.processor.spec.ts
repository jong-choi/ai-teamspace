import { Test } from '@nestjs/testing';

import { SEMANTIC_MANUAL_JOB } from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import { KnowledgeGraphSemanticProcessor } from '@/jobs/knowledge-graph/knowledge-graph-semantic.processor';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import {
  SemanticLeaseLostError,
  SemanticProviderError,
} from '@/knowledge-graph/domain/semantic-error';
import { SemanticIngestionService } from '@/knowledge-graph/semantic-ingestion.service';

import { DelayedError, UnrecoverableError, Worker } from 'bullmq';

describe('의미 processor의 시도 상한·분류·busy 지연', () => {
  let processor: KnowledgeGraphSemanticProcessor;
  const run = jest.fn<
    ReturnType<SemanticIngestionService['run']>,
    Parameters<SemanticIngestionService['run']>
  >();
  const rateLimit = jest.fn();
  const job = () => ({
    name: SEMANTIC_MANUAL_JOB,
    data: {
      organizationId: 'p7-processor-org',
      aggregateKind: 'wiki_document',
      aggregateId: '10000000-0000-4000-8000-000000000001',
    },
    opts: { attempts: 4 },
    attemptsMade: 0,
    moveToDelayed: jest.fn(),
  });
  beforeEach(async () => {
    jest.resetAllMocks();
    run.mockResolvedValue('done');
    const app = await Test.createTestingModule({
      providers: [
        KnowledgeGraphSemanticProcessor,
        {
          provide: knowledgeGraphConfig.KEY,
          useValue: { semanticEnabled: true },
        },
        { provide: SemanticIngestionService, useValue: { run } },
      ],
    }).compile();
    processor = app.get(KnowledgeGraphSemanticProcessor);
    // Nest가 worker를 등록하는 public SDK 경계만 대체한다. 실제 Redis 경로는 Q7에서 확인한다.
    Object.defineProperty(processor, 'worker', { get: () => ({ rateLimit }) });
  });
  it('U7-16 busy는15초 지연과 DelayedError이며 attemptsMade는 불변이다', async () => {
    const current = job();
    run.mockResolvedValue('busy');
    const before = Date.now();
    await expect(processor.process(current, 'token')).rejects.toBeInstanceOf(
      DelayedError,
    );
    expect(current.attemptsMade).toBe(0);
    expect(current.moveToDelayed).toHaveBeenCalledWith(
      expect.any(Number),
      'token',
    );
    const deadline = current.moveToDelayed.mock.calls[0]?.[0];
    expect(deadline).toBeGreaterThanOrEqual(before + 15_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 15_000);
  });
  it.each([
    'PROVIDER_UNAUTHORIZED',
    'EMBEDDING_INVALID',
    'EXTRACTION_INVALID_RESPONSE',
  ] as const)('U7-16 %s는 UnrecoverableError로 종결한다', async (code) => {
    run.mockRejectedValue(new SemanticProviderError(code));
    await expect(processor.process(job())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });
  it('U7-16 429는 공급자 delay로 worker rate limit하며 일반 시도를 소모하지 않는 오류를 낸다', async () => {
    run.mockRejectedValue(
      new SemanticProviderError('PROVIDER_RATE_LIMITED', 1234),
    );
    await expect(processor.process(job())).rejects.toThrow(
      Worker.RateLimitError().message,
    );
    expect(rateLimit).toHaveBeenCalledWith(1234);
  });
  it.each(['PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT'] as const)(
    'U7-16 %s의 마지막 시도 여부를 ingestion에 전달한다',
    async (code) => {
      const current = { ...job(), attemptsMade: 3 };
      run.mockRejectedValue(new SemanticProviderError(code));
      await expect(processor.process(current)).rejects.toThrow(code);
      expect(run).toHaveBeenCalledWith(
        current.data,
        true,
        expect.any(AbortSignal),
      );
    },
  );
  it('lease 상실·shutdown은 오래된 실행을 더 처리하지 않는다', async () => {
    run.mockRejectedValue(new SemanticLeaseLostError());
    await expect(processor.process(job())).resolves.toBeUndefined();
    processor.onModuleDestroy();
    run.mockRejectedValue(new Error('노출하면 안 되는 SDK 메시지'));
    await expect(processor.process(job())).resolves.toBeUndefined();
  });
});
