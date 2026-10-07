import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Auth } from '@/auth/auth';
import type { AllConfigType } from '@/config/config.type';
import { McpScopeSchema, normalizeMcpScopes } from '@/mcp/contracts/mcp-scope';
import type { McpOAuthConnection } from '@/mcp-oauth-connections/domain/mcp-oauth-connection';
import { McpOAuthConnectionProvider } from '@/mcp-oauth-connections/infrastructure/oauth-connection/mcp-oauth-connection.provider';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';

const consentSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  userId: z.string().min(1).nullable().optional(),
  resources: z.array(z.string()).nullable().optional(),
  scopes: z.array(z.string()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const clientSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().nullable().optional(),
  applicationType: z.enum(['web', 'native']).nullable().optional(),
  tokenEndpointAuthMethod: z.string().nullable().optional(),
  disabled: z.boolean().nullable().optional(),
});

const tokenSchema = z.object({
  id: z.string().min(1),
  resources: z.array(z.string()).nullable().optional(),
  revoked: z.coerce.date().nullable().optional(),
});

@Injectable()
export class BetterAuthMcpOAuthConnectionAdapter extends McpOAuthConnectionProvider {
  constructor(
    private readonly authService: AuthService<Auth>,
    private readonly configService: ConfigService<AllConfigType>,
  ) {
    super();
  }

  async listForUser(userId: string): Promise<McpOAuthConnection[]> {
    const resourceUrl = this.resourceUrl();
    const context = await this.authService.instance.$context;
    const consentRows = await context.adapter.findMany({
      model: 'oauthConsent',
      where: [{ field: 'userId', value: userId }],
    });
    const consents = consentRows
      .map((row) => consentSchema.safeParse(row))
      .filter((result) => result.success)
      .map((result) => result.data)
      .filter(
        (consent) =>
          consent.userId === userId &&
          consent.resources?.includes(resourceUrl) === true,
      );

    if (consents.length === 0) return [];

    const clientIds = [...new Set(consents.map((consent) => consent.clientId))];
    const clientRows = await context.adapter.findMany({
      model: 'oauthClient',
      where: [{ field: 'clientId', operator: 'in', value: clientIds }],
    });
    const clientsById = new Map(
      clientRows.flatMap((row) => {
        const parsed = clientSchema.safeParse(row);
        return parsed.success
          ? [[parsed.data.clientId, parsed.data] as const]
          : [];
      }),
    );

    return consents
      .flatMap((consent) => {
        const client = clientsById.get(consent.clientId);
        if (!client) return [];

        const scopes = normalizeMcpScopes(
          consent.scopes.filter(
            (scope) => McpScopeSchema.safeParse(scope).success,
          ),
        );

        return [
          {
            consentId: consent.id,
            clientId: consent.clientId,
            displayName: client.name?.trim() || consent.clientId,
            applicationType: client.applicationType ?? null,
            publicClient: client.tokenEndpointAuthMethod === 'none',
            scopes,
            createdAt: consent.createdAt.toISOString(),
            updatedAt: consent.updatedAt.toISOString(),
            status: 'approved' as const,
          },
        ];
      })
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.consentId.localeCompare(right.consentId),
      );
  }

  async revokeForUser(userId: string, consentId: string): Promise<boolean> {
    const resourceUrl = this.resourceUrl();
    const context = await this.authService.instance.$context;
    const rawConsent = await context.adapter.findOne({
      model: 'oauthConsent',
      where: [
        { field: 'id', value: consentId },
        { field: 'userId', value: userId },
      ],
    });
    const parsedConsent = consentSchema.safeParse(rawConsent);
    if (
      !parsedConsent.success ||
      parsedConsent.data.userId !== userId ||
      parsedConsent.data.resources?.includes(resourceUrl) !== true
    ) {
      return false;
    }

    const consent = parsedConsent.data;
    const [rawRefreshTokens, rawAccessTokens] = await Promise.all([
      context.adapter.findMany({
        model: 'oauthRefreshToken',
        where: [
          { field: 'userId', value: userId },
          { field: 'clientId', value: consent.clientId },
        ],
      }),
      context.adapter.findMany({
        model: 'oauthAccessToken',
        where: [
          { field: 'userId', value: userId },
          { field: 'clientId', value: consent.clientId },
        ],
      }),
    ]);

    const refreshTokenIds = activeResourceTokenIds(
      rawRefreshTokens,
      resourceUrl,
    );
    const accessTokenIds = activeResourceTokenIds(rawAccessTokens, resourceUrl);
    const revokedAt = new Date();

    if (refreshTokenIds.length > 0) {
      await context.adapter.updateMany({
        model: 'oauthRefreshToken',
        where: [
          {
            field: 'id',
            operator: 'in',
            value: refreshTokenIds,
          },
        ],
        update: { revoked: revokedAt },
      });
    }

    if (accessTokenIds.length > 0) {
      await context.adapter.updateMany({
        model: 'oauthAccessToken',
        where: [
          {
            field: 'id',
            operator: 'in',
            value: accessTokenIds,
          },
        ],
        update: { revoked: revokedAt },
      });
    }

    await context.adapter.delete({
      model: 'oauthConsent',
      where: [{ field: 'id', value: consent.id }],
    });

    return true;
  }

  private resourceUrl(): string {
    return this.configService.getOrThrow('mcp', { infer: true }).resourceUrl;
  }
}

function activeResourceTokenIds(
  rows: unknown[],
  resourceUrl: string,
): string[] {
  return rows.flatMap((row) => {
    const parsed = tokenSchema.safeParse(row);
    if (
      !parsed.success ||
      parsed.data.revoked ||
      parsed.data.resources?.includes(resourceUrl) !== true
    ) {
      return [];
    }
    return [parsed.data.id];
  });
}
