import { SemanticCorrectionService } from '@/knowledge-graph/semantic-correction.service';
import {
  createSemanticFlowContext,
  describeSemanticFlow,
} from '@/knowledge-graph/testing/semantic-flow.context';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

jest.setTimeout(90_000);

describeSemanticFlow('실제 PG·Jobs·Neo4j 의미 보정과 최신 overlay', () => {
  const context = createSemanticFlowContext();

  it('F7-18 label과 predicate 보정은 재색인 뒤 유지되고 짝 취소는 한 revision으로 원본을 복원한다', async () => {
    const source = await context.createWiki(
      '보정 원본',
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
    const relation = initial?.relations[0];
    if (!person || !relation)
      throw new Error('보정할 실제 의미 graph가 없습니다.');

    const label = await corrections.createLabelOverride(
      scope,
      person.key,
      '지윤 수정',
      context.actor,
    );
    expect(label).toMatchObject({ outcome: 'created', editRevision: 1 });
    const predicate = await corrections.correctPredicate(
      scope,
      relation.key,
      'RELATED_TO',
      context.actor,
    );
    expect(predicate).toMatchObject({ outcome: 'created', editRevision: 2 });
    if (predicate.outcome !== 'created')
      throw new Error('관계 보정이 저장되지 않았습니다.');
    expect(predicate.corrections).toHaveLength(2);
    expect(predicate.corrections[0]?.linkedCorrectionId).toBe(
      predicate.corrections[1]?.id,
    );
    expect(predicate.corrections[1]?.linkedCorrectionId).toBe(
      predicate.corrections[0]?.id,
    );

    const edited = await corrections.effectiveGraph(scope);
    expect(
      edited?.entities.find((entity) => entity.key === person.key),
    ).toMatchObject({ localId: '지윤', displayName: '지윤 수정' });
    expect(edited?.relations).toHaveLength(1);
    expect(edited?.relations[0]).toMatchObject({
      anchor: { predicate: 'RELATED_TO' },
      factClass: 'user_curated',
    });

    await context.refresh.requestManualRefresh(
      context.org,
      source.id,
      context.actor,
    );
    await context.indexed(source.id, 2);
    await waitForCondition(
      async () =>
        (await corrections.listActive(scope)).corrections.every(
          (correction) => correction.lastMatchState === 'matched',
        ),
      '새 generation의 보정 매칭 보고가 완료되지 않았습니다.',
    );
    const regenerated = await corrections.effectiveGraph(scope);
    expect(
      regenerated?.entities.some(
        (entity) => entity.displayName === '지윤 수정',
      ),
    ).toBe(true);
    expect(regenerated?.relations[0]).toMatchObject({
      anchor: { predicate: 'RELATED_TO' },
      factClass: 'user_curated',
    });

    const cancelledPair = await corrections.cancel(
      scope,
      predicate.corrections[0]?.id ?? '',
      context.actor,
    );
    expect(cancelledPair).toMatchObject({ editRevision: 3 });
    expect(cancelledPair?.corrections).toHaveLength(2);
    const restored = await corrections.effectiveGraph(scope);
    expect(restored?.relations).toHaveLength(1);
    expect(restored?.relations[0]).toMatchObject({
      anchor: { predicate: 'USES' },
      factClass: 'extracted',
    });

    if (label.outcome !== 'created')
      throw new Error('표시명 보정이 저장되지 않았습니다.');
    const cancelledLabel = await corrections.cancel(
      scope,
      label.corrections[0]?.id ?? '',
      context.actor,
    );
    expect(cancelledLabel).toMatchObject({ editRevision: 4 });
    expect(
      (await corrections.effectiveGraph(scope))?.entities.some(
        (entity) => entity.displayName === '지윤',
      ),
    ).toBe(true);
  });

  it('F7-18 evidence가 바뀐 보정은 pending review로 남고 이름만 같은 새 세대에 적용하지 않는다', async () => {
    const source = await context.createWiki(
      'anchor 원본',
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
    if (!person) throw new Error('보정할 entity가 없습니다.');
    const saved = await corrections.createLabelOverride(
      scope,
      person.key,
      '잘못 적용되면 안 됨',
      context.actor,
    );
    expect(saved.outcome).toBe('created');

    await context.replaceWikiBody(
      source.id,
      '이름이 직접 등장하지 않는 새 본문',
    );
    await context.refresh.requestManualRefresh(
      context.org,
      source.id,
      context.actor,
    );
    await context.indexed(source.id, 2);
    await waitForCondition(
      async () =>
        (await corrections.listActive(scope)).corrections[0]?.lastMatchState ===
        'pending_review',
      'anchor 불일치 보정이 pending review로 보고되지 않았습니다.',
    );
    const current = await corrections.effectiveGraph(scope);
    expect(
      current?.entities.some(
        (entity) => entity.displayName === '잘못 적용되면 안 됨',
      ),
    ).toBe(false);
    expect((await corrections.listActive(scope)).editRevision).toBe(1);
  });
});
