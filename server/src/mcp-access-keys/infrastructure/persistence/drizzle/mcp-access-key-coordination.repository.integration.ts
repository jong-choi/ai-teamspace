import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { user } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';
import { McpAccessKeyDrizzlePersistenceModule } from '@/mcp-access-keys/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { mcpAccessKeyAllocation } from '@/mcp-access-keys/infrastructure/persistence/drizzle/schema/mcp-access-key-allocation.schema';
import { mcpAccessKeyOperation } from '@/mcp-access-keys/infrastructure/persistence/drizzle/schema/mcp-access-key-operation.schema';
import { McpAccessKeyCoordinationRepository } from '@/mcp-access-keys/infrastructure/persistence/mcp-access-key-coordination.repository';

import { eq } from 'drizzle-orm';

const userId = 'mcp-access-key-coordination-user';

describe('MCP access key coordination Drizzle 저장소 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let repository: McpAccessKeyCoordinationRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        DatabaseModule,
        McpAccessKeyDrizzlePersistenceModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    repository = moduleRef.get(McpAccessKeyCoordinationRepository);
  });

  beforeEach(async () => {
    await cleanup();
    await database.insert(user).values({
      id: userId,
      name: 'MCP Key User',
      email: 'mcp-key-coordination@example.com',
      username: 'mcpkeycoordination',
    });
  });

  afterAll(async () => {
    await cleanup();
    await moduleRef.close();
  });

  it('동시 quota reservation은 max slot까지만 고유하게 성공한다', async () => {
    const reservations = await Promise.all(
      Array.from({ length: 12 }, () => repository.reserveAllocation(userId, 3)),
    );
    const successful = reservations.filter(
      (reservation) => reservation !== null,
    );

    expect(successful).toHaveLength(3);
    expect(new Set(successful.map((reservation) => reservation.slot))).toEqual(
      new Set([0, 1, 2]),
    );
    await expect(
      repository.listAllocationsForUser(userId),
    ).resolves.toHaveLength(3);
  });

  it('reservation finalize와 key replacement는 active allocation 하나를 유지한다', async () => {
    const reservation = await repository.reserveAllocation(userId, 1);
    if (!reservation) throw new Error('quota reservation을 만들지 못했습니다.');

    const finalized = await repository.finalizeAllocation(
      reservation.id,
      'better-auth-key-a',
    );
    expect(finalized).toMatchObject({
      state: 'active',
      betterAuthKeyId: 'better-auth-key-a',
    });

    const replacement = await repository.replaceAllocationKey({
      userId,
      currentKeyId: 'better-auth-key-a',
      replacementKeyId: 'better-auth-key-b',
    });
    expect(replacement).toMatchObject({
      state: 'active',
      betterAuthKeyId: 'better-auth-key-b',
    });
    await expect(
      repository.findAllocationByKeyId(userId, 'better-auth-key-a'),
    ).resolves.toBeNull();
    await expect(
      repository.findAllocationByKeyId(userId, 'better-auth-key-b'),
    ).resolves.toMatchObject({ id: reservation.id });
  });

  it('동일 idempotency key 동시 reservation은 operation 하나로 수렴한다', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        repository.reserveOperation({
          userId,
          idempotencyKey: 'same-operation',
          operation: 'create',
          requestFingerprint: 'a'.repeat(64),
          expiresAt,
        }),
      ),
    );

    expect(
      results.filter((result) => result.status === 'reserved'),
    ).toHaveLength(1);
    expect(new Set(results.map((result) => result.operation.id)).size).toBe(1);
    await expect(
      database
        .select()
        .from(mcpAccessKeyOperation)
        .where(eq(mcpAccessKeyOperation.userId, userId)),
    ).resolves.toHaveLength(1);
  });

  it('operation terminal transition과 expired pending 조회가 단방향으로 동작한다', async () => {
    const expired = await repository.reserveOperation({
      userId,
      idempotencyKey: 'expired-operation',
      operation: 'rotate',
      requestFingerprint: 'b'.repeat(64),
      expiresAt: new Date(Date.now() - 1_000),
    });
    const active = await repository.reserveOperation({
      userId,
      idempotencyKey: 'active-operation',
      operation: 'create',
      requestFingerprint: 'c'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      repository.listExpiredOperationsForUser(userId, new Date()),
    ).resolves.toEqual([
      expect.objectContaining({ id: expired.operation.id, status: 'pending' }),
    ]);
    await expect(
      repository.completeOperation(active.operation.id, 'result-key'),
    ).resolves.toMatchObject({
      status: 'completed',
      resultingKeyId: 'result-key',
    });
    await repository.failOperation(active.operation.id);
    const [stored] = await database
      .select()
      .from(mcpAccessKeyOperation)
      .where(eq(mcpAccessKeyOperation.id, active.operation.id));
    expect(stored).toMatchObject({
      status: 'completed',
      resultingKeyId: 'result-key',
    });
  });

  it('user delete cascade가 allocation과 operation을 함께 제거한다', async () => {
    await repository.reserveAllocation(userId, 1);
    await repository.reserveOperation({
      userId,
      idempotencyKey: 'cascade-operation',
      operation: 'create',
      requestFingerprint: 'd'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await database.delete(user).where(eq(user.id, userId));

    await expect(
      database
        .select()
        .from(mcpAccessKeyAllocation)
        .where(eq(mcpAccessKeyAllocation.userId, userId)),
    ).resolves.toHaveLength(0);
    await expect(
      database
        .select()
        .from(mcpAccessKeyOperation)
        .where(eq(mcpAccessKeyOperation.userId, userId)),
    ).resolves.toHaveLength(0);
  });

  async function cleanup(): Promise<void> {
    await database
      .delete(mcpAccessKeyOperation)
      .where(eq(mcpAccessKeyOperation.userId, userId));
    await database
      .delete(mcpAccessKeyAllocation)
      .where(eq(mcpAccessKeyAllocation.userId, userId));
    await database.delete(user).where(eq(user.id, userId));
  }
});
