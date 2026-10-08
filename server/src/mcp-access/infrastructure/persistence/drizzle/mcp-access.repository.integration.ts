import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';
import { McpAccessDrizzlePersistenceModule } from '@/mcp-access/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { mcpOrganizationPolicy } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-organization-policy.schema';
import { mcpUserPolicy } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-user-policy.schema';
import { McpAccessRepository } from '@/mcp-access/infrastructure/persistence/mcp-access.repository';

import { and, eq, inArray } from 'drizzle-orm';

const organizationA = 'mcp-access-integration-org-a';
const organizationB = 'mcp-access-integration-org-b';
const userA = 'mcp-access-integration-user-a';
const userB = 'mcp-access-integration-user-b';

describe('MCP access Drizzle 저장소 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let repository: McpAccessRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        DatabaseModule,
        McpAccessDrizzlePersistenceModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    repository = moduleRef.get(McpAccessRepository);
  });

  beforeEach(async () => {
    await cleanup();
    await database.insert(user).values([
      {
        id: userA,
        name: 'MCP Access A',
        email: 'mcp-access-a@example.com',
        username: 'mcpaccessa',
      },
      {
        id: userB,
        name: 'MCP Access B',
        email: 'mcp-access-b@example.com',
        username: 'mcpaccessb',
      },
    ]);
    await database.insert(organization).values([
      {
        id: organizationA,
        name: 'MCP Access A',
        slug: 'mcp-access-integration-a',
        createdAt: new Date(),
      },
      {
        id: organizationB,
        name: 'MCP Access B',
        slug: 'mcp-access-integration-b',
        createdAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await moduleRef.close();
  });

  it('동시 policy ensure는 하나의 row와 단 하나의 created 결과로 수렴한다', async () => {
    const organizationResults = await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.ensureOrganizationPolicy({
          organizationId: organizationA,
          allowedScopes: ['wiki:read', 'wiki:write'],
          updatedByUserId: userA,
        }),
      ),
    );
    const userResults = await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.ensureUserPolicy({
          organizationId: organizationA,
          userId: userA,
          requestedScopes: ['wiki:read'],
        }),
      ),
    );

    expect(organizationResults.filter((result) => result.created)).toHaveLength(
      1,
    );
    expect(userResults.filter((result) => result.created)).toHaveLength(1);
    await expect(
      database
        .select()
        .from(mcpOrganizationPolicy)
        .where(eq(mcpOrganizationPolicy.organizationId, organizationA)),
    ).resolves.toHaveLength(1);
    await expect(
      database
        .select()
        .from(mcpUserPolicy)
        .where(
          and(
            eq(mcpUserPolicy.organizationId, organizationA),
            eq(mcpUserPolicy.userId, userA),
          ),
        ),
    ).resolves.toHaveLength(1);
  });

  it('같은 user revision의 동시 변경은 하나만 성공한다', async () => {
    await repository.ensureUserPolicy({
      organizationId: organizationA,
      userId: userA,
      requestedScopes: ['wiki:read'],
    });

    const results = await Promise.all([
      repository.updateUserPolicyIfRevision({
        organizationId: organizationA,
        userId: userA,
        requestedScopes: ['wiki:read', 'wiki:write'],
        expectedRevision: 0,
      }),
      repository.updateUserPolicyIfRevision({
        organizationId: organizationA,
        userId: userA,
        requestedScopes: ['projects:read'],
        expectedRevision: 0,
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'revision_conflict',
      'updated',
    ]);
    const stored = await repository.findUserPolicy(organizationA, userA);
    expect(stored?.revision).toBe(1);
    expect([['wiki:read', 'wiki:write'], ['projects:read']]).toContainEqual(
      stored?.requestedScopes,
    );
  });

  it('organization scope 축소와 모든 user prune를 한 transaction 결과로 반영한다', async () => {
    await repository.ensureOrganizationPolicy({
      organizationId: organizationA,
      allowedScopes: [
        'wiki:read',
        'wiki:write',
        'projects:read',
        'projects:write',
      ],
      updatedByUserId: userA,
    });
    for (const userId of [userA, userB]) {
      await repository.ensureUserPolicy({
        organizationId: organizationA,
        userId,
        requestedScopes: ['wiki:read', 'wiki:write', 'projects:write'],
      });
    }

    const result = await repository.updateOrganizationPolicyAndPruneUsers({
      organizationId: organizationA,
      allowedScopes: ['wiki:read', 'projects:read'],
      expectedRevision: 0,
      updatedByUserId: userA,
    });

    expect(result).toMatchObject({
      status: 'updated',
      value: { affectedUserCount: 2 },
    });
    const policies = await Promise.all(
      [userA, userB].map((userId) =>
        repository.findUserPolicy(organizationA, userId),
      ),
    );
    expect(policies).toEqual([
      expect.objectContaining({ requestedScopes: ['wiki:read'], revision: 1 }),
      expect.objectContaining({ requestedScopes: ['wiki:read'], revision: 1 }),
    ]);

    const reenabled = await repository.updateOrganizationPolicyAndPruneUsers({
      organizationId: organizationA,
      allowedScopes: ['wiki:read', 'wiki:write', 'projects:read'],
      expectedRevision: 1,
      updatedByUserId: userA,
    });
    expect(reenabled.status).toBe('updated');
    await expect(
      repository.findUserPolicy(organizationA, userA),
    ).resolves.toMatchObject({ requestedScopes: ['wiki:read'], revision: 1 });
  });

  it('organization과 user 삭제 cascade는 다른 tenant policy를 보존한다', async () => {
    for (const targetOrganization of [organizationA, organizationB]) {
      await repository.ensureOrganizationPolicy({
        organizationId: targetOrganization,
        allowedScopes: ['wiki:read'],
        updatedByUserId: userA,
      });
      await repository.ensureUserPolicy({
        organizationId: targetOrganization,
        userId: userA,
        requestedScopes: ['wiki:read'],
      });
    }

    await database
      .delete(organization)
      .where(eq(organization.id, organizationA));

    await expect(
      repository.findOrganizationPolicy(organizationA),
    ).resolves.toBeNull();
    await expect(
      repository.findOrganizationPolicy(organizationB),
    ).resolves.not.toBeNull();
    await database.delete(user).where(eq(user.id, userA));
    await expect(
      repository.findUserPolicy(organizationB, userA),
    ).resolves.toBeNull();
  });

  async function cleanup(): Promise<void> {
    await database
      .delete(mcpOrganizationPolicy)
      .where(
        inArray(mcpOrganizationPolicy.organizationId, [
          organizationA,
          organizationB,
        ]),
      );
    await database
      .delete(organization)
      .where(inArray(organization.id, [organizationA, organizationB]));
    await database.delete(user).where(inArray(user.id, [userA, userB]));
  }
});
