import { DatabaseService } from '@/database/database.service';
import { KnowledgeGraphSemanticProcessor } from '@/jobs/knowledge-graph/knowledge-graph-semantic.processor';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { outboxSemanticSourceState } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/teamspace-agent.e2e-support';
import { and, eq } from 'drizzle-orm';

jest.setTimeout(60_000);

describeKnowledgeGraph('실제 비활성 staging 뒤 두 Jobs의 최신 CAS 경합', () => {
  const context = createSemanticFlowContext();
  afterEach(() => jest.restoreAllMocks());
  it('F7-06 이전 staging의 늦은 실제 PG CAS는 거부되고 최신 세대만 남는다', async () => {
    const source = await context.createWiki(
      'staging takeover',
      '이전 staging 본문',
    );
    const scope = {
      organizationId: context.org,
      aggregateKind: 'wiki_document',
      aggregateId: source.id,
    } as const;
    const state = context.app.get(OutboxSemanticSourceState);
    const activate = state.activate.bind(state);
    let release = () => {};
    let entered = false;
    let previousGeneration: string | null = null;
    let outcome: Awaited<
      ReturnType<OutboxSemanticSourceState['activate']>
    > | null = null;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(state, 'activate').mockImplementationOnce(async (...args) => {
      previousGeneration = args[2].activeGenerationId;
      entered = true;
      await barrier;
      outcome = await activate(...args);
      return outcome;
    });
    let requestId: string | null = null;
    let currentGeneration: string | null = null;
    try {
      const request = await context.refresh.requestManualRefresh(
        context.org,
        source.id,
        context.actor,
      );
      if (request.outcome !== 'accepted')
        throw new Error('첫 요청이 없습니다.');
      requestId = request.requestId;
      await waitForCondition(
        async () => entered,
        '이전 staging 후 CAS 지점이 없습니다.',
      );
      expect(
        await context.graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation RETURN count(c) AS staged',
          { org: context.org, generation: previousGeneration },
        ),
      ).toEqual([{ staged: '1' }]);
      await context.app.get(KnowledgeGraphSemanticProcessor).worker.pause(true);
      await context.replaceWikiBody(source.id, '최신 staging 본문');
      await context.database
        .update(outboxSemanticSourceState)
        .set({ leaseExpiresAt: new Date(0) })
        .where(
          and(
            eq(outboxSemanticSourceState.organizationId, context.org),
            eq(outboxSemanticSourceState.aggregateId, source.id),
          ),
        );
      const second = await context.startJobs();
      expect(second.get(DatabaseService)).not.toBe(
        context.app.get(DatabaseService),
      );
      expect(second.get(KnowledgeGraphSemanticProcessor).worker).not.toBe(
        context.app.get(KnowledgeGraphSemanticProcessor).worker,
      );
      await second.get(SemanticJobQueueProvider).auto(scope, 0);
      await context.indexed(source.id, 1);
      currentGeneration =
        (await state.current(scope))?.state?.activeGenerationId ?? null;
      expect(currentGeneration).not.toBe(previousGeneration);
    } finally {
      release();
    }
    if (!requestId) throw new Error('이전 요청이 없습니다.');
    await waitForCondition(
      async () =>
        (await context.queue.getJob(`kg-semantic-manual-${requestId}`))
          ?.getState()
          .then((status) => status === 'completed') ?? false,
      '이전 CAS 작업이 끝나지 않았습니다.',
      { timeoutMs: 30_000 },
    );
    expect(outcome).toMatchObject({ outcome: 'superseded' });
    expect((await state.current(scope))?.state?.activeGenerationId).toBe(
      currentGeneration,
    );
    expect(
      await context.graph.query(
        'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation RETURN count(c) AS old',
        { org: context.org, generation: previousGeneration },
      ),
    ).toEqual([{ old: '0' }]);
    expect(
      await context.graph.query(
        'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation RETURN c.text AS text',
        { org: context.org, generation: currentGeneration },
      ),
    ).toEqual([{ text: '최신 staging 본문' }]);
  });
});
