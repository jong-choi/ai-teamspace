import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { AuthModule } from '@/auth/auth.module';
import authConfig from '@/auth/config/auth.config';
import {
  apikey,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';
import mcpConfig from '@/mcp/config/mcp.config';
import { BetterAuthMcpAccessKeyModule } from '@/mcp-access-keys/infrastructure/access-key/better-auth/better-auth-mcp-access-key.module';
import { McpAccessKeyProvider } from '@/mcp-access-keys/infrastructure/access-key/mcp-access-key.provider';
import { BetterAuthMcpAccessKeyAuthenticatorModule } from '@/mcp-access-keys/infrastructure/better-auth/better-auth-mcp-access-key-authenticator.module';
import {
  McpAccessKeyAuthenticationError,
  McpAccessKeyNotFoundError,
} from '@/mcp-access-keys/mcp-access-key.error';
import { McpAccessKeyAuthenticator } from '@/mcp-access-keys/mcp-access-key-authenticator.provider';

import { eq } from 'drizzle-orm';

const userId = 'mcp-access-key-integration-user';

describe('Better Auth MCP access key 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let provider: McpAccessKeyProvider;
  let authenticator: McpAccessKeyAuthenticator;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [authConfig, databaseConfig, mcpConfig],
          envFilePath: ['.env'],
        }),
        DatabaseModule,
        AuthModule,
        BetterAuthMcpAccessKeyModule,
        BetterAuthMcpAccessKeyAuthenticatorModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    provider = moduleRef.get(McpAccessKeyProvider);
    authenticator = moduleRef.get(McpAccessKeyAuthenticator);
  });

  beforeEach(async () => {
    await cleanup();
    await database.insert(user).values({
      id: userId,
      name: 'MCP Key Integration',
      email: 'mcp-key-integration@example.com',
      username: 'mcpkeyintegration',
    });
  });

  afterAll(async () => {
    await cleanup();
    await moduleRef.close();
  });

  it('actual key create와 verify는 raw secret을 DB에 저장하지 않고 canonical auth context를 만든다', async () => {
    const createdAt = Date.now();
    const created = await provider.createForUser({
      userId,
      name: 'integration-key',
      scopes: ['wiki:read', 'wiki:write'],
      organizationGrant: {
        mode: 'selected',
        organizationIds: ['organization-b', 'organization-a'],
      },
      expiresInSeconds: 86_400,
    });

    expect(created.secret).toMatch(/^wos_mcp_/u);
    expect(created.expiresAt).not.toBeNull();
    const expiresInMs = new Date(created.expiresAt!).getTime() - createdAt;
    expect(expiresInMs).toBeGreaterThan(86_300_000);
    expect(expiresInMs).toBeLessThanOrEqual(86_500_000);

    const [stored] = await database
      .select()
      .from(apikey)
      .where(eq(apikey.id, created.id));
    expect(stored?.key).not.toBe(created.secret);
    expect(JSON.stringify(stored)).not.toContain(created.secret);

    await expect(authenticator.authenticate(created.secret)).resolves.toEqual(
      expect.objectContaining({
        authMethod: 'api-key',
        credentialId: created.id,
        userId,
        scopes: ['wiki:read', 'wiki:write'],
        allowedOrganizationIds: ['organization-a', 'organization-b'],
      }),
    );
    expect(JSON.stringify(await provider.listForUser(userId))).not.toContain(
      created.secret,
    );
  });

  it('disable과 revoke는 이미 발급된 secret을 즉시 인증 불가로 만든다', async () => {
    const created = await createKey('disable-key');
    await expect(
      authenticator.authenticate(created.secret),
    ).resolves.toMatchObject({ credentialId: created.id });

    await provider.updateForUser({
      userId,
      keyId: created.id,
      enabled: false,
    });
    await expect(
      authenticator.authenticate(created.secret),
    ).rejects.toBeInstanceOf(McpAccessKeyAuthenticationError);

    await provider.updateForUser({
      userId,
      keyId: created.id,
      enabled: true,
    });
    await expect(
      authenticator.authenticate(created.secret),
    ).resolves.toMatchObject({ credentialId: created.id });
    await expect(provider.revoke(userId, created.id)).resolves.toBe(true);
    await expect(
      authenticator.authenticate(created.secret),
    ).rejects.toBeInstanceOf(McpAccessKeyAuthenticationError);
  });

  it('다른 owner는 key를 조회·변경·폐기할 수 없다', async () => {
    const created = await createKey('owner-key');

    await expect(
      provider.getForUser('other-user', created.id),
    ).resolves.toBeNull();
    await expect(
      provider.updateForUser({
        userId: 'other-user',
        keyId: created.id,
        name: 'stolen',
      }),
    ).rejects.toBeInstanceOf(McpAccessKeyNotFoundError);
    await expect(provider.revoke('other-user', created.id)).resolves.toBe(
      false,
    );
    await expect(
      authenticator.authenticate(created.secret),
    ).resolves.toMatchObject({
      userId,
    });
  });

  it('owner row가 사라진 orphan key는 plugin hash가 남아도 fail-closed한다', async () => {
    const created = await createKey('orphan-key');
    await database.delete(user).where(eq(user.id, userId));

    await expect(
      authenticator.authenticate(created.secret),
    ).rejects.toBeInstanceOf(McpAccessKeyAuthenticationError);
  });

  function createKey(name: string) {
    return provider.createForUser({
      userId,
      name,
      scopes: ['wiki:read'],
      organizationGrant: { mode: 'all-user-organizations' },
      expiresInSeconds: 86_400,
    });
  }

  async function cleanup(): Promise<void> {
    await database.delete(apikey).where(eq(apikey.referenceId, userId));
    await database.delete(user).where(eq(user.id, userId));
  }
});
