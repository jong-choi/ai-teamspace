import { KnowledgeGraphJobsModule } from '@/jobs/knowledge-graph/knowledge-graph-jobs.module';
import { reconciliationScope } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.schema';
import { KnowledgeGraphReconciliationService } from '@/knowledge-graph/knowledge-graph-reconciliation.service';
import { describeSlowKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createReconciliationRecoveryContext } from '@/knowledge-graph/testing/reconciliation-recovery.context';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import { ProjectRepository } from '@/projects/infrastructure/persistence/project.repository';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';

import { and, eq } from 'drizzle-orm';

jest.setTimeout(120_000);

// 과거 원본 1,000건을 실제 PG·Neo4j로 backfill하고 cursor 재개·Jobs 재기동까지 확인하므로 약 50초 걸린다.
describeSlowKnowledgeGraph(
  '초기 그래프 접수·cursor 재개·다중 Jobs 복구',
  '1,000건 backfill·Jobs 재기동 복구, 약 50초',
  () => {
    const context = createReconciliationRecoveryContext();

    it('F-07 초기 이벤트 없는 Project 1K를 접수하고 동시 owner 변경·Wiki 삭제가 최종 승리한다', async () => {
      const owner = await context.actor();
      const org = await context.createOrganization(owner);
      const historicalRows = await context.historical(org, owner.userId, 1000);
      const wiki = await context.createWiki(
        org,
        owner.userId,
        'backfill 중 삭제',
      );
      const scopes = context.jobs.get(KnowledgeGraphReconciliationService);
      const startedAt = Date.now();
      for (let i = 0; i < 10; i++) {
        await scopes.discoverOwnerSources();
        if (
          (await context.rows(org)).some(
            ({ aggregateKind }) => aggregateKind === 'project',
          )
        )
          break;
      }
      const updated = historicalRows[0];
      if (!updated) throw new Error('초기 원본이 없습니다.');
      await context.jobs.get(ProjectRepository).updateProject(org, updated.id, {
        name: 'live 변경 최종',
        archived: false,
      });
      await context.jobs.get(WikiRepository).deleteDocument(org, wiki.id);
      for (let i = 0; i < 3; i++) await context.tick();
      await context.queue.resume();
      await context.converged(org, 1002);
      const projects = (await context.rows(org)).filter(
        ({ aggregateKind }) => aggregateKind === 'project',
      );
      expect(projects).toHaveLength(1000);
      expect(projects.filter(({ desiredSeq }) => desiredSeq > 1)).toHaveLength(
        1,
      );
      expect(
        await context.graph.query(
          'MATCH (node:KGWorkOSProject) WHERE node.organizationId=$org RETURN count(node) AS nodes, count(DISTINCT node.key) AS uniqueNodes',
          { org },
        ),
      ).toEqual([{ nodes: '1000', uniqueNodes: '1000' }]);
      expect(
        await context.graph.query(
          'MATCH (node:KGWorkOSProject {key:$key}) RETURN node.name AS name',
          { key: JSON.stringify(['project', org, updated.id]) },
        ),
      ).toEqual([{ name: 'live 변경 최종' }]);
      expect(
        (await context.state().current(org, 'wiki_document', wiki.id))?.deleted,
      ).toBe(true);
      console.info(
        JSON.stringify({
          scenario: 'F-07',
          sources: 1000,
          elapsedMs: Date.now() - startedAt,
        }),
      );
    });

    it('F-08 Jobs 재기동은 저장 cursor를 이어가며 접수한 seq를 증가시키지 않는다', async () => {
      const owner = await context.actor();
      const org = await context.createOrganization(owner);
      await context.historical(org, owner.userId, 250);
      const recovery = context.jobs.get(KnowledgeGraphReconciliationService);
      for (let i = 0; i < 10; i++) {
        await recovery.discoverOwnerSources();
        if (
          (await context.rows(org)).some(
            ({ aggregateKind }) => aggregateKind === 'project',
          )
        )
          break;
      }
      const before = (await context.rows(org)).filter(
        ({ aggregateKind }) => aggregateKind === 'project',
      );
      expect(before).toHaveLength(100);
      const [cursor] = await context.database
        .select()
        .from(reconciliationScope)
        .where(
          and(
            eq(reconciliationScope.organizationId, org),
            eq(reconciliationScope.aggregateKind, 'project'),
          ),
        );
      expect(cursor?.afterAggregateId).toBeTruthy();
      await context.scheduler().onModuleDestroy();
      await context.relay().stop();
      await context.restartJobs();
      await context.tick();
      await context.queue.resume();
      await context.converged(org, 251);
      const after = await context.rows(org);
      for (const row of before)
        expect(
          after.find(({ aggregateId }) => aggregateId === row.aggregateId)
            ?.desiredSeq,
        ).toBe(row.desiredSeq);
      expect(
        after.filter(({ aggregateKind }) => aggregateKind === 'project'),
      ).toHaveLength(250);
    });

    it('F-09 두 실제 Jobs는 pending 200 재예약과 owner 접수를 분할해 중복 없이 수렴한다', async () => {
      const owner = await context.actor();
      const org = await context.createOrganization(owner);
      await context.historical(org, owner.userId, 200);
      const second = await context.startJobs();
      await Promise.all([context.tick(), context.tick(second)]);
      await context.publishAll(200);
      await context.relay().stop();
      await context.relay(second).stop();
      await context.queue.obliterate({ force: true });
      await context.agePending(org);
      const firstPublisher = context.jobs
        .select(KnowledgeGraphJobsModule)
        .get(OutboxAggregateChangePublisher, { strict: true });
      const secondPublisher = second
        .select(KnowledgeGraphJobsModule)
        .get(OutboxAggregateChangePublisher, { strict: true });
      const first = jest.spyOn(firstPublisher, 'requeueCurrent');
      const other = jest.spyOn(secondPublisher, 'requeueCurrent');
      await Promise.all([context.tick(), context.tick(second)]);
      const sourceIds = [...first.mock.calls, ...other.mock.calls]
        .filter(([, source]) => source.aggregateKind === 'project')
        .map(([, source]) => source.aggregateId);
      expect(sourceIds).toHaveLength(200);
      expect(new Set(sourceIds).size).toBe(200);
      context.relay().start();
      context.relay(second).start();
      await context.queue.resume();
      await context.converged(org, 201);
      expect(
        (await context.rows(org)).every(({ desiredSeq }) => desiredSeq === 1),
      ).toBe(true);
      expect((await context.relay().stats()).deadLetters).toBe(0);
    });
  },
);
