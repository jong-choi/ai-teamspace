import { ToolCallingGraphExtractionError } from '@repo/knowledge-graph';
import {
  createSemanticFlowContext,
  describeSemanticFlow,
} from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

jest.setTimeout(60_000);

describeSemanticFlow(
  'Tool Calling 검증 실패와 유효한 빈 결과의 실제 세대 처리',
  () => {
    const context = createSemanticFlowContext();
    it.each([
      'no_tool_call',
      'unexpected_tool_calls',
      'invalid_arguments',
      'schema_mismatch',
    ] as const)(
      'F7-11 %s 검증 실패는 이전 active를 보존하고 validation_failed로 기록한다',
      async (reason) => {
        const text = `도구 검증 ${reason} 본문`;
        const created = await context.createWiki(`검증 실패 ${reason}`, text);
        const scope = {
          organizationId: context.org,
          aggregateKind: 'wiki_document',
          aggregateId: created.id,
        } as const;
        const state = context.app.get(OutboxSemanticSourceState);
        await context.refresh.requestManualRefresh(
          context.org,
          created.id,
          context.actor,
        );
        await context.indexed(created.id, 1);
        const active = (await state.current(scope))?.state?.activeGenerationId;
        context.extractor.failures.set(
          text,
          new ToolCallingGraphExtractionError(reason, '고정 검증 실패'),
        );
        const beforeEmbedding = context.embedder.calls.filter((texts) =>
          texts.some((value) => value.includes(text)),
        ).length;
        await context.refresh.requestManualRefresh(
          context.org,
          created.id,
          context.actor,
        );
        await waitForCondition(
          async () =>
            (await state.current(scope))?.state?.runStatus ===
            'validation_failed',
          '유효하지 않은 추출이 실패 상태로 기록되지 않았습니다.',
        );
        expect((await state.current(scope))?.state).toMatchObject({
          activeGenerationId: active,
          indexedManualSeq: 1,
          manualRequestSeq: 2,
          lastErrorCode: 'EXTRACTION_INVALID_RESPONSE',
        });
        expect(
          context.embedder.calls.filter((texts) =>
            texts.some((value) => value.includes(text)),
          ).length,
        ).toBe(beforeEmbedding);
      },
    );
    it('F7-11 유효한 빈 graph는 정상 chunk vector와 새 active 세대로 반영한다', async () => {
      const text = '관계가 추출되지 않은 유효 문서';
      const created = await context.createWiki('유효한 빈 추출', text);
      context.extractor.emptyGraphs.add(text);
      await context.refresh.requestManualRefresh(
        context.org,
        created.id,
        context.actor,
      );
      await context.indexed(created.id, 1);
      const current = await context.app.get(OutboxSemanticSourceState).current({
        organizationId: context.org,
        aggregateKind: 'wiki_document',
        aggregateId: created.id,
      });
      expect(current?.state?.lastErrorCode).toBeNull();
      expect(
        await context.graph.query(
          'MATCH (c:KGSemanticChunk) WHERE c.organizationId=$org AND c.generationId=$generation OPTIONAL MATCH (c)-[:KG_SEMANTIC_MENTIONS]->(e:KGSemanticEntity) RETURN count(DISTINCT c) AS chunks, count(e) AS entities',
          { org: context.org, generation: current?.state?.activeGenerationId },
        ),
      ).toEqual([{ chunks: '1', entities: '0' }]);
    });
  },
);
