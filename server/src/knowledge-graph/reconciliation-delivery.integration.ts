import { KnowledgeGraphProjectionProcessor } from '@/jobs/knowledge-graph/knowledge-graph-projection.processor';
import { KnowledgeGraphReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-reconciliation.scheduler';
import { KnowledgeGraphWriter } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-writer.provider';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createReconciliationRecoveryContext } from '@/knowledge-graph/testing/reconciliation-recovery.context';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { ProjectRepository } from '@/projects/infrastructure/persistence/project.repository';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { and, eq } from 'drizzle-orm';

jest.setTimeout(120_000);

describeKnowledgeGraph('전달 장애에서 실제 PG·Redis·Jobs·Neo4j 복구', () => {
  const context = createReconciliationRecoveryContext();

  it('F-01 relay ack 뒤 자기 Redis queue가 유실돼도 PG 기준으로 30개 원본이 수렴한다', async () => {
    const owner = await context.actor();
    const org = await context.createOrganization(owner);
    for (let i = 0; i < 20; i++)
      await context.createWiki(org, owner.userId, `유실 문서 ${i}`);
    for (let i = 0; i < 10; i++) await context.createProject(org, owner.userId);
    await context.publishAll(30);
    expect(
      (await context.rows(org)).every(({ appliedSeq }) => appliedSeq === 0),
    ).toBe(true);
    await context.relay().stop();
    await context.queue.obliterate({ force: true });
    await context.agePending(org);
    const startedAt = Date.now();
    await context.tick();
    context.relay().start();
    await context.queue.resume();
    await context.converged(org, 30);
    expect(
      (await context.rows(org)).every(({ requeueCount }) => requeueCount === 0),
    ).toBe(true);
    expect(
      await context.graph.query(
        'MATCH (node) WHERE node.organizationId=$org AND (node:KGWorkOSWikiDocument OR node:KGWorkOSProject) RETURN count(node) AS nodes, count(DISTINCT node.key) AS uniqueNodes',
        { org },
      ),
    ).toEqual([{ nodes: '30', uniqueNodes: '30' }]);
    expect((await context.relay().stats()).deadLetters).toBe(0);
    console.info(
      JSON.stringify({
        scenario: 'F-01',
        sources: 30,
        elapsedMs: Date.now() - startedAt,
      }),
    );
  });

  it('F-02 applying 도중 worker 중단 후 Jobs 재기동은 최신 snapshot으로 복구한다', async () => {
    const owner = await context.actor();
    const org = await context.createOrganization(owner);
    const source = await context.createProject(org, owner.userId);
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const processor = context.jobs.get(KnowledgeGraphProjectionProcessor);
    const stopped = jest
      .spyOn(processor, 'process')
      .mockImplementationOnce(async () => {
        await context.state().markApplying(org, 'project', source.id, 1);
        await blocked;
      });
    await context.queue.resume();
    await waitForCondition(
      async () =>
        (await context.state().current(org, 'project', source.id))
          ?.projectionStatus === 'applying',
      'applying 중단 지점이 없습니다.',
    );
    await processor.worker.close(true);
    release();
    stopped.mockRestore();
    await context.scheduler().onModuleDestroy();
    await context.relay().stop();
    await context.restartJobs();
    await context.database
      .update(outboxAggregateVersion)
      .set({ lastAttemptedAt: new Date(0) })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, org),
          eq(outboxAggregateVersion.aggregateId, source.id),
        ),
      );
    await context.jobs.get(KnowledgeGraphReconciliationScheduler).runOnce();
    await context.converged(org);
    expect(
      (await context.state().current(org, 'project', source.id))?.appliedSeq,
    ).toBe(1);
    await context.jobs
      .get(ProjectRepository)
      .updateProject(org, source.id, { name: '중단 뒤 최신' });
    await context.converged(org);
    expect(
      await context.graph.query(
        'MATCH (node:KGWorkOSProject {key:$key}) RETURN node.name AS name',
        { key: JSON.stringify(['project', org, source.id]) },
      ),
    ).toEqual([{ name: '중단 뒤 최신' }]);
  });

  it('F-03 실제 10회 시도 소진은 failed를 종결하고 새 owner 변경만 재접수한다', async () => {
    const owner = await context.actor();
    const org = await context.createOrganization(owner);
    const failed = await context.createProject(org, owner.userId);
    const healthy = await context.createProject(org, owner.userId);
    const writer = context.jobs.get(KnowledgeGraphWriter);
    const originalApply = writer.applyProject.bind(writer);
    const fail = jest
      .spyOn(writer, 'applyProject')
      .mockImplementation(async (source, snapshot) => {
        if (source.aggregateId === failed.id)
          throw new Error('특정 source 장애 주입');
        await originalApply(source, snapshot);
      });
    await context.publishAll(2);
    const waiting = await context.queue.getJobs(['paused', 'waiting']);
    for (const job of waiting) {
      const id = job.id;
      const data = job.data;
      const name = job.name;
      await job.remove();
      await context.queue.add(name, data, {
        jobId: id,
        attempts: 10,
        backoff: { type: 'exponential', delay: 1 },
      });
    }
    await context.queue.resume();
    await waitForCondition(
      async () =>
        (await context.state().current(org, 'project', failed.id))
          ?.projectionStatus === 'failed',
      '10회 소진 failed를 확인하지 못했습니다.',
      { timeoutMs: 30_000 },
    );
    expect(
      (await context.state().current(org, 'project', healthy.id))?.appliedSeq,
    ).toBe(1);
    expect(
      fail.mock.calls.filter(([source]) => source.aggregateId === failed.id),
    ).toHaveLength(10);
    const before = await context.state().current(org, 'project', failed.id);
    for (let i = 0; i < 3; i++) {
      await context.agePending(org);
      await context.tick();
    }
    expect(
      await context.state().current(org, 'project', failed.id),
    ).toMatchObject({
      desiredSeq: before?.desiredSeq,
      projectionStatus: 'failed',
      requeueCount: 0,
    });
    expect(
      fail.mock.calls.filter(([source]) => source.aggregateId === failed.id),
    ).toHaveLength(10);
    fail.mockRestore();
    await context.jobs
      .get(ProjectRepository)
      .updateProject(org, failed.id, { name: '새 변경으로 재접수' });
    await context.converged(org);
    expect(
      (await context.state().current(org, 'project', failed.id))?.desiredSeq,
    ).toBe(2);
  });
});
