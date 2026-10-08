import {
  mcpAccessKeyAllocationSelectSchema,
  mcpAccessKeyOperationSelectSchema,
} from '@/mcp-access-keys/infrastructure/persistence/drizzle/schema/mcp-access-key-coordination.zod';

import type { z } from 'zod';

export type McpAccessKeyAllocation = z.infer<
  typeof mcpAccessKeyAllocationSelectSchema
>;

export type McpAccessKeyOperation = z.infer<
  typeof mcpAccessKeyOperationSelectSchema
>;

export type ReserveMcpAccessKeyOperationResult =
  | { status: 'reserved'; operation: McpAccessKeyOperation }
  | { status: 'existing'; operation: McpAccessKeyOperation };

export abstract class McpAccessKeyCoordinationRepository {
  // allocation 또는 pending operation이 남은 user id를 userId 순서로 afterUserId 다음부터 limit개까지 반환한다.
  abstract listCoordinatedUserIds(input: {
    afterUserId: string | null;
    limit: number;
  }): Promise<string[]>;

  abstract listAllocationsForUser(
    userId: string,
  ): Promise<McpAccessKeyAllocation[]>;

  abstract findAllocationByKeyId(
    userId: string,
    betterAuthKeyId: string,
  ): Promise<McpAccessKeyAllocation | null>;

  abstract reserveAllocation(
    userId: string,
    maxSlots: number,
  ): Promise<McpAccessKeyAllocation | null>;

  abstract finalizeAllocation(
    allocationId: string,
    betterAuthKeyId: string,
  ): Promise<McpAccessKeyAllocation | null>;

  abstract releaseAllocation(allocationId: string): Promise<void>;

  abstract releaseAllocationByKeyId(
    userId: string,
    betterAuthKeyId: string,
  ): Promise<void>;

  abstract replaceAllocationKey(input: {
    userId: string;
    currentKeyId: string;
    replacementKeyId: string;
  }): Promise<McpAccessKeyAllocation | null>;

  abstract reserveOperation(input: {
    userId: string;
    idempotencyKey: string;
    operation: 'create' | 'rotate';
    requestFingerprint: string;
    expiresAt: Date;
  }): Promise<ReserveMcpAccessKeyOperationResult>;

  abstract listExpiredOperationsForUser(
    userId: string,
    now: Date,
  ): Promise<McpAccessKeyOperation[]>;

  abstract recordOperationResult(
    operationId: string,
    resultingKeyId: string,
  ): Promise<McpAccessKeyOperation | null>;

  abstract completeOperation(
    operationId: string,
    resultingKeyId: string,
  ): Promise<McpAccessKeyOperation | null>;

  abstract failOperation(operationId: string): Promise<void>;
}
