import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';
import type { McpScope } from '@/mcp/contracts/mcp-scope';
import { McpAgentDelegationDrizzlePersistenceModule } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { mcpAgentDelegation } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-delegation.schema';
import { mcpAgentOauthFlow } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-oauth-flow.schema';
import { McpAgentDelegationRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-delegation.repository';
import { McpAgentOauthFlowRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-oauth-flow.repository';

import { and, eq, inArray } from 'drizzle-orm';

const userA = 'mcp-delegation-integration-user-a';
const userB = 'mcp-delegation-integration-user-b';
const organizationId = 'mcp-delegation-integration-org';
const issuer = 'https://workos.example/api/auth';
const clientId = 'work-os-agent';
const resourceUrl = 'https://workos.example/mcp';
const wikiReadScopes: McpScope[] = ['wiki:read'];
const envelope = {
  tokensFormatVersion: 1,
  tokensAlgorithm: 'aes-256-gcm' as const,
  tokensKeyId: 'key-a',
  tokensNonce: 'AAAAAAAAAAAAAAAA',
  tokensCiphertext: 'YQ==',
  tokensAuthTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
};

describe('MCP Agent delegation Drizzle 저장소 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let delegations: McpAgentDelegationRepository;
  let flows: McpAgentOauthFlowRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        DatabaseModule,
        McpAgentDelegationDrizzlePersistenceModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    delegations = moduleRef.get(McpAgentDelegationRepository);
    flows = moduleRef.get(McpAgentOauthFlowRepository);
  });

  beforeEach(async () => {
    await cleanup();
    await database.insert(user).values([
      {
        id: userA,
        name: 'Delegation A',
        email: 'mcp-delegation-a@example.com',
        username: 'mcpdelegationa',
      },
      {
        id: userB,
        name: 'Delegation B',
        email: 'mcp-delegation-b@example.com',
        username: 'mcpdelegationb',
      },
    ]);
    await database.insert(organization).values({
      id: organizationId,
      name: 'Delegation Organization',
      slug: 'mcp-delegation-integration',
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await cleanup();
    await moduleRef.close();
  });

  it('active delegation upsert는 actor/issuer/client row 하나와 증가하는 revision을 유지한다', async () => {
    const created = await delegations.upsertActive(delegationInput());
    const updated = await delegations.upsertActive({
      ...delegationInput(),
      grantedScopes: ['wiki:read', 'wiki:write'],
      tokensCiphertext: 'Yg==',
    });

    expect(created.revision).toBe(0);
    expect(updated).toMatchObject({
      id: created.id,
      revision: 1,
      grantedScopes: ['wiki:read', 'wiki:write'],
      tokensCiphertext: 'Yg==',
    });
    await expect(
      database
        .select()
        .from(mcpAgentDelegation)
        .where(
          and(
            eq(mcpAgentDelegation.userId, userA),
            eq(mcpAgentDelegation.organizationId, organizationId),
          ),
        ),
    ).resolves.toHaveLength(1);
  });

  it('동시 refresh lease는 한 owner만 획득하고 CAS token update를 강제한다', async () => {
    const delegation = await delegations.upsertActive(delegationInput());
    const now = new Date();
    const [leaseA, leaseB] = await Promise.all([
      delegations.acquireRefreshLease(
        delegation.id,
        'lease-a',
        new Date(now.getTime() + 30_000),
        now,
      ),
      delegations.acquireRefreshLease(
        delegation.id,
        'lease-b',
        new Date(now.getTime() + 30_000),
        now,
      ),
    ]);
    const acquired = [leaseA, leaseB].filter((lease) => lease !== null);

    expect(acquired).toHaveLength(1);
    const winner = acquired[0]!;
    const winnerOwner = winner.refreshLeaseOwner!;
    await expect(
      delegations.updateTokensUnderLease(
        winner.id,
        winner.revision,
        winnerOwner === 'lease-a' ? 'lease-b' : 'lease-a',
        new Date(),
        tokenUpdate('Yw=='),
      ),
    ).resolves.toBeNull();
    await expect(
      delegations.updateTokensUnderLease(
        winner.id,
        winner.revision,
        winnerOwner,
        new Date(),
        tokenUpdate('Yw=='),
      ),
    ).resolves.toMatchObject({
      revision: winner.revision + 1,
      tokensCiphertext: 'Yw==',
      refreshLeaseOwner: null,
      refreshLeaseExpiresAt: null,
    });
  });

  it('expired refresh lease는 다른 owner가 인수하고 revoke 뒤에는 획득할 수 없다', async () => {
    const delegation = await delegations.upsertActive(delegationInput());
    const initialNow = new Date('2026-10-08T00:00:00.000Z');
    const initial = await delegations.acquireRefreshLease(
      delegation.id,
      'expired-owner',
      new Date('2026-10-08T00:00:01.000Z'),
      initialNow,
    );
    expect(initial).not.toBeNull();

    const replacement = await delegations.acquireRefreshLease(
      delegation.id,
      'replacement-owner',
      new Date('2026-10-08T00:01:00.000Z'),
      new Date('2026-10-08T00:00:02.000Z'),
    );
    expect(replacement?.refreshLeaseOwner).toBe('replacement-owner');
    await expect(
      delegations.revokeActive(userA, organizationId, issuer, clientId),
    ).resolves.toBe(true);
    await expect(
      delegations.acquireRefreshLease(
        delegation.id,
        'after-revoke',
        new Date('2026-10-08T00:02:00.000Z'),
        new Date('2026-10-08T00:01:00.000Z'),
      ),
    ).resolves.toBeNull();
    await expect(
      delegations.findActive(userA, organizationId, issuer, clientId),
    ).resolves.toBeNull();
  });

  it('OAuth verifier와 flow consume은 동시 요청에서 각각 한 번만 성공한다', async () => {
    const flow = await flows.create(flowInput());
    const now = new Date();
    const verifierInput = {
      verifierFormatVersion: 1,
      verifierAlgorithm: 'aes-256-gcm' as const,
      verifierKeyId: 'key-a',
      verifierNonce: 'AAAAAAAAAAAAAAAA',
      verifierCiphertext: 'YQ==',
      verifierAuthTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
    };

    const verifierResults = await Promise.all([
      flows.saveVerifierIfAbsent(
        flow.id,
        userA,
        organizationId,
        now,
        verifierInput,
      ),
      flows.saveVerifierIfAbsent(
        flow.id,
        userA,
        organizationId,
        now,
        verifierInput,
      ),
    ]);
    expect(verifierResults.filter((result) => result !== null)).toHaveLength(1);

    const consumeResults = await Promise.all([
      flows.consume(flow.id, userA, organizationId, new Date()),
      flows.consume(flow.id, userA, organizationId, new Date()),
    ]);
    expect(consumeResults.filter((result) => result !== null)).toHaveLength(1);
    await expect(
      flows.findActiveByStateHash(flow.stateHash, new Date()),
    ).resolves.toBeNull();
  });

  it('OAuth flow actor binding과 delete cascade가 다른 user 접근을 차단한다', async () => {
    const flow = await flows.create(flowInput());

    await expect(
      flows.findActiveById(flow.id, userB, organizationId, new Date()),
    ).resolves.toBeNull();
    await database.delete(user).where(eq(user.id, userA));
    await expect(
      database
        .select()
        .from(mcpAgentOauthFlow)
        .where(eq(mcpAgentOauthFlow.id, flow.id)),
    ).resolves.toHaveLength(0);
  });

  function delegationInput() {
    return {
      userId: userA,
      organizationId,
      issuer,
      resourceUrl,
      oauthClientIdentity: clientId,
      grantedScopes: [...wikiReadScopes],
      ...envelope,
      revision: 0,
      refreshLeaseOwner: null,
      refreshLeaseExpiresAt: null,
      revokedAt: null,
    };
  }

  function tokenUpdate(ciphertext: string) {
    return {
      grantedScopes: [...wikiReadScopes],
      ...envelope,
      tokensCiphertext: ciphertext,
    };
  }

  function flowInput() {
    return {
      userId: userA,
      organizationId,
      oauthClientIdentity: clientId,
      issuer: null,
      stateHash: 'a'.repeat(64),
      requestedScopes: [...wikiReadScopes],
      resourceUrl,
      redirectUrl: 'https://workos.example/mcp/agent-delegation/callback',
      returnTo: '/ai',
      completionUrl: 'https://dashboard.example/settings/mcp/consent',
      expiresAt: new Date(Date.now() + 60_000),
    };
  }

  async function cleanup(): Promise<void> {
    await database
      .delete(mcpAgentDelegation)
      .where(eq(mcpAgentDelegation.organizationId, organizationId));
    await database
      .delete(mcpAgentOauthFlow)
      .where(eq(mcpAgentOauthFlow.organizationId, organizationId));
    await database
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await database.delete(user).where(inArray(user.id, [userA, userB]));
  }
});
