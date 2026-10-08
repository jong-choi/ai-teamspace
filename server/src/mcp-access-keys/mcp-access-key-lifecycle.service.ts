import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import type {
  McpAccessKeyRecord,
  McpAccessKeySecretRecord,
} from '@/mcp-access-keys/domain/mcp-access-key';
import type { McpAccessKeyMetadata } from '@/mcp-access-keys/domain/mcp-access-key-contract';
import {
  type CreateMcpAccessKeyInput,
  CreateMcpAccessKeySchema,
  McpAccessKeyListSchema,
  type McpAccessKeyResponse,
  McpAccessKeySchema,
  type McpAccessKeySecretResponse,
  McpAccessKeySecretSchema,
  type QueryMcpAccessKeysInput,
  QueryMcpAccessKeysSchema,
  type UpdateMcpAccessKeyInput,
  UpdateMcpAccessKeySchema,
} from '@/mcp-access-keys/dto/mcp-access-key.dto';
import { McpAccessKeyProvider } from '@/mcp-access-keys/infrastructure/access-key/mcp-access-key.provider';
import { McpAccessKeyCoordinationRepository } from '@/mcp-access-keys/infrastructure/persistence/mcp-access-key-coordination.repository';
import {
  McpAccessKeyCoordinationFailureError,
  McpAccessKeyExpirationInvalidError,
  McpAccessKeyGrantInvalidError,
  McpAccessKeyIdempotencyConflictError,
  McpAccessKeyNotFoundError,
  McpAccessKeyOperationFailedError,
  McpAccessKeyOperationPendingError,
  McpAccessKeyQuotaExceededError,
  McpAccessKeySecretAlreadyIssuedError,
} from '@/mcp-access-keys/mcp-access-key.error';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';

const secondsPerDay = 24 * 60 * 60;
const millisecondsPerHour = 60 * 60 * 1000;

@Injectable()
export class McpAccessKeyLifecycleService {
  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly provider: McpAccessKeyProvider,
    private readonly coordination: McpAccessKeyCoordinationRepository,
    private readonly membershipService: OrganizationMembershipService,
  ) {}

  async list(userId: string, rawQuery: QueryMcpAccessKeysInput) {
    const query = QueryMcpAccessKeysSchema.parse(rawQuery);
    const records = await this.provider.listForUser(userId);
    const filtered = records
      .filter((record) => matchesStatus(record, query.status))
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          left.id.localeCompare(right.id),
      );
    const items = filtered.slice(query.offset, query.offset + query.limit);

    return McpAccessKeyListSchema.parse({
      items,
      total: filtered.length,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async get(userId: string, keyId: string): Promise<McpAccessKeyResponse> {
    const record = await this.provider.getForUser(userId, keyId);
    if (!record) throw new McpAccessKeyNotFoundError();
    return McpAccessKeySchema.parse(record);
  }

  async create(
    userId: string,
    rawInput: CreateMcpAccessKeyInput,
    idempotencyKey: string,
  ): Promise<McpAccessKeySecretResponse> {
    const input = CreateMcpAccessKeySchema.parse(rawInput);
    const config = this.configService.getOrThrow('mcp', { infer: true });
    const expiresInDays =
      input.expiresInDays ?? config.accessKey.defaultExpiresInDays;

    this.assertExpiry(expiresInDays, config.accessKey.maxExpiresInDays);
    await this.assertGrantMembership(userId, input.organizationGrant);

    const operation = await this.reserveOperation({
      userId,
      idempotencyKey,
      operation: 'create',
      payload: input,
      retentionHours: config.accessKey.operationRetentionHours,
    });

    const allocation = await this.coordination.reserveAllocation(
      userId,
      config.accessKey.maxActivePerUser,
    );
    if (!allocation) {
      await this.safeFailOperation(operation.id);
      throw new McpAccessKeyQuotaExceededError();
    }

    let created: McpAccessKeySecretRecord;
    try {
      created = await this.provider.createForUser({
        userId,
        name: input.name,
        scopes: input.scopes,
        organizationGrant: input.organizationGrant,
        expiresInSeconds: expiresInDays * secondsPerDay,
      });
    } catch (error) {
      await this.safeCompensateCreate({
        userId,
        operationId: operation.id,
        allocationId: allocation.id,
      });
      throw error;
    }

    const recordedResult = await this.coordination.recordOperationResult(
      operation.id,
      created.id,
    );
    if (!recordedResult) {
      await this.safeCompensateCreate({
        userId,
        operationId: operation.id,
        allocationId: allocation.id,
        keyId: created.id,
      });
      throw new McpAccessKeyCoordinationFailureError();
    }

    const finalized = await this.coordination.finalizeAllocation(
      allocation.id,
      created.id,
    );
    if (!finalized) {
      await this.safeCompensateCreate({
        userId,
        operationId: operation.id,
        allocationId: allocation.id,
        keyId: created.id,
      });
      throw new McpAccessKeyCoordinationFailureError();
    }

    const completed = await this.coordination.completeOperation(
      operation.id,
      created.id,
    );
    if (!completed) {
      await this.safeCompensateCreate({
        userId,
        operationId: operation.id,
        allocationId: allocation.id,
        keyId: created.id,
      });
      throw new McpAccessKeyCoordinationFailureError();
    }

    return McpAccessKeySecretSchema.parse({
      key: created,
      secret: created.secret,
    });
  }

  async update(
    userId: string,
    keyId: string,
    rawInput: UpdateMcpAccessKeyInput,
  ): Promise<McpAccessKeyResponse> {
    const input = UpdateMcpAccessKeySchema.parse(rawInput);
    const config = this.configService.getOrThrow('mcp', { infer: true });
    const current = await this.requireRecord(userId, keyId);
    const grant = input.organizationGrant ?? current.organizationGrant;

    await this.assertGrantMembership(userId, grant);

    if (input.expiresInDays !== undefined) {
      this.assertExpiry(input.expiresInDays, config.accessKey.maxExpiresInDays);
    }

    if (
      input.enabled === true &&
      current.expired &&
      input.expiresInDays === undefined
    ) {
      throw new McpAccessKeyExpirationInvalidError();
    }

    const currentActive = current.enabled && !current.expired;
    const targetEnabled = input.enabled ?? current.enabled;
    const targetExpired = current.expired && input.expiresInDays === undefined;
    const targetActive = targetEnabled && !targetExpired;

    let reservedAllocation: { id: string } | null = null;
    if (!currentActive && targetActive) {
      reservedAllocation = await this.coordination.reserveAllocation(
        userId,
        config.accessKey.maxActivePerUser,
      );
      if (!reservedAllocation) {
        throw new McpAccessKeyQuotaExceededError();
      }
    }

    let updated: McpAccessKeyRecord;
    try {
      updated = await this.provider.updateForUser({
        userId,
        keyId,
        name: input.name,
        enabled: input.enabled,
        scopes: input.scopes ?? current.scopes,
        organizationGrant: grant,
        expiresInSeconds:
          input.expiresInDays === undefined
            ? undefined
            : input.expiresInDays * secondsPerDay,
      });
    } catch (error) {
      if (reservedAllocation) {
        await this.coordination.releaseAllocation(reservedAllocation.id);
      }
      throw error;
    }

    if (reservedAllocation) {
      const finalized = await this.coordination.finalizeAllocation(
        reservedAllocation.id,
        keyId,
      );
      if (!finalized) {
        await Promise.allSettled([
          this.provider.updateForUser({
            userId,
            keyId,
            enabled: false,
          }),
          this.coordination.releaseAllocation(reservedAllocation.id),
        ]);
        throw new McpAccessKeyCoordinationFailureError();
      }
    } else if (currentActive && !targetActive) {
      await this.coordination.releaseAllocationByKeyId(userId, keyId);
    }

    return McpAccessKeySchema.parse(updated);
  }

  async revoke(userId: string, keyId: string): Promise<void> {
    const revoked = await this.provider.revoke(userId, keyId);
    await this.coordination.releaseAllocationByKeyId(userId, keyId);

    if (!revoked) {
      return;
    }
  }

  async rotate(
    userId: string,
    keyId: string,
    idempotencyKey: string,
  ): Promise<McpAccessKeySecretResponse> {
    const current = await this.requireRecord(userId, keyId);
    await this.assertGrantMembership(userId, current.organizationGrant);

    const config = this.configService.getOrThrow('mcp', { infer: true });
    const operation = await this.reserveOperation({
      userId,
      idempotencyKey,
      operation: 'rotate',
      payload: { keyId },
      retentionHours: config.accessKey.operationRetentionHours,
    });

    const expiresInSeconds = this.rotationExpirySeconds(
      current,
      config.accessKey.defaultExpiresInDays,
    );

    let replacement: McpAccessKeySecretRecord;
    try {
      replacement = await this.provider.createForUser({
        userId,
        name: current.name,
        scopes: current.scopes,
        organizationGrant: current.organizationGrant,
        expiresInSeconds,
      });

      if (!current.enabled) {
        replacement = {
          ...(await this.provider.updateForUser({
            userId,
            keyId: replacement.id,
            enabled: false,
          })),
          secret: replacement.secret,
        };
      }
    } catch (error) {
      await this.safeFailOperation(operation.id);
      throw error;
    }

    const recordedResult = await this.coordination.recordOperationResult(
      operation.id,
      replacement.id,
    );
    if (!recordedResult) {
      await Promise.allSettled([
        this.provider.revoke(userId, replacement.id),
        this.coordination.failOperation(operation.id),
      ]);
      throw new McpAccessKeyCoordinationFailureError();
    }

    const oldRevoked = await this.provider.revoke(userId, current.id);
    if (!oldRevoked) {
      await Promise.allSettled([
        this.provider.revoke(userId, replacement.id),
        this.coordination.failOperation(operation.id),
      ]);
      throw new McpAccessKeyCoordinationFailureError();
    }

    if (current.enabled && !current.expired) {
      const allocation = await this.coordination.replaceAllocationKey({
        userId,
        currentKeyId: current.id,
        replacementKeyId: replacement.id,
      });
      if (!allocation) {
        await Promise.allSettled([
          this.provider.revoke(userId, replacement.id),
          this.coordination.releaseAllocationByKeyId(userId, current.id),
          this.coordination.failOperation(operation.id),
        ]);
        throw new McpAccessKeyCoordinationFailureError();
      }
    } else {
      await this.coordination.releaseAllocationByKeyId(userId, current.id);
    }

    const completed = await this.coordination.completeOperation(
      operation.id,
      replacement.id,
    );
    if (!completed) {
      await Promise.allSettled([
        this.provider.revoke(userId, replacement.id),
        this.coordination.releaseAllocationByKeyId(userId, replacement.id),
        this.coordination.failOperation(operation.id),
      ]);
      throw new McpAccessKeyCoordinationFailureError();
    }

    return McpAccessKeySecretSchema.parse({
      key: replacement,
      secret: replacement.secret,
    });
  }

  private async requireRecord(
    userId: string,
    keyId: string,
  ): Promise<McpAccessKeyRecord> {
    const record = await this.provider.getForUser(userId, keyId);
    if (!record) throw new McpAccessKeyNotFoundError();
    return record;
  }

  private async assertGrantMembership(
    userId: string,
    grant: McpAccessKeyMetadata['organizationGrant'],
  ): Promise<void> {
    if (grant.mode === 'all-user-organizations') return;

    const memberships = await Promise.all(
      grant.organizationIds.map((organizationId) =>
        this.membershipService.hasMemberUser(organizationId, userId),
      ),
    );

    if (memberships.some((hasMembership) => !hasMembership)) {
      throw new McpAccessKeyGrantInvalidError();
    }
  }

  private assertExpiry(expiresInDays: number, maxExpiresInDays: number): void {
    if (
      !Number.isInteger(expiresInDays) ||
      expiresInDays <= 0 ||
      expiresInDays > maxExpiresInDays
    ) {
      throw new McpAccessKeyExpirationInvalidError();
    }
  }

  private rotationExpirySeconds(
    record: McpAccessKeyRecord,
    defaultExpiresInDays: number,
  ): number {
    if (!record.expiresAt) {
      return defaultExpiresInDays * secondsPerDay;
    }

    const remainingMilliseconds =
      new Date(record.expiresAt).getTime() - Date.now();
    if (remainingMilliseconds <= 0) {
      throw new McpAccessKeyExpirationInvalidError();
    }

    // Better Auth는 초 단위 상대 만료만 받으므로 내림해 rotate가 원래 만료 시각을 넘지 않게 한다.
    return Math.max(1, Math.floor(remainingMilliseconds / 1000));
  }

  private async reserveOperation(input: {
    userId: string;
    idempotencyKey: string;
    operation: 'create' | 'rotate';
    payload: unknown;
    retentionHours: number;
  }) {
    const requestFingerprint = createHash('sha256')
      .update(
        canonicalJson({ operation: input.operation, payload: input.payload }),
      )
      .digest('hex');
    const reservation = await this.coordination.reserveOperation({
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      operation: input.operation,
      requestFingerprint,
      expiresAt: new Date(
        Date.now() + input.retentionHours * millisecondsPerHour,
      ),
    });

    if (reservation.status === 'reserved') {
      return reservation.operation;
    }

    const existing = reservation.operation;
    if (
      existing.operation !== input.operation ||
      existing.requestFingerprint !== requestFingerprint
    ) {
      throw new McpAccessKeyIdempotencyConflictError();
    }

    if (existing.status === 'pending') {
      throw new McpAccessKeyOperationPendingError();
    }
    if (existing.status === 'completed') {
      throw new McpAccessKeySecretAlreadyIssuedError(existing.resultingKeyId);
    }

    throw new McpAccessKeyOperationFailedError();
  }

  private async safeCompensateCreate(input: {
    userId: string;
    operationId: string;
    allocationId: string;
    keyId?: string;
  }): Promise<void> {
    const tasks: Promise<unknown>[] = [
      this.coordination.releaseAllocation(input.allocationId),
      this.coordination.failOperation(input.operationId),
    ];
    if (input.keyId) {
      tasks.push(this.provider.revoke(input.userId, input.keyId));
    }
    await Promise.allSettled(tasks);
  }

  private async safeFailOperation(operationId: string): Promise<void> {
    await Promise.allSettled([this.coordination.failOperation(operationId)]);
  }
}

function matchesStatus(
  record: McpAccessKeyRecord,
  status: 'enabled' | 'disabled' | 'expired' | undefined,
): boolean {
  if (!status) return true;
  if (status === 'expired') return record.expired;
  if (record.expired) return false;
  return status === 'enabled' ? record.enabled : !record.enabled;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }

  return value;
}
