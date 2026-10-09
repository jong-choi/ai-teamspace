import { randomUUID } from 'node:crypto';

import { semanticCorrection } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/semantic-correction.schema';
import { SemanticCorrectionInsertSchema } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/semantic-correction.zod';
import { SemanticCorrectionService } from '@/knowledge-graph/semantic-correction.service';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';

jest.setTimeout(60_000);

describeKnowledgeGraph('의미 보정의 조직 격리와 삭제 fail closed', () => {
  const context = createSemanticFlowContext();

  it('F7-18 다른 조직에는 보정을 적용하지 않고 삭제 원본의 보정은 보존하되 노출하지 않는다', async () => {
    const source = await context.createWiki(
      '삭제 보정 원본',
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
    const person = (await corrections.effectiveGraph(scope))?.entities.find(
      (entity) => entity.anchor.entityType === 'Person',
    );
    if (!person) throw new Error('보정할 entity가 없습니다.');
    await corrections.createLabelOverride(
      scope,
      person.key,
      '조직 A 전용',
      context.actor,
    );

    const otherOrganizationId = await context.createAdditionalOrganization();
    const other = await context.createWiki(
      '삭제 보정 원본',
      '지윤은 Neo4j를 사용한다.',
      otherOrganizationId,
    );
    const request = await context.refresh.requestManualRefresh(
      otherOrganizationId,
      other.id,
      context.actor,
    );
    expect(request.outcome).toBe('accepted');
    await context.indexed(other.id, 1, 40_000, otherOrganizationId);
    const otherGraph = await corrections.effectiveGraph({
      organizationId: otherOrganizationId,
      aggregateKind: 'wiki_document',
      aggregateId: other.id,
    });
    expect(
      otherGraph?.entities.some(
        (entity) => entity.displayName === '조직 A 전용',
      ),
    ).toBe(false);

    expect(await context.wiki.deleteDocument(context.org, source.id)).toBe(
      'deleted',
    );
    expect(await corrections.effectiveGraph(scope)).toBeNull();
    expect((await corrections.listActive(scope)).corrections).toHaveLength(1);
  });

  it('R7-21 동시 보정 revision은 직렬 증가하고 잘못된 JSON과 source-scoped FK를 거부한다', async () => {
    const source = await context.createWiki(
      '보정 영속 경합',
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
    const person = (await corrections.effectiveGraph(scope))?.entities.find(
      (entity) => entity.anchor.entityType === 'Person',
    );
    if (!person) throw new Error('보정할 entity가 없습니다.');
    const results = await Promise.all([
      corrections.createLabelOverride(
        scope,
        person.key,
        '동시 보정 A',
        context.actor,
      ),
      corrections.createLabelOverride(
        scope,
        person.key,
        '동시 보정 B',
        context.actor,
      ),
    ]);
    const revisions: number[] = [];
    for (const result of results) {
      if (result.outcome !== 'created')
        throw new Error('동시 보정이 저장되지 않았습니다.');
      revisions.push(result.editRevision);
    }
    expect(revisions.sort((a, b) => a - b)).toEqual([1, 2]);
    const active = await corrections.listActive(scope);
    expect(active.editRevision).toBe(2);
    expect(active.corrections).toHaveLength(2);
    const latest = active.corrections[1];
    if (!latest?.value || !('label' in latest.value))
      throw new Error('최신 표시명 보정이 없습니다.');
    expect(
      (await corrections.effectiveGraph(scope))?.entities.find(
        (entity) => entity.key === person.key,
      )?.displayName,
    ).toBe(latest.value.label);
    const row = active.corrections[0];
    if (!row) throw new Error('보정 row가 없습니다.');
    expect(
      SemanticCorrectionInsertSchema.safeParse({
        ...row,
        id: randomUUID(),
        anchor: {},
        createdRevision: 3,
      }).success,
    ).toBe(false);
    await expect(
      context.database.insert(semanticCorrection).values({
        ...row,
        id: randomUUID(),
        linkedCorrectionId: randomUUID(),
        createdRevision: 3,
      }),
    ).rejects.toThrow();
    expect((await corrections.listActive(scope)).editRevision).toBe(2);
  });
});
