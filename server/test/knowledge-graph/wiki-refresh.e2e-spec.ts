import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { Outbox } from '@nestjs/outbox';

import { member } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { requestQuota } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/request-quota.schema';
import { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { outboxSemanticSourceState } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxSemanticManualRequest } from '@/outbox/outbox-semantic-manual-request';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';

import { jest } from '@jest/globals';
import {
  createRunPrefix,
  KnowledgeGraphHttpFixture,
  refreshPath,
  statusPath,
} from '@test/knowledge-graph/support/knowledge-graph-http.fixture';
import { and, eq } from 'drizzle-orm';

describeKnowledgeGraph('위키 지식 그래프 수동 갱신·상태 HTTP E2E', () => {
  const prefix = createRunPrefix('refresh-http');
  let fx: KnowledgeGraphHttpFixture;
  let policyFixture: KnowledgeGraphHttpFixture;

  beforeAll(async () => {
    fx = await KnowledgeGraphHttpFixture.boot(prefix);
    policyFixture = await KnowledgeGraphHttpFixture.boot(
      `${prefix}-policy`,
      (builder) =>
        builder.overrideProvider(GraphSourceAccessProvider).useValue({
          assertReadable: async () => undefined,
          isAdministrator: async () => false,
          lockAdministrator: async () => false,
          lockWikiWriter: async () => 'forbidden' as const,
        }),
    );
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await policyFixture?.close();
    await fx?.close();
  });

  async function setup(key: string, target = fx) {
    const owner = await target.createUser(`${key}-owner`);
    const organizationId = await target.createOrganization(owner, key);
    const doc = await target.createWikiDocument(owner, organizationId, {
      title: `${key} 문서`,
      contentMarkdown: '본문',
    });
    return { owner, organizationId, documentId: doc.id };
  }

  const scopeOf = (organizationId: string, aggregateId: string) => ({
    organizationId,
    aggregateKind: 'wiki_document' as const,
    aggregateId,
  });

  async function stateRows(organizationId: string) {
    return fx.database
      .select()
      .from(outboxSemanticSourceState)
      .where(eq(outboxSemanticSourceState.organizationId, organizationId));
  }

  it('H8-01 비로그인 401, 다른 조직 사용자 404, 잘못된 본문·ID 400, 신뢰 안 되는 출처 403이며 상태는 변하지 않는다', async () => {
    const { organizationId, documentId } = await setup('h801');
    const outsider = await fx.createUser('h801-outsider');
    await fx.createOrganization(outsider, 'h801-other');
    const owner = await fx.createUser('h801-second');
    await fx.addMember(organizationId, owner.userId, 'member');

    expect(
      (
        await fx
          .anonymous()
          .post(refreshPath(organizationId, documentId))
          .send({})
      ).status,
    ).toBe(401);
    expect(
      (await fx.anonymous().get(statusPath(organizationId, documentId))).status,
    ).toBe(401);
    const hidden = await outsider.agent
      .post(refreshPath(organizationId, documentId))
      .send({});
    expect(hidden.status).toBe(404);
    expect(
      (await outsider.agent.get(statusPath(organizationId, documentId))).status,
    ).toBe(404);
    for (const body of [{ extra: 1 }, { organizationId }, { content: '본문' }])
      expect(
        (
          await owner.agent
            .post(refreshPath(organizationId, documentId))
            .send(body)
        ).status,
      ).toBe(400);
    expect(
      (
        await owner.agent
          .post(refreshPath(organizationId, 'not-a-uuid'))
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await owner.agent
          .post(refreshPath(organizationId, documentId))
          .set('Origin', 'https://evil.example')
          .send({})
      ).status,
    ).toBe(403);
    expect(await stateRows(organizationId)).toHaveLength(0);
  });

  it('H8-02 실제 회원은 202를 받고 쓰기 불가 policy fixture는 403이며 요청·Outbox가 남지 않는다', async () => {
    const { owner, organizationId, documentId } = await setup('h802');
    const response = await owner.agent
      .post(refreshPath(organizationId, documentId))
      .send({});
    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      requestId: expect.any(String),
      status: 'accepted',
      sourceUpdatedAt: expect.any(String),
      acceptedAt: expect.any(String),
    });

    const denied = await setup('h802-policy', policyFixture);
    const added = jest.spyOn(
      policyFixture.app.get(Outbox, { strict: false }),
      'add',
    );
    const forbidden = await denied.owner.agent
      .post(refreshPath(denied.organizationId, denied.documentId))
      .send({});
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toMatchObject({ status: 403 });
    expect(added).not.toHaveBeenCalled();
    expect(
      await policyFixture.database
        .select()
        .from(outboxSemanticSourceState)
        .where(
          eq(outboxSemanticSourceState.organizationId, denied.organizationId),
        ),
    ).toHaveLength(0);
  });

  it('H8-04 접수 PG 쓰기가 실패하면 503 ProblemDetails이고 요청 상태가 남지 않는다', async () => {
    const { owner, organizationId, documentId } = await setup('h804');
    jest
      .spyOn(fx.app.get(Outbox, { strict: false }), 'add')
      .mockRejectedValueOnce(new Error('postgres connection lost'));

    const response = await owner.agent
      .post(refreshPath(organizationId, documentId))
      .send({});

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 503,
      errorCode: 'KG_REFRESH_ACCEPTANCE_UNAVAILABLE',
    });
    expect(JSON.stringify(response.body)).not.toContain('postgres connection');
    expect(await stateRows(organizationId)).toHaveLength(0);
  });

  it('H8-05 여러 사용자의 연타는 한 requestId로 합쳐지고 한도 초과는 Retry-After와 함께 429다', async () => {
    const { owner, organizationId, documentId } = await setup('h805');
    const second = await fx.createUser('h805-second');
    await fx.addMember(organizationId, second.userId, 'member');

    const burst = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        (index % 2 === 0 ? owner : second).agent
          .post(refreshPath(organizationId, documentId))
          .send({}),
      ),
    );
    expect(burst.every(({ status }) => status === 202)).toBe(true);
    expect(new Set(burst.map(({ body }) => body.requestId)).size).toBe(1);

    const quotaOwner = await setup('h805-quota');
    const more = [
      await fx.createWikiDocument(quotaOwner.owner, quotaOwner.organizationId, {
        title: '둘',
      }),
      await fx.createWikiDocument(quotaOwner.owner, quotaOwner.organizationId, {
        title: '셋',
      }),
    ];
    const actorLimit = fx.app
      .get(ConfigService)
      .getOrThrow<number>('knowledgeGraph.quota.refreshActorPerHour');
    const windowStartAt = new Date(
      Math.floor(Date.now() / 3_600_000) * 3_600_000,
    );
    await fx.database.insert(requestQuota).values({
      organizationId: quotaOwner.organizationId,
      subjectKind: 'actor',
      subjectId: quotaOwner.owner.userId,
      action: 'wiki_refresh',
      windowStartAt,
      count: actorLimit - 2,
    });
    const accepted = [quotaOwner.documentId, more[0]!.id].map((id) =>
      quotaOwner.owner.agent
        .post(refreshPath(quotaOwner.organizationId, id))
        .send({}),
    );
    expect((await Promise.all(accepted)).map(({ status }) => status)).toEqual([
      202, 202,
    ]);
    const limited = await quotaOwner.owner.agent
      .post(refreshPath(quotaOwner.organizationId, more[1]!.id))
      .send({});
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.body).toMatchObject({ errorCode: 'KG_RATE_LIMITED' });
    const repeated = await quotaOwner.owner.agent
      .post(refreshPath(quotaOwner.organizationId, quotaOwner.documentId))
      .send({});
    expect(repeated.status).toBe(202);
    expect(
      await fx.database
        .select({ count: requestQuota.count })
        .from(requestQuota)
        .where(
          and(
            eq(requestQuota.organizationId, quotaOwner.organizationId),
            eq(requestQuota.subjectKind, 'actor'),
          ),
        ),
    ).toEqual([{ count: actorLimit }]);
  });

  it('H8-06 status는 waiting에서 accepted·queued·running·up_to_date·stale·failed로 전이하고 latestRequest를 유지한다', async () => {
    const { owner, organizationId, documentId } = await setup('h806');
    const scope = scopeOf(organizationId, documentId);
    const states = fx.app.get(OutboxSemanticSourceState, { strict: false });
    const manual = fx.app.get(OutboxSemanticManualRequest, { strict: false });
    const read = async () =>
      (await owner.agent.get(statusPath(organizationId, documentId))).body;

    expect(await read()).toMatchObject({
      status: 'waiting',
      latestRequest: null,
    });
    await states.observeCommitted(scope, 1);
    const waiting = await read();
    expect(waiting).toMatchObject({ status: 'waiting' });
    expect(Date.parse(waiting.autoEligibleAt)).toBeGreaterThan(Date.now());

    const accepted = await owner.agent
      .post(refreshPath(organizationId, documentId))
      .send({});
    expect(await read()).toMatchObject({
      status: 'accepted',
      requestId: accepted.body.requestId,
      latestRequest: { requestId: accepted.body.requestId, satisfied: false },
    });
    await manual.markDelivered(scope, 1);
    expect(await read()).toMatchObject({ status: 'queued' });
    const lease = await states.acquireLease(scope, semanticPipelineFingerprint);
    if (typeof lease === 'string') throw new Error('lease 획득 실패');
    expect(await read()).toMatchObject({ status: 'running' });
    await states.activate(scope, lease, {
      activeGenerationId: randomUUID(),
      indexedSignature: 'a'.repeat(64),
      indexedFingerprint: semanticPipelineFingerprint,
      indexedSourceUpdatedAt: new Date(),
    });
    expect(await read()).toMatchObject({
      status: 'up_to_date',
      requestId: null,
      latestRequest: { requestId: accepted.body.requestId, satisfied: true },
      errorCode: null,
    });

    const renamed = await owner.agent
      .patch(`/organizations/${organizationId}/wiki/documents/${documentId}`)
      .send({ title: '바뀐 제목' });
    expect(renamed.status).toBe(200);
    expect(await read()).toMatchObject({ status: 'waiting' });
    const [version] = await fx.database
      .select({ desiredSeq: outboxAggregateVersion.desiredSeq })
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.aggregateId, documentId));
    await states.observeCommitted(scope, version!.desiredSeq);
    await fx.database
      .update(outboxSemanticSourceState)
      .set({ observedAt: new Date(Date.now() - 24 * 3600 * 1000) })
      .where(eq(outboxSemanticSourceState.aggregateId, documentId));
    await fx.database
      .update(wikiDocument)
      .set({ updatedAt: new Date(Date.now() - 24 * 3600 * 1000) })
      .where(eq(wikiDocument.id, documentId));
    expect(await read()).toMatchObject({ status: 'stale' });

    const failedDoc = await fx.createWikiDocument(owner, organizationId, {
      title: '실패 문서',
    });
    const failedScope = scopeOf(organizationId, failedDoc.id);
    await owner.agent.post(refreshPath(organizationId, failedDoc.id)).send({});
    const failedLease = await states.acquireLease(
      failedScope,
      semanticPipelineFingerprint,
    );
    if (typeof failedLease === 'string') throw new Error('lease 획득 실패');
    await states.release(failedScope, failedLease, {
      runStatus: 'failed',
      lastErrorCode: 'PROVIDER_UNAUTHORIZED',
    });
    expect(
      (await owner.agent.get(statusPath(organizationId, failedDoc.id))).body,
    ).toMatchObject({ status: 'failed', errorCode: 'PROVIDER_UNAUTHORIZED' });
  });

  it('H8-07 status GET은 쓰기 0이고 미추적 문서는 not_indexed, 삭제·탈퇴 뒤에는 404다', async () => {
    const { owner, organizationId, documentId } = await setup('h807');
    await fx.database
      .delete(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.aggregateId, documentId));

    const status = await owner.agent.get(
      statusPath(organizationId, documentId),
    );

    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      status: 'not_indexed',
      latestRequest: null,
    });
    expect(
      await fx.database
        .select()
        .from(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.aggregateId, documentId)),
    ).toHaveLength(0);
    expect(await stateRows(organizationId)).toHaveLength(0);

    const removed = await fx.createUser('h807-removed');
    await fx.addMember(organizationId, removed.userId, 'member');
    expect(
      (await removed.agent.get(statusPath(organizationId, documentId))).status,
    ).toBe(200);
    await fx.database
      .delete(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, removed.userId),
        ),
      );
    expect(
      (await removed.agent.get(statusPath(organizationId, documentId))).status,
    ).toBe(404);
    await fx.database
      .delete(wikiDocument)
      .where(eq(wikiDocument.id, documentId));
    expect(
      (await owner.agent.get(statusPath(organizationId, documentId))).status,
    ).toBe(404);
  });
});
