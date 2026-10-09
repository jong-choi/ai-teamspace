import { KnowledgeGraphProjectionProcessor } from '@/jobs/knowledge-graph/knowledge-graph-projection.processor';
import { KnowledgeGraphSemanticProcessor } from '@/jobs/knowledge-graph/knowledge-graph-semantic.processor';
import {
  createSemanticFlowContext,
  describeSemanticFlow,
} from '@/knowledge-graph/testing/semantic-flow.context';
import { outboxAggregateVersion as version } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { and, eq } from 'drizzle-orm';

jest.setTimeout(60_000);
describeSemanticFlow('구조 투영과 의미 실행 worker의 독립 전달', () => {
  const context = createSemanticFlowContext();
  it('Q7-07 한 worker를 정지해도 다른 queue의 업무는 전달·완료된다', async () => {
    const structural = context.app.get(
      KnowledgeGraphProjectionProcessor,
    ).worker;
    const semantic = context.app.get(KnowledgeGraphSemanticProcessor).worker;
    await structural.pause();
    try {
      const source = await context.createWiki(
        '독립 queue 원본',
        '독립 queue의 현재 본문',
      );
      await context.refresh.requestManualRefresh(
        context.org,
        source.id,
        context.actor,
      );
      await context.indexed(source.id, 1);
      const where = and(
        eq(version.organizationId, context.org),
        eq(version.aggregateId, source.id),
        eq(version.aggregateKind, 'wiki_document'),
      );
      const [blocked] = await context.database
        .select()
        .from(version)
        .where(where);
      expect(blocked?.appliedSeq).toBe(0);
      await semantic.pause();
      await context.wiki.updateDocumentMetadata(
        context.org,
        source.id,
        context.actor,
        { title: '독립 queue 변경', parentDocumentId: null, position: 1 },
      );
      await context.refresh.requestManualRefresh(
        context.org,
        source.id,
        context.actor,
      );
      structural.resume();
      await waitForCondition(
        async () =>
          (await context.database.select().from(version).where(where))[0]
            ?.appliedSeq === 2,
        '의미 worker 정지 중 구조 투영이 전달되지 않았습니다.',
        { timeoutMs: 15_000 },
      );
      const current = await context.app.get(OutboxSemanticSourceState).current({
        organizationId: context.org,
        aggregateKind: 'wiki_document',
        aggregateId: source.id,
      });
      expect(current?.state).toMatchObject({
        indexedSeq: 1,
        manualRequestSeq: 2,
        indexedManualSeq: 1,
      });
      expect(
        context.extractor.calls.filter(
          (text) => text === source.contentMarkdown,
        ),
      ).toHaveLength(1);
      semantic.resume();
      await context.indexed(source.id, 2);
    } finally {
      structural.resume();
      semantic.resume();
    }
  });
});
