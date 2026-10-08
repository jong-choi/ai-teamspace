import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { mcpAccessKeyAllocation } from '@/mcp-access-keys/infrastructure/persistence/drizzle/schema/mcp-access-key-allocation.schema';
import {
  mcpAccessKeyAllocationSelectSchema,
  mcpAccessKeyOperationSelectSchema,
} from '@/mcp-access-keys/infrastructure/persistence/drizzle/schema/mcp-access-key-coordination.zod';
import { mcpAccessKeyOperation } from '@/mcp-access-keys/infrastructure/persistence/drizzle/schema/mcp-access-key-operation.schema';
import {
  McpAccessKeyCoordinationRepository,
  type ReserveMcpAccessKeyOperationResult,
} from '@/mcp-access-keys/infrastructure/persistence/mcp-access-key-coordination.repository';

import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { union } from 'drizzle-orm/pg-core';

@Injectable()
export class McpAccessKeyCoordinationDrizzleRepository extends McpAccessKeyCoordinationRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async listCoordinatedUserIds(input: {
    afterUserId: string | null;
    limit: number;
  }) {
    const rows = await union(
      this.database.db
        .select({ userId: mcpAccessKeyAllocation.userId })
        .from(mcpAccessKeyAllocation)
        .where(
          input.afterUserId === null
            ? undefined
            : gt(mcpAccessKeyAllocation.userId, input.afterUserId),
        ),
      this.database.db
        .select({ userId: mcpAccessKeyOperation.userId })
        .from(mcpAccessKeyOperation)
        .where(
          and(
            eq(mcpAccessKeyOperation.status, 'pending'),
            input.afterUserId === null
              ? undefined
              : gt(mcpAccessKeyOperation.userId, input.afterUserId),
          ),
        ),
    )
      .orderBy(asc(mcpAccessKeyAllocation.userId))
      .limit(input.limit);

    return rows.map((row) => row.userId);
  }

  async listAllocationsForUser(userId: string) {
    const rows = await this.database.db
      .select()
      .from(mcpAccessKeyAllocation)
      .where(eq(mcpAccessKeyAllocation.userId, userId));

    return rows.map((row) => mcpAccessKeyAllocationSelectSchema.parse(row));
  }

  async findAllocationByKeyId(userId: string, betterAuthKeyId: string) {
    const [row] = await this.database.db
      .select()
      .from(mcpAccessKeyAllocation)
      .where(
        and(
          eq(mcpAccessKeyAllocation.userId, userId),
          eq(mcpAccessKeyAllocation.betterAuthKeyId, betterAuthKeyId),
        ),
      )
      .limit(1);

    return row ? mcpAccessKeyAllocationSelectSchema.parse(row) : null;
  }

  async reserveAllocation(userId: string, maxSlots: number) {
    for (let slot = 0; slot < maxSlots; slot += 1) {
      const [row] = await this.database.db
        .insert(mcpAccessKeyAllocation)
        .values({ userId, slot, state: 'reserving' })
        .onConflictDoNothing()
        .returning();

      if (row) {
        return mcpAccessKeyAllocationSelectSchema.parse(row);
      }
    }

    return null;
  }

  async finalizeAllocation(allocationId: string, betterAuthKeyId: string) {
    const [row] = await this.database.db
      .update(mcpAccessKeyAllocation)
      .set({
        betterAuthKeyId,
        state: 'active',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mcpAccessKeyAllocation.id, allocationId),
          eq(mcpAccessKeyAllocation.state, 'reserving'),
        ),
      )
      .returning();

    return row ? mcpAccessKeyAllocationSelectSchema.parse(row) : null;
  }

  async releaseAllocation(allocationId: string): Promise<void> {
    await this.database.db
      .delete(mcpAccessKeyAllocation)
      .where(eq(mcpAccessKeyAllocation.id, allocationId));
  }

  async releaseAllocationByKeyId(
    userId: string,
    betterAuthKeyId: string,
  ): Promise<void> {
    await this.database.db
      .delete(mcpAccessKeyAllocation)
      .where(
        and(
          eq(mcpAccessKeyAllocation.userId, userId),
          eq(mcpAccessKeyAllocation.betterAuthKeyId, betterAuthKeyId),
        ),
      );
  }

  async replaceAllocationKey(input: {
    userId: string;
    currentKeyId: string;
    replacementKeyId: string;
  }) {
    const [row] = await this.database.db
      .update(mcpAccessKeyAllocation)
      .set({
        betterAuthKeyId: input.replacementKeyId,
        state: 'active',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mcpAccessKeyAllocation.userId, input.userId),
          eq(mcpAccessKeyAllocation.betterAuthKeyId, input.currentKeyId),
          eq(mcpAccessKeyAllocation.state, 'active'),
        ),
      )
      .returning();

    return row ? mcpAccessKeyAllocationSelectSchema.parse(row) : null;
  }

  async reserveOperation(input: {
    userId: string;
    idempotencyKey: string;
    operation: 'create' | 'rotate';
    requestFingerprint: string;
    expiresAt: Date;
  }): Promise<ReserveMcpAccessKeyOperationResult> {
    const [inserted] = await this.database.db
      .insert(mcpAccessKeyOperation)
      .values({
        ...input,
        status: 'pending',
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return {
        status: 'reserved',
        operation: mcpAccessKeyOperationSelectSchema.parse(inserted),
      };
    }

    const [existing] = await this.database.db
      .select()
      .from(mcpAccessKeyOperation)
      .where(
        and(
          eq(mcpAccessKeyOperation.userId, input.userId),
          eq(mcpAccessKeyOperation.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error(
        'MCP access key idempotency reservation 결과가 없습니다.',
      );
    }

    return {
      status: 'existing',
      operation: mcpAccessKeyOperationSelectSchema.parse(existing),
    };
  }

  async listExpiredOperationsForUser(userId: string, now: Date) {
    const rows = await this.database.db
      .select()
      .from(mcpAccessKeyOperation)
      .where(
        and(
          eq(mcpAccessKeyOperation.userId, userId),
          eq(mcpAccessKeyOperation.status, 'pending'),
          lte(mcpAccessKeyOperation.expiresAt, now),
        ),
      );

    return rows.map((row) => mcpAccessKeyOperationSelectSchema.parse(row));
  }

  async recordOperationResult(operationId: string, resultingKeyId: string) {
    const [row] = await this.database.db
      .update(mcpAccessKeyOperation)
      .set({
        resultingKeyId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mcpAccessKeyOperation.id, operationId),
          eq(mcpAccessKeyOperation.status, 'pending'),
        ),
      )
      .returning();

    return row ? mcpAccessKeyOperationSelectSchema.parse(row) : null;
  }

  async completeOperation(operationId: string, resultingKeyId: string) {
    const [row] = await this.database.db
      .update(mcpAccessKeyOperation)
      .set({
        status: 'completed',
        resultingKeyId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mcpAccessKeyOperation.id, operationId),
          eq(mcpAccessKeyOperation.status, 'pending'),
        ),
      )
      .returning();

    return row ? mcpAccessKeyOperationSelectSchema.parse(row) : null;
  }

  async failOperation(operationId: string): Promise<void> {
    await this.database.db
      .update(mcpAccessKeyOperation)
      .set({
        status: 'failed',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mcpAccessKeyOperation.id, operationId),
          eq(mcpAccessKeyOperation.status, 'pending'),
        ),
      );
  }
}
