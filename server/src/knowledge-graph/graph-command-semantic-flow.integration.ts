import { SemanticCorrectionService } from '@/knowledge-graph/semantic-correction.service';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

jest.setTimeout(90_000);

const describeA4SemanticFlow =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.NEO4J_URI &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p8_a4'
    ? describe
    : describe.skip;

describeA4SemanticFlow('F8-04 A4 보정·force 재색인·취소 경합', () => {
  const context = createSemanticFlowContext();

  it('force 재색인 중 보정을 취소하면 최신 overlay만 남고 보정 쓰기는 추가 모델 호출을 만들지 않는다', async () => {
    const source = await context.createWiki(
      'F8-04 보정 경합',
      '지윤은 Neo4j를 사용한다.',
    );
    const scope = {
      organizationId: context.org,
      aggregateKind: 'wiki_document',
      aggregateId: source.id,
    } as const;

    await context.refresh.requestManualRefresh(
      context.org,
      source.id,
      context.actor,
    );
    await context.indexed(source.id, 1);

    const corrections = context.app.get(SemanticCorrectionService);
    const initial = await corrections.effectiveGraph(scope);
    const person = initial?.entities.find(
      (entity) => entity.anchor.entityType === 'Person',
    );
    if (!person) throw new Error('F8-04 보정 대상 entity가 없습니다.');

    const extractorBeforeCorrection = context.extractor.calls.length;
    const embedderBeforeCorrection = context.embedder.calls.length;
    const saved = await corrections.createLabelOverride(
      scope,
      person.key,
      '경합 중 표시명',
      context.actor,
    );
    expect(saved).toMatchObject({ outcome: 'created', editRevision: 1 });
    if (saved.outcome !== 'created')
      throw new Error('F8-04 보정이 저장되지 않았습니다.');
    expect(context.extractor.calls).toHaveLength(extractorBeforeCorrection);
    expect(context.embedder.calls).toHaveLength(embedderBeforeCorrection);
    expect(
      (await corrections.effectiveGraph(scope))?.entities.find(
        (entity) => entity.key === person.key,
      )?.displayName,
    ).toBe('경합 중 표시명');

    let releaseExtraction!: () => void;
    const extractionReleased = new Promise<void>((resolve) => {
      releaseExtraction = resolve;
    });
    context.extractor.beforeExtract.set(source.contentMarkdown, async () => {
      await extractionReleased;
    });

    await context.refresh.requestManualRefresh(
      context.org,
      source.id,
      context.actor,
    );
    await waitForCondition(
      async () =>
        context.extractor.calls.length === extractorBeforeCorrection + 1,
      'force 재색인이 extractor barrier에 도달하지 않았습니다.',
      { timeoutMs: 15_000 },
    );

    const cancelled = await corrections.cancel(
      scope,
      saved.corrections[0]?.id ?? '',
      context.actor,
    );
    expect(cancelled).toMatchObject({ editRevision: 2 });
    expect(cancelled?.corrections).toHaveLength(1);
    expect(context.extractor.calls).toHaveLength(extractorBeforeCorrection + 1);
    expect(context.embedder.calls).toHaveLength(embedderBeforeCorrection);

    releaseExtraction();
    await context.indexed(source.id, 2);
    context.extractor.beforeExtract.delete(source.contentMarkdown);

    const latest = await corrections.effectiveGraph(scope);
    expect(
      latest?.entities.find((entity) => entity.anchor.entityType === 'Person')
        ?.displayName,
    ).toBe('지윤');
    const active = await corrections.listActive(scope);
    expect(active).toMatchObject({ editRevision: 2, corrections: [] });

    expect(context.extractor.calls).toHaveLength(extractorBeforeCorrection + 1);
    expect(context.embedder.calls).toHaveLength(embedderBeforeCorrection + 1);
  });
});
