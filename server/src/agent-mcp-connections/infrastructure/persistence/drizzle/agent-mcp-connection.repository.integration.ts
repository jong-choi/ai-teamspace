import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import { AgentMcpConnectionPersistenceModule } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection-persistence.module';
import { agentMcpConnection } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.schema';
import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';

import { inArray } from 'drizzle-orm';

const ownerUserId = 'agent-mcp-integration-owner';
const otherUserId = 'agent-mcp-integration-other';
const organizationId = 'agent-mcp-integration-org';
const otherOrganizationId = 'agent-mcp-integration-other-org';

describe('external MCP connection Drizzle 저장소 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let repository: AgentMcpConnectionRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [databaseConfig],
        }),
        DatabaseModule,
        AgentMcpConnectionPersistenceModule,
      ],
    }).compile();
    await moduleRef.init();

    database = moduleRef.get(DatabaseService).db;
    repository = moduleRef.get(AgentMcpConnectionRepository);
  });

  beforeEach(async () => {
    await cleanup();
    await database.insert(user).values([
      {
        id: ownerUserId,
        name: 'External MCP Owner',
        email: 'agent-mcp-owner@example.com',
        username: 'agentmcpowner',
      },
      {
        id: otherUserId,
        name: 'External MCP Other',
        email: 'agent-mcp-other@example.com',
        username: 'agentmcpother',
      },
    ]);
    await database.insert(organization).values([
      {
        id: organizationId,
        name: 'External MCP Organization',
        slug: 'agent-mcp-integration-org',
        createdAt: new Date(),
      },
      {
        id: otherOrganizationId,
        name: 'External MCP Other Organization',
        slug: 'agent-mcp-integration-other-org',
        createdAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await moduleRef.close();
  });

  test('owner와 organization이 모두 일치해야 connection을 읽거나 변경할 수 있다', async () => {
    const connection = await createConnection();

    await expect(
      repository.findOwned(otherUserId, organizationId, connection.id),
    ).resolves.toBeNull();
    await expect(
      repository.findOwned(ownerUserId, otherOrganizationId, connection.id),
    ).resolves.toBeNull();
    await expect(
      repository.listOwned(otherUserId, organizationId),
    ).resolves.toEqual([]);
    await expect(
      repository.listOwned(ownerUserId, otherOrganizationId),
    ).resolves.toEqual([]);

    await expect(
      repository.updateIfRevision(
        otherUserId,
        organizationId,
        connection.id,
        connection.revision,
        { displayName: 'cross-user' },
      ),
    ).resolves.toBeNull();
    await expect(
      repository.updateIfRevision(
        ownerUserId,
        otherOrganizationId,
        connection.id,
        connection.revision,
        { displayName: 'cross-org' },
      ),
    ).resolves.toBeNull();
    await expect(
      repository.recordHealth(
        otherUserId,
        organizationId,
        connection.id,
        new Date(),
        'connection_unavailable',
      ),
    ).resolves.toBeNull();
    await expect(
      repository.removeOwned(
        ownerUserId,
        otherOrganizationId,
        connection.id,
        connection.revision,
      ),
    ).resolves.toBe(false);

    await expect(
      repository.findOwned(ownerUserId, organizationId, connection.id),
    ).resolves.toMatchObject({
      id: connection.id,
      displayName: 'Integration MCP',
      revision: 0,
      lastTestedAt: null,
      lastErrorCategory: null,
    });
  });

  test('credential과 refresh lease는 다른 owner 또는 organization에서 접근할 수 없다', async () => {
    const connection = await createConnection({ authKind: 'oauth' });
    await repository.saveCredential({
      connectionId: connection.id,
      formatVersion: 1,
      algorithm: 'aes-256-gcm',
      keyId: 'integration-key',
      nonce: Buffer.alloc(12, 1).toString('base64'),
      ciphertext: Buffer.from('integration-ciphertext').toString('base64'),
      authTag: Buffer.alloc(16, 2).toString('base64'),
    });

    await expect(
      repository.findCredentialForOwnedConnection(
        otherUserId,
        organizationId,
        connection.id,
      ),
    ).resolves.toBeNull();
    await expect(
      repository.findCredentialForOwnedConnection(
        ownerUserId,
        otherOrganizationId,
        connection.id,
      ),
    ).resolves.toBeNull();

    await expect(
      repository.acquireCredentialRefreshLease(
        otherUserId,
        organizationId,
        connection.id,
        'cross-user-lease',
        new Date(),
        new Date(Date.now() + 30_000),
      ),
    ).resolves.toBe(false);
    await expect(
      repository.acquireCredentialRefreshLease(
        ownerUserId,
        otherOrganizationId,
        connection.id,
        'cross-org-lease',
        new Date(),
        new Date(Date.now() + 30_000),
      ),
    ).resolves.toBe(false);

    await expect(
      repository.acquireCredentialRefreshLease(
        ownerUserId,
        organizationId,
        connection.id,
        'owned-lease',
        new Date(),
        new Date(Date.now() + 30_000),
      ),
    ).resolves.toBe(true);
    await repository.releaseCredentialRefreshLease(
      otherUserId,
      organizationId,
      connection.id,
      'owned-lease',
    );
    await expect(
      repository.acquireCredentialRefreshLease(
        ownerUserId,
        organizationId,
        connection.id,
        'second-owned-lease',
        new Date(),
        new Date(Date.now() + 30_000),
      ),
    ).resolves.toBe(false);

    await repository.releaseCredentialRefreshLease(
      ownerUserId,
      organizationId,
      connection.id,
      'owned-lease',
    );
    await expect(
      repository.acquireCredentialRefreshLease(
        ownerUserId,
        organizationId,
        connection.id,
        'second-owned-lease',
        new Date(),
        new Date(Date.now() + 30_000),
      ),
    ).resolves.toBe(true);
  });

  test('tool policy CAS는 cross-scope mutation을 거부한다', async () => {
    const connection = await createConnection();

    await expect(
      repository.updateToolPolicyIfRevision(
        otherUserId,
        organizationId,
        connection.id,
        connection.revision,
        'selected',
        [
          {
            originalToolName: 'remote_tool',
            schemaFingerprint: 'a'.repeat(64),
            enabled: true,
          },
        ],
      ),
    ).resolves.toBeNull();
    await expect(
      repository.updateToolPolicyIfRevision(
        ownerUserId,
        otherOrganizationId,
        connection.id,
        connection.revision,
        'selected',
        [
          {
            originalToolName: 'remote_tool',
            schemaFingerprint: 'a'.repeat(64),
            enabled: true,
          },
        ],
      ),
    ).resolves.toBeNull();

    await expect(repository.listEnabledTools(connection.id)).resolves.toEqual(
      [],
    );

    await expect(
      repository.updateToolPolicyIfRevision(
        ownerUserId,
        organizationId,
        connection.id,
        connection.revision,
        'selected',
        [
          {
            originalToolName: 'remote_tool',
            schemaFingerprint: 'a'.repeat(64),
            enabled: true,
          },
        ],
      ),
    ).resolves.toMatchObject({ revision: 1, toolPolicyMode: 'selected' });
    await expect(repository.listEnabledTools(connection.id)).resolves.toEqual([
      expect.objectContaining({
        originalToolName: 'remote_tool',
        schemaFingerprint: 'a'.repeat(64),
        enabled: true,
      }),
    ]);
  });

  test('같은 revision의 동시 update는 정확히 하나만 성공한다', async () => {
    const connection = await createConnection();

    const results = await Promise.all([
      repository.updateIfRevision(
        ownerUserId,
        organizationId,
        connection.id,
        0,
        { displayName: 'race-a' },
      ),
      repository.updateIfRevision(
        ownerUserId,
        organizationId,
        connection.id,
        0,
        { displayName: 'race-b' },
      ),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    await expect(
      repository.findOwned(ownerUserId, organizationId, connection.id),
    ).resolves.toMatchObject({ revision: 1 });
  });

  test('security boundary와 tool policy의 같은 revision 경쟁은 원자적인 한 상태만 남긴다', async () => {
    const connection = await createConnection({ authKind: 'oauth' });
    await repository.saveCredential({
      connectionId: connection.id,
      formatVersion: 1,
      algorithm: 'aes-256-gcm',
      keyId: 'integration-key',
      nonce: Buffer.alloc(12, 1).toString('base64'),
      ciphertext: Buffer.from('integration-ciphertext').toString('base64'),
      authTag: Buffer.alloc(16, 2).toString('base64'),
    });
    const seeded = await repository.updateToolPolicyIfRevision(
      ownerUserId,
      organizationId,
      connection.id,
      0,
      'selected',
      [
        {
          originalToolName: 'old_tool',
          schemaFingerprint: 'a'.repeat(64),
          enabled: true,
        },
      ],
    );
    expect(seeded).toMatchObject({ revision: 1 });

    const [boundaryResult, policyResult] = await Promise.all([
      repository.updateSecurityBoundaryIfRevision(
        ownerUserId,
        organizationId,
        connection.id,
        1,
        {
          endpoint: 'https://new-mcp.example.com/mcp',
          enabled: false,
        },
      ),
      repository.updateToolPolicyIfRevision(
        ownerUserId,
        organizationId,
        connection.id,
        1,
        'selected',
        [
          {
            originalToolName: 'new_tool',
            schemaFingerprint: 'b'.repeat(64),
            enabled: true,
          },
        ],
      ),
    ]);

    expect([boundaryResult, policyResult].filter(Boolean)).toHaveLength(1);
    const finalConnection = await repository.findOwned(
      ownerUserId,
      organizationId,
      connection.id,
    );
    const finalCredential = await repository.findCredentialForOwnedConnection(
      ownerUserId,
      organizationId,
      connection.id,
    );
    const finalTools = await repository.listEnabledTools(connection.id);

    expect(finalConnection).toMatchObject({ revision: 2 });
    if (boundaryResult) {
      expect(policyResult).toBeNull();
      expect(finalConnection).toMatchObject({
        endpoint: 'https://new-mcp.example.com/mcp',
        enabled: false,
      });
      expect(finalCredential).toBeNull();
      expect(finalTools).toEqual([]);
    } else {
      expect(policyResult).not.toBeNull();
      expect(finalConnection).toMatchObject({
        endpoint: connection.endpoint,
      });
      expect(finalCredential).not.toBeNull();
      expect(finalTools).toEqual([
        expect.objectContaining({
          originalToolName: 'new_tool',
          schemaFingerprint: 'b'.repeat(64),
        }),
      ]);
    }
  });

  async function createConnection(
    overrides: Partial<{
      authKind: 'none' | 'bearer' | 'oauth';
      enabled: boolean;
    }> = {},
  ) {
    return repository.createPendingConnection({
      ownerUserId,
      organizationId,
      displayName: 'Integration MCP',
      namespace: 'extintegration1',
      endpoint: 'https://mcp.example.com/mcp',
      transport: 'http',
      authKind: overrides.authKind ?? 'none',
      enabled: overrides.enabled ?? false,
      toolPolicyMode: 'selected',
    });
  }

  async function cleanup() {
    await database
      .delete(agentMcpConnection)
      .where(
        inArray(agentMcpConnection.organizationId, [
          organizationId,
          otherOrganizationId,
        ]),
      );
    await database
      .delete(organization)
      .where(inArray(organization.id, [organizationId, otherOrganizationId]));
    await database
      .delete(user)
      .where(inArray(user.id, [ownerUserId, otherUserId]));
  }
});
