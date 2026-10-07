import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import type { McpAccessKeyRecord } from '@/mcp-access-keys/domain/mcp-access-key';
import { McpAccessKeyProvider } from '@/mcp-access-keys/infrastructure/access-key/mcp-access-key.provider';
import { McpAccessKeyCoordinationRepository } from '@/mcp-access-keys/infrastructure/persistence/mcp-access-key-coordination.repository';

export type McpAccessKeyReconciliationResult = {
  releasedAllocations: number;
  recoveredAllocations: number;
  revokedOrphanKeys: number;
  completedOperations: number;
  failedOperations: number;
};

@Injectable()
export class McpAccessKeyReconciliationService {
  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly provider: McpAccessKeyProvider,
    private readonly coordination: McpAccessKeyCoordinationRepository,
  ) {}

  async reconcileUser(
    userId: string,
  ): Promise<McpAccessKeyReconciliationResult> {
    const config = this.configService.getOrThrow('mcp', { infer: true });
    const now = new Date();
    const staleBefore = new Date(
      now.getTime() - config.accessKey.reservationStaleAfterSeconds * 1000,
    );

    const [keys, allocations, expiredOperations] = await Promise.all([
      this.provider.listForUser(userId),
      this.coordination.listAllocationsForUser(userId),
      this.coordination.listExpiredOperationsForUser(userId, now),
    ]);
    const keysById = new Map(keys.map((key) => [key.id, key]));

    const result: McpAccessKeyReconciliationResult = {
      releasedAllocations: 0,
      recoveredAllocations: 0,
      revokedOrphanKeys: 0,
      completedOperations: 0,
      failedOperations: 0,
    };

    for (const allocation of allocations) {
      if (allocation.state === 'reserving') {
        if (allocation.updatedAt <= staleBefore) {
          await this.coordination.releaseAllocation(allocation.id);
          result.releasedAllocations += 1;
        }
        continue;
      }

      const key = allocation.betterAuthKeyId
        ? keysById.get(allocation.betterAuthKeyId)
        : undefined;
      if (!isActiveKey(key)) {
        await this.coordination.releaseAllocation(allocation.id);
        result.releasedAllocations += 1;
      }
    }

    for (const key of keys) {
      if (!isActiveKey(key)) continue;

      const existing = await this.coordination.findAllocationByKeyId(
        userId,
        key.id,
      );
      if (existing?.state === 'active') continue;

      const reservation = await this.coordination.reserveAllocation(
        userId,
        config.accessKey.maxActivePerUser,
      );
      if (!reservation) {
        if (await this.provider.revoke(userId, key.id)) {
          result.revokedOrphanKeys += 1;
        }
        continue;
      }

      const finalized = await this.coordination.finalizeAllocation(
        reservation.id,
        key.id,
      );
      if (!finalized) {
        await Promise.allSettled([
          this.coordination.releaseAllocation(reservation.id),
          this.provider.revoke(userId, key.id),
        ]);
        result.revokedOrphanKeys += 1;
        continue;
      }

      result.recoveredAllocations += 1;
    }

    for (const operation of expiredOperations) {
      if (!operation.resultingKeyId) {
        await this.coordination.failOperation(operation.id);
        result.failedOperations += 1;
        continue;
      }

      const key = await this.provider.getForUser(
        userId,
        operation.resultingKeyId,
      );
      if (!key) {
        await this.coordination.failOperation(operation.id);
        result.failedOperations += 1;
        continue;
      }

      if (isActiveKey(key)) {
        const allocation = await this.coordination.findAllocationByKeyId(
          userId,
          key.id,
        );
        if (allocation?.state !== 'active') {
          await this.coordination.failOperation(operation.id);
          result.failedOperations += 1;
          continue;
        }
      }

      const completed = await this.coordination.completeOperation(
        operation.id,
        key.id,
      );
      if (completed) {
        result.completedOperations += 1;
      } else {
        await this.coordination.failOperation(operation.id);
        result.failedOperations += 1;
      }
    }

    return result;
  }
}

function isActiveKey(
  key: McpAccessKeyRecord | undefined,
): key is McpAccessKeyRecord {
  return Boolean(key?.enabled && !key.expired);
}
