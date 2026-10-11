import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Auth } from '@/auth/auth';
import { MCP_ACCESS_KEY_CONFIG_ID } from '@/auth/auth-options';
import type { AllConfigType } from '@/config/config.type';
import type {
  CreateMcpAccessKeyProviderInput,
  McpAccessKeyRecord,
  McpAccessKeySecretRecord,
  UpdateMcpAccessKeyProviderInput,
} from '@/mcp-access-keys/domain/mcp-access-key';
import {
  MCP_ACCESS_KEY_PREFIX,
  McpAccessKeyMetadataSchema,
  permissionMapToScopes,
  scopesToPermissionMap,
} from '@/mcp-access-keys/domain/mcp-access-key-contract';
import { McpAccessKeyProvider } from '@/mcp-access-keys/infrastructure/access-key/mcp-access-key.provider';
import {
  McpAccessKeyNotFoundError,
  McpAccessKeyProviderFailureError,
} from '@/mcp-access-keys/mcp-access-key.error';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';

const storedApiKeySchema = z.object({
  id: z.string().min(1),
  configId: z.string().min(1),
  name: z.string().nullable(),
  start: z.string().nullable(),
  prefix: z.string().nullable(),
  referenceId: z.string().min(1),
  enabled: z.boolean(),
  lastRequest: z.coerce.date().nullable(),
  expiresAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  permissions: z.unknown().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
});

@Injectable()
export class BetterAuthMcpAccessKeyAdapter extends McpAccessKeyProvider {
  constructor(
    private readonly authService: AuthService<Auth>,
    private readonly configService: ConfigService<AllConfigType>,
  ) {
    super();
  }

  async createForUser(
    input: CreateMcpAccessKeyProviderInput,
  ): Promise<McpAccessKeySecretRecord> {
    return this.call(async () => {
      const config = this.configService.getOrThrow('mcp', { infer: true });
      const result = await this.authService.api.createApiKey({
        body: {
          configId: MCP_ACCESS_KEY_CONFIG_ID,
          userId: input.userId,
          name: input.name,
          prefix: MCP_ACCESS_KEY_PREFIX,
          expiresIn: input.expiresInSeconds,
          permissions: scopesToPermissionMap(input.scopes),
          metadata: {
            kind: 'teamspace-mcp-user',
            version: 1,
            organizationGrant: input.organizationGrant,
          },
          rateLimitEnabled: true,
          rateLimitTimeWindow: config.accessKey.rateLimitWindowMs,
          rateLimitMax: config.accessKey.rateLimitMax,
        },
      });

      return {
        ...this.mapRecord(result, input.userId),
        secret: result.key,
      };
    });
  }

  async listForUser(userId: string): Promise<McpAccessKeyRecord[]> {
    return this.call(async () => {
      const context = await this.authService.instance.$context;
      const rows = await context.adapter.findMany({
        model: 'apikey',
        where: [
          { field: 'configId', value: MCP_ACCESS_KEY_CONFIG_ID },
          { field: 'referenceId', value: userId },
        ],
      });

      return rows.flatMap((row) => {
        const mapped = this.tryMapRecord(row, userId);
        return mapped ? [mapped] : [];
      });
    });
  }

  async getForUser(
    userId: string,
    keyId: string,
  ): Promise<McpAccessKeyRecord | null> {
    return this.call(async () => {
      const context = await this.authService.instance.$context;
      const row = await context.adapter.findOne({
        model: 'apikey',
        where: [
          { field: 'id', value: keyId },
          { field: 'configId', value: MCP_ACCESS_KEY_CONFIG_ID },
          { field: 'referenceId', value: userId },
        ],
      });

      return row ? this.tryMapRecord(row, userId) : null;
    });
  }

  async updateForUser(
    input: UpdateMcpAccessKeyProviderInput,
  ): Promise<McpAccessKeyRecord> {
    return this.call(async () => {
      const current = await this.getForUser(input.userId, input.keyId);
      if (!current) {
        throw new McpAccessKeyNotFoundError();
      }

      const result = await this.authService.api.updateApiKey({
        body: {
          configId: MCP_ACCESS_KEY_CONFIG_ID,
          keyId: input.keyId,
          userId: input.userId,
          name: input.name,
          enabled: input.enabled,
          expiresIn: input.expiresInSeconds,
          permissions: scopesToPermissionMap(input.scopes ?? current.scopes),
          metadata: {
            kind: 'teamspace-mcp-user',
            version: 1,
            organizationGrant:
              input.organizationGrant ?? current.organizationGrant,
          },
        },
      });

      return this.mapRecord(result, input.userId);
    });
  }

  async revoke(userId: string, keyId: string): Promise<boolean> {
    return this.call(async () => {
      const context = await this.authService.instance.$context;
      const existing = await context.adapter.findOne({
        model: 'apikey',
        where: [
          { field: 'id', value: keyId },
          { field: 'configId', value: MCP_ACCESS_KEY_CONFIG_ID },
          { field: 'referenceId', value: userId },
        ],
        select: ['id'],
      });

      if (!existing) return false;

      await context.adapter.delete({
        model: 'apikey',
        where: [{ field: 'id', value: keyId }],
      });
      return true;
    });
  }

  private mapRecord(
    value: unknown,
    expectedUserId: string,
  ): McpAccessKeyRecord {
    const row = storedApiKeySchema.parse(value);
    if (
      row.configId !== MCP_ACCESS_KEY_CONFIG_ID ||
      row.referenceId !== expectedUserId ||
      row.prefix !== MCP_ACCESS_KEY_PREFIX ||
      !row.name
    ) {
      throw new McpAccessKeyProviderFailureError();
    }

    const metadata = McpAccessKeyMetadataSchema.parse(
      parseStoredJson(row.metadata),
    );
    const scopes = permissionMapToScopes(parseStoredJson(row.permissions));

    return {
      id: row.id,
      name: row.name,
      prefix: MCP_ACCESS_KEY_PREFIX,
      start: row.start,
      enabled: row.enabled,
      expired: row.expiresAt ? row.expiresAt.getTime() <= Date.now() : false,
      scopes,
      organizationGrant: metadata.organizationGrant,
      lastUsedAt: row.lastRequest?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private tryMapRecord(
    value: unknown,
    expectedUserId: string,
  ): McpAccessKeyRecord | null {
    try {
      return this.mapRecord(value, expectedUserId);
    } catch {
      return null;
    }
  }

  private async call<T>(execute: () => Promise<T>): Promise<T> {
    try {
      return await execute();
    } catch (error) {
      if (
        error instanceof McpAccessKeyNotFoundError ||
        error instanceof McpAccessKeyProviderFailureError
      ) {
        throw error;
      }
      throw new McpAccessKeyProviderFailureError({ cause: error });
    }
  }
}

function parseStoredJson(value: unknown): unknown {
  let current = value;

  for (let depth = 0; depth < 2 && typeof current === 'string'; depth += 1) {
    try {
      current = JSON.parse(current) as unknown;
    } catch {
      return current;
    }
  }

  return current;
}
