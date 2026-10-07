import { Injectable } from '@nestjs/common';

import type { Auth } from '@/auth/auth';
import { MCP_ACCESS_KEY_CONFIG_ID } from '@/auth/auth-options';
import {
  type McpAuthContext,
  McpAuthContextSchema,
} from '@/mcp/contracts/mcp-auth-context';
import {
  grantToAllowedOrganizationIds,
  McpAccessKeyMetadataSchema,
  permissionMapToScopes,
} from '@/mcp-access-keys/domain/mcp-access-key-contract';
import {
  McpAccessKeyAuthenticationError,
  McpAccessKeyRateLimitedError,
} from '@/mcp-access-keys/mcp-access-key.error';
import { McpAccessKeyAuthenticator } from '@/mcp-access-keys/mcp-access-key-authenticator.provider';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth';

@Injectable()
export class BetterAuthMcpAccessKeyAuthenticatorAdapter extends McpAccessKeyAuthenticator {
  constructor(private readonly authService: AuthService<Auth>) {
    super();
  }

  async authenticate(secret: string): Promise<McpAuthContext> {
    try {
      const result = await this.authService.api.verifyApiKey({
        body: {
          configId: MCP_ACCESS_KEY_CONFIG_ID,
          key: secret,
        },
      });

      if (result.error?.code === 'RATE_LIMITED') {
        throw new McpAccessKeyRateLimitedError(
          extractRetryAfterMs(result.error),
        );
      }

      if (!result.valid || result.error || !result.key) {
        throw new McpAccessKeyAuthenticationError();
      }

      if (result.key.configId !== MCP_ACCESS_KEY_CONFIG_ID) {
        throw new McpAccessKeyAuthenticationError();
      }

      const metadata = McpAccessKeyMetadataSchema.parse(result.key.metadata);
      const scopes = permissionMapToScopes(result.key.permissions);
      const authContext = await this.authService.instance.$context;
      const owner = await authContext.internalAdapter.findUserById(
        result.key.referenceId,
      );
      if (!owner) {
        throw new McpAccessKeyAuthenticationError();
      }

      return McpAuthContextSchema.parse({
        authMethod: 'api-key',
        credentialId: result.key.id,
        userId: result.key.referenceId,
        clientId: null,
        scopes,
        allowedOrganizationIds: grantToAllowedOrganizationIds(metadata),
      });
    } catch (error) {
      if (
        error instanceof McpAccessKeyAuthenticationError ||
        error instanceof McpAccessKeyRateLimitedError
      ) {
        throw error;
      }
      if (error instanceof APIError && error.statusCode === 429) {
        throw new McpAccessKeyRateLimitedError(
          extractRetryAfterMs(error.body),
          { cause: error },
        );
      }
      throw new McpAccessKeyAuthenticationError({ cause: error });
    }
  }
}

function extractRetryAfterMs(value: unknown): number | null {
  if (value === null || typeof value !== 'object') return null;
  const details = (value as Record<string, unknown>).details;
  if (details === null || typeof details !== 'object') return null;
  const tryAgainIn = (details as Record<string, unknown>).tryAgainIn;
  return typeof tryAgainIn === 'number' && Number.isFinite(tryAgainIn)
    ? Math.max(0, tryAgainIn)
    : null;
}
