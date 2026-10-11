import { randomUUID } from 'node:crypto';

import {
  SEMANTIC_AUTO_JOB,
  SEMANTIC_JOB_OPTIONS,
  semanticAutoDedupId,
} from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { OutboxAggregateEventSchema } from '@/outbox/outbox-aggregate-event.schema';
import {
  createProducerRedisOptions,
  createWorkerRedisOptions,
} from '@/queue/queue.config';

import { waitForCondition } from '@test/agent/support/teamspace-agent.e2e-support';
import { Queue, Worker } from 'bullmq';
import type { z } from 'zod';

const redisUrl = process.env.REDIS_QUEUE_URL;
jest.setTimeout(30_000);

describeKnowledgeGraph(
  'BullMQ 설치 버전의 delayed·active·waiting dedup 실동작',
  () => {
    const scope = {
      organizationId: 'p7-dedup',
      aggregateKind: 'wiki_document',
      aggregateId: '10000000-0000-4000-8000-000000000001',
    } as const;
    let queue: Queue;
    let worker: Worker | null;
    let prefix: string;
    const releases: Array<() => void> = [];
    const seen: Array<z.infer<typeof OutboxAggregateEventSchema>> = [];
    const payload = (sourceVersion: number) =>
      OutboxAggregateEventSchema.parse({
        ...scope,
        sourceVersion,
        operation: 'changed',
        occurredAt: '2026-10-09T00:00:00Z',
      });
    const options = (delay: number) => ({
      ...SEMANTIC_JOB_OPTIONS,
      delay,
      deduplication: {
        id: semanticAutoDedupId(scope),
        replace: true,
        keepLastIfActive: true,
      },
    });

    beforeEach(async () => {
      if (!redisUrl) throw new Error('격리 Redis 설정이 없습니다.');
      prefix = `kg-p7-dedup-${randomUUID()}`;
      queue = new Queue('p7-dedup-characterization', {
        prefix,
        connection: createProducerRedisOptions(redisUrl),
      });
      worker = null;
      seen.length = 0;
    });
    afterEach(async () => {
      for (const release of releases.splice(0)) release();
      await worker?.close(true);
      await queue.obliterate({ force: true });
      await queue.close();
    });
    function start(process: ConstructorParameters<typeof Worker>[1]) {
      if (!redisUrl) throw new Error('격리 Redis 설정이 없습니다.');
      worker = new Worker(queue.name, process, {
        prefix,
        connection: createWorkerRedisOptions(redisUrl),
        concurrency: 1,
      });
      worker.on('error', () => {});
    }

    it('Q7-01 자동300초를 다시 접수하면 delayed는1개이며 예정 시각이 연장된다', async () => {
      const first = await queue.add(
        SEMANTIC_AUTO_JOB,
        payload(1),
        options(300_000),
      );
      const due = first.timestamp + first.delay;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await queue.add(SEMANTIC_AUTO_JOB, payload(2), options(300_000));
      const delayed = await queue.getJobs(['delayed']);
      expect(delayed).toHaveLength(1);
      expect(delayed[0].timestamp + delayed[0].delay).toBeGreaterThan(due);
      expect(
        OutboxAggregateEventSchema.parse(delayed[0].data).sourceVersion,
      ).toBe(2);
    });
    it('Q7-02 active 중 세 접수는 완료 뒤 마지막 payload 한 개만 만든다', async () => {
      let release = () => {};
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      releases.push(release);
      start(async (job) => {
        seen.push(OutboxAggregateEventSchema.parse(job.data));
        if (seen.length === 1) await barrier;
      });
      await queue.add(SEMANTIC_AUTO_JOB, payload(1), options(0));
      await waitForCondition(
        async () => seen.length === 1,
        '첫 active가 없습니다.',
      );
      for (const version of [2, 3, 4])
        await queue.add(SEMANTIC_AUTO_JOB, payload(version), options(0));
      release();
      await waitForCondition(
        async () =>
          (await queue.getJobCounts('active', 'waiting')).active === 0 &&
          seen.length === 2,
        '최신 후속 작업이 없습니다.',
      );
      expect(seen.map((row) => row.sourceVersion)).toEqual([1, 4]);
    });
    it('Q7-03 waiting 새 접수는 버려져도 active 자기 재예약은 후속 delayed를 보존한다', async () => {
      await queue.add(SEMANTIC_AUTO_JOB, payload(1), options(0));
      await queue.add(SEMANTIC_AUTO_JOB, payload(2), options(300_000));
      expect(await queue.getJobs(['waiting'])).toHaveLength(1);
      expect(await queue.getJobs(['delayed'])).toHaveLength(0);
      start(async (job) => {
        seen.push(OutboxAggregateEventSchema.parse(job.data));
        if (seen.length === 1)
          await queue.add(SEMANTIC_AUTO_JOB, payload(2), options(300_000));
      });
      await waitForCondition(
        async () => (await queue.getJobs(['delayed'])).length === 1,
        '자기 재예약이 남지 않았습니다.',
      );
      expect(seen.map((row) => row.sourceVersion)).toEqual([1]);
      const [delayed] = await queue.getJobs(['delayed']);
      expect(OutboxAggregateEventSchema.parse(delayed.data).sourceVersion).toBe(
        2,
      );
      await delayed.promote();
      await waitForCondition(
        async () => seen.length === 2,
        '마지막 payload를 실행하지 못했습니다.',
      );
      expect(seen.map((row) => row.sourceVersion)).toEqual([1, 2]);
    });
    it('Q7-06 retry backoff중 새접수는 설치Lua의replace규칙으로 최신작업을 보존한다', async () => {
      start(async (job) => {
        const event = OutboxAggregateEventSchema.parse(job.data);
        seen.push(event);
        if (event.sourceVersion === 1) throw new Error('backoff 검증 실패');
      });
      await queue.add(SEMANTIC_AUTO_JOB, payload(1), options(0));
      await waitForCondition(
        async () => (await queue.getJobs(['delayed'])).length === 1,
        'retry backoff 작업이 없습니다.',
      );
      await queue.add(SEMANTIC_AUTO_JOB, payload(2), options(0));
      await waitForCondition(
        async () => seen.some((event) => event.sourceVersion === 2),
        '새 최신 작업이 유실됐습니다.',
      );
      expect(seen.map((event) => event.sourceVersion)).toEqual([1, 2]);
      expect(await queue.getJobs(['delayed'])).toHaveLength(0);
    });
  },
);
