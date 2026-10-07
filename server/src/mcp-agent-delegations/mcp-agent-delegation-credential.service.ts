import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import {
  CredentialCryptoEnvelopeSchema,
  CredentialCryptoProvider,
} from '@/credential-crypto/credential-crypto.provider';
import {
  type McpScope,
  McpScopeSchema,
  normalizeMcpScopes,
} from '@/mcp/contracts/mcp-scope';
import type { McpAgentDelegation } from '@/mcp-agent-delegations/domain/mcp-agent-delegation';
import { McpAgentDelegationRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-delegation.repository';
import { McpAgentDelegationCredentialInvalidError } from '@/mcp-agent-delegations/mcp-agent-delegation.error';
import type { McpAgentDelegationActor } from '@/mcp-agent-delegations/mcp-agent-oauth-flow.service';

import type { StoredOAuthTokens } from '@modelcontextprotocol/client';
import { OAuthTokensSchema } from '@modelcontextprotocol/core';

const TOKEN_FORMAT_VERSION = 1;

const storedTokensSchema = OAuthTokensSchema.refine(
  (value) => typeof value.issuer === 'string' && value.issuer.length > 0,
  {
    message: 'OAuth token에는 issuer가 필요합니다.',
  },
);

export type McpAgentRefreshLease = {
  delegationId: string;
  expectedRevision: number;
  leaseOwner: string;
};

@Injectable()
export class McpAgentDelegationCredentialService {
  constructor(
    private readonly repository: McpAgentDelegationRepository,
    private readonly crypto: CredentialCryptoProvider,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async tokens(
    actor: McpAgentDelegationActor,
    issuer?: string,
  ): Promise<StoredOAuthTokens | undefined> {
    const config = this.config();
    const row = issuer
      ? await this.repository.findActive(
          actor.userId,
          actor.organizationId,
          normalizeIssuer(issuer),
          config.clientId,
        )
      : await this.repository.findLatestActive(
          actor.userId,
          actor.organizationId,
          config.clientId,
        );

    if (!row) return undefined;
    this.assertRow(row);

    try {
      const plaintext = await this.crypto.decrypt(
        CredentialCryptoEnvelopeSchema.parse({
          version: row.tokensFormatVersion,
          algorithm: row.tokensAlgorithm,
          keyId: row.tokensKeyId,
          nonce: row.tokensNonce,
          ciphertext: row.tokensCiphertext,
          authTag: row.tokensAuthTag,
        }),
        associatedData(row),
      );
      const parsed = storedTokensSchema.parse(JSON.parse(plaintext));
      if (normalizeIssuer(parsed.issuer!) !== normalizeIssuer(row.issuer)) {
        throw new McpAgentDelegationCredentialInvalidError();
      }
      return parsed as StoredOAuthTokens;
    } catch (error) {
      if (error instanceof McpAgentDelegationCredentialInvalidError) {
        throw error;
      }
      throw new McpAgentDelegationCredentialInvalidError({ cause: error });
    }
  }

  async saveTokens(
    actor: McpAgentDelegationActor,
    tokens: StoredOAuthTokens,
    issuer: string,
    lease?: McpAgentRefreshLease,
  ): Promise<McpAgentDelegation> {
    const normalizedIssuer = normalizeIssuer(issuer);
    const current = await this.repository.findActive(
      actor.userId,
      actor.organizationId,
      normalizedIssuer,
      this.config().clientId,
    );
    const previous = current
      ? await this.tokens(actor, normalizedIssuer)
      : undefined;

    const parsed = storedTokensSchema.parse({
      ...tokens,
      issuer: tokens.issuer ?? normalizedIssuer,
      ...(tokens.refresh_token === undefined && previous?.refresh_token
        ? { refresh_token: previous.refresh_token }
        : {}),
    });
    if (normalizeIssuer(parsed.issuer!) !== normalizedIssuer) {
      throw new McpAgentDelegationCredentialInvalidError();
    }

    const envelope = await this.crypto.encrypt(
      JSON.stringify(parsed),
      associatedDataForIdentity(
        actor,
        normalizedIssuer,
        this.resourceUrl(),
        this.config().clientId,
      ),
    );
    const grantedScopes = tokenScopes(parsed.scope);

    if (lease) {
      if (!current || current.id !== lease.delegationId) {
        throw new McpAgentDelegationCredentialInvalidError();
      }
      const updated = await this.repository.updateTokensUnderLease(
        lease.delegationId,
        lease.expectedRevision,
        lease.leaseOwner,
        new Date(),
        {
          grantedScopes,
          tokensFormatVersion: envelope.version,
          tokensAlgorithm: envelope.algorithm,
          tokensKeyId: envelope.keyId,
          tokensNonce: envelope.nonce,
          tokensCiphertext: envelope.ciphertext,
          tokensAuthTag: envelope.authTag,
        },
      );
      if (!updated) {
        throw new McpAgentDelegationCredentialInvalidError();
      }
      return updated;
    }

    return this.repository.upsertActive({
      userId: actor.userId,
      organizationId: actor.organizationId,
      issuer: normalizedIssuer,
      resourceUrl: this.resourceUrl(),
      oauthClientIdentity: this.config().clientId,
      grantedScopes,
      tokensFormatVersion: envelope.version,
      tokensAlgorithm: envelope.algorithm,
      tokensKeyId: envelope.keyId,
      tokensNonce: envelope.nonce,
      tokensCiphertext: envelope.ciphertext,
      tokensAuthTag: envelope.authTag,
      revision: current?.revision ?? 0,
      refreshLeaseOwner: null,
      refreshLeaseExpiresAt: null,
      revokedAt: null,
    });
  }

  async latest(
    actor: McpAgentDelegationActor,
  ): Promise<McpAgentDelegation | null> {
    const row = await this.repository.findLatestActive(
      actor.userId,
      actor.organizationId,
      this.config().clientId,
    );
    if (row) this.assertRow(row);
    return row;
  }

  async revoke(actor: McpAgentDelegationActor): Promise<boolean> {
    const row = await this.latest(actor);
    if (!row) return false;
    return this.repository.revokeActive(
      actor.userId,
      actor.organizationId,
      row.issuer,
      this.config().clientId,
    );
  }

  private assertRow(row: McpAgentDelegation): void {
    if (
      row.resourceUrl !== this.resourceUrl() ||
      row.oauthClientIdentity !== this.config().clientId
    ) {
      throw new McpAgentDelegationCredentialInvalidError();
    }
  }

  private config() {
    return this.configService.getOrThrow('mcp', { infer: true })
      .agentDelegation;
  }

  private resourceUrl(): string {
    return this.configService.getOrThrow('mcp', { infer: true }).resourceUrl;
  }
}

function tokenScopes(scope: string | undefined): McpScope[] {
  if (!scope) return [];

  const candidates = scope
    .split(/\s+/u)
    .filter(Boolean)
    .filter((value) => McpScopeSchema.safeParse(value).success);
  return normalizeMcpScopes(candidates);
}

function normalizeIssuer(issuer: string): string {
  const url = new URL(issuer);
  const isLoopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new McpAgentDelegationCredentialInvalidError();
  }
  return url.toString();
}

function associatedData(row: McpAgentDelegation) {
  return associatedDataForIdentity(
    { userId: row.userId, organizationId: row.organizationId },
    row.issuer,
    row.resourceUrl,
    row.oauthClientIdentity,
  );
}

function associatedDataForIdentity(
  actor: McpAgentDelegationActor,
  issuer: string,
  resourceUrl: string,
  clientId: string,
) {
  const recordId = createHash('sha256')
    .update([resourceUrl, issuer, clientId].join('\0'), 'utf8')
    .digest('hex');

  return {
    recordKind: 'mcp-agent-delegation-token',
    recordId,
    userId: actor.userId,
    organizationId: actor.organizationId,
    version: TOKEN_FORMAT_VERSION,
  } as const;
}
