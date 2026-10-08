import { apikey } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import type { McpScope } from '@/mcp/contracts/mcp-scope';
import { mcpAccessKeyAllocation } from '@/mcp-access-keys/infrastructure/persistence/drizzle/schema/mcp-access-key-allocation.schema';
import { McpAccessKeyCoordinationRepository } from '@/mcp-access-keys/infrastructure/persistence/mcp-access-key-coordination.repository';
import { McpAccessKeyAuthenticator } from '@/mcp-access-keys/mcp-access-key-authenticator.provider';
import { McpAccessKeyReconciliationService } from '@/mcp-access-keys/mcp-access-key-reconciliation.service';

import {
  type McpActor,
  McpIntegrationApp,
} from '@test/support/mcp-integration.fixture';
import { and, eq } from 'drizzle-orm';

const WIKI_SCOPES: readonly McpScope[] = ['wiki:read', 'wiki:write'];
const DAY_MS = 24 * 60 * 60 * 1_000;

describe('Personal MCP Access Key lifecycle 통합', () => {
  let target: McpIntegrationApp;
  let authenticator: McpAccessKeyAuthenticator;

  beforeAll(async () => {
    target = await McpIntegrationApp.start();
    authenticator = target.app.get(McpAccessKeyAuthenticator);
  });

  afterEach(async () => {
    await target.cleanupActors();
  });

  afterAll(async () => {
    await target.close();
  });

  it('동시 발급은 사용자별 활성 key 상한까지만 성공하고 실패한 요청은 key를 남기지 않는다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const { maxActivePerUser } = target.mcpConfig.accessKey;
    // fixture가 이미 key 하나를 발급했으므로 남은 slot보다 3개 더 요청한다.
    const remainingSlots = maxActivePerUser - 1;

    const responses = await Promise.all(
      Array.from({ length: remainingSlots + 3 }, (_, index) =>
        createKey(actor, { idempotencyKey: `quota-${index}` }),
      ),
    );

    const created = responses.filter((response) => response.status === 201);
    const rejected = responses.filter((response) => response.status !== 201);
    expect(created).toHaveLength(remainingSlots);
    expect(rejected.map((response) => response.body.errorCode)).toEqual(
      Array.from({ length: 3 }, () => 'MCP_ACCESS_KEY_QUOTA_EXCEEDED'),
    );
    const storedKeys = await target.database
      .select({ id: apikey.id })
      .from(apikey)
      .where(eq(apikey.referenceId, actor.userId));
    expect(storedKeys).toHaveLength(maxActivePerUser);
  });

  it('같은 idempotency key의 동시 요청은 key 하나로 수렴하고 secret은 한 번만 반환한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });

    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        createKey(actor, { idempotencyKey: 'same-request' }),
      ),
    );
    const differentBody = await createKey(actor, {
      idempotencyKey: 'same-request',
      name: 'different-body',
    });
    const otherActor = await target.createActor({ scopes: WIKI_SCOPES });
    const otherUser = await createKey(otherActor, {
      idempotencyKey: 'same-request',
    });

    const withSecret = responses.filter((response) => response.body.secret);
    expect(withSecret).toHaveLength(1);
    expect(withSecret[0]?.status).toBe(201);
    for (const response of responses.filter((item) => !item.body.secret)) {
      expect(response.status).toBe(409);
    }
    expect(differentBody.status).toBe(409);
    expect(differentBody.body.errorCode).toBe(
      'MCP_ACCESS_KEY_IDEMPOTENCY_CONFLICT',
    );
    expect(otherUser.status).toBe(201);
    const keys = await target.database
      .select({ id: apikey.id })
      .from(apikey)
      .where(
        and(
          eq(apikey.referenceId, actor.userId),
          eq(apikey.name, 'idempotent-key'),
        ),
      );
    expect(keys).toHaveLength(1);
  });

  it('rotate는 만료 시각을 유지하고 old secret을 즉시 거부하며 new secret만 인증한다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const before = await actor.agent
      .get(`/mcp/access-keys/${actor.keyId}`)
      .expect(200);

    const rotated = await actor.agent
      .post(`/mcp/access-keys/${actor.keyId}/rotate`)
      .set('Idempotency-Key', 'rotate-once')
      .expect(201);

    // Better Auth는 초 단위 상대 만료만 받으므로 1초 안에서 같고, 원래 만료보다 늦어지지 않아야 한다.
    const rotatedExpiresAt = Date.parse(rotated.body.key.expiresAt);
    const originalExpiresAt = Date.parse(before.body.expiresAt);
    expect(rotatedExpiresAt).toBeLessThanOrEqual(originalExpiresAt);
    expect(rotatedExpiresAt).toBeGreaterThan(originalExpiresAt - 1_000);
    expect(rotated.body.secret).not.toBe(actor.secret);
    await expect(authenticator.authenticate(actor.secret)).rejects.toThrow();
    await expect(
      authenticator.authenticate(rotated.body.secret),
    ).resolves.toMatchObject({ userId: actor.userId });
  });

  it('남은 수명이 하루 미만인 key도 rotate할 수 있고 만료 시각을 늘리지 않는다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1_000);
    // 만료가 가까운 key를 흉내 내도록 Better Auth key의 만료 시각을 앞당긴다.
    await target.database
      .update(apikey)
      .set({ expiresAt })
      .where(eq(apikey.id, actor.keyId));

    const rotated = await actor.agent
      .post(`/mcp/access-keys/${actor.keyId}/rotate`)
      .set('Idempotency-Key', 'rotate-near-expiry');

    expect(rotated.status).toBe(201);
    const rotatedExpiresAt = Date.parse(rotated.body.key.expiresAt);
    expect(rotatedExpiresAt).toBeLessThanOrEqual(expiresAt.getTime());
    expect(rotatedExpiresAt).toBeGreaterThan(expiresAt.getTime() - 2_000);
  });

  it('disable은 인증을 막고 slot을 비우며, 다시 enable할 때 quota를 넘으면 활성화하지 않는다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const { maxActivePerUser } = target.mcpConfig.accessKey;

    await actor.agent
      .patch(`/mcp/access-keys/${actor.keyId}`)
      .send({ enabled: false })
      .expect(200);
    await expect(authenticator.authenticate(actor.secret)).rejects.toThrow();

    // 비운 slot을 포함해 상한까지 새 key로 채운다.
    for (let index = 0; index < maxActivePerUser; index += 1) {
      expect(
        (await createKey(actor, { idempotencyKey: `fill-${index}` })).status,
      ).toBe(201);
    }
    const enable = await actor.agent
      .patch(`/mcp/access-keys/${actor.keyId}`)
      .send({ enabled: true });

    expect(enable.status).toBe(409);
    expect(enable.body.errorCode).toBe('MCP_ACCESS_KEY_QUOTA_EXCEEDED');
    await expect(authenticator.authenticate(actor.secret)).rejects.toThrow();
  });

  it('reconciliation은 stale reservation을 정리하고 allocation 없는 active key를 복구하며 두 번째 실행은 아무것도 바꾸지 않는다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const coordination = target.app.get(McpAccessKeyCoordinationRepository);
    const reconciliation = target.app.get(McpAccessKeyReconciliationService);
    const stale = await coordination.reserveAllocation(
      actor.userId,
      target.mcpConfig.accessKey.maxActivePerUser,
    );
    if (!stale) throw new Error('test reservation을 만들지 못했습니다.');
    // crash로 남은 reservation을 흉내 내도록 갱신 시각을 stale 기준보다 과거로 옮긴다.
    await target.database
      .update(mcpAccessKeyAllocation)
      .set({ updatedAt: new Date(Date.now() - DAY_MS) })
      .where(eq(mcpAccessKeyAllocation.id, stale.id));
    // allocation row 유실을 흉내 내도록 actor key의 allocation을 지운다.
    await target.database
      .delete(mcpAccessKeyAllocation)
      .where(eq(mcpAccessKeyAllocation.betterAuthKeyId, actor.keyId));

    const first = await reconciliation.reconcileUser(actor.userId);
    const second = await reconciliation.reconcileUser(actor.userId);

    expect(first).toMatchObject({
      releasedAllocations: 1,
      recoveredAllocations: 1,
      revokedOrphanKeys: 0,
    });
    expect(second).toEqual({
      releasedAllocations: 0,
      recoveredAllocations: 0,
      revokedOrphanKeys: 0,
      completedOperations: 0,
      failedOperations: 0,
    });
    await expect(
      coordination.findAllocationByKeyId(actor.userId, actor.keyId),
    ).resolves.toMatchObject({ state: 'active' });
  });

  it('expiresInDays는 일 단위 만료 시각으로 저장된다', async () => {
    const actor = await target.createActor({ scopes: WIKI_SCOPES });
    const requestedAt = Date.now();

    const created = await createKey(actor, {
      idempotencyKey: 'expires-in-days',
      expiresInDays: 3,
    });

    expect(created.status).toBe(201);
    const expiresAt = Date.parse(created.body.key.expiresAt);
    expect(expiresAt - requestedAt).toBeGreaterThanOrEqual(3 * DAY_MS - 60_000);
    expect(expiresAt - requestedAt).toBeLessThanOrEqual(3 * DAY_MS + 60_000);
  });

  function createKey(
    actor: McpActor,
    input: { idempotencyKey: string; name?: string; expiresInDays?: number },
  ) {
    return actor.agent
      .post('/mcp/access-keys')
      .set('Idempotency-Key', input.idempotencyKey)
      .send({
        name: input.name ?? 'idempotent-key',
        scopes: WIKI_SCOPES,
        organizationGrant: {
          mode: 'selected',
          organizationIds: [actor.organizationId],
        },
        expiresInDays: input.expiresInDays ?? 1,
      });
  }
});
