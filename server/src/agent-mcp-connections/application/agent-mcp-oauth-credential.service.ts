import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AgentActor } from '@/agent/domain/agent-actor';
import {
  AgentMcpConnectionAuthKindMismatchError,
  AgentMcpConnectionNotFoundError,
  AgentMcpConnectionRevisionConflictError,
  AgentMcpOauthCredentialInvalidError,
} from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import type { AgentMcpCredential } from '@/agent-mcp-connections/domain/agent-mcp-credential';
import { AgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.publisher';
import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AllConfigType } from '@/config/config.type';
import {
  CredentialCryptoEnvelopeSchema,
  CredentialCryptoProvider,
} from '@/credential-crypto/credential-crypto.provider';

import type {
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client';
import {
  OAuthClientInformationFullSchema,
  OAuthClientInformationSchema,
  OAuthTokensSchema,
} from '@modelcontextprotocol/core';
import { z } from 'zod';

const OAUTH_CREDENTIAL_FORMAT_VERSION = 1;
const MAX_ISSUER_CREDENTIALS = 8;
const CAS_ATTEMPTS = 5;

const storedClientInformationSchema = z
  .union([OAuthClientInformationFullSchema, OAuthClientInformationSchema])
  .refine(
    (value) => typeof value.issuer === 'string' && value.issuer.length > 0,
    {
      message: 'OAuth client information에는 issuer가 필요합니다.',
    },
  );

const storedTokensSchema = OAuthTokensSchema.refine(
  (value) => typeof value.issuer === 'string' && value.issuer.length > 0,
  {
    message: 'OAuth token에는 issuer가 필요합니다.',
  },
);

const oauthCredentialBundleSchema = z.object({
  version: z.literal(OAUTH_CREDENTIAL_FORMAT_VERSION),
  resourceIdentity: z.url(),
  clients: z.array(storedClientInformationSchema).max(MAX_ISSUER_CREDENTIALS),
  tokens: storedTokensSchema.optional(),
});

type OauthCredentialBundle = z.infer<typeof oauthCredentialBundleSchema>;

@Injectable()
export class AgentMcpOauthCredentialService {
  constructor(
    private readonly repository: AgentMcpConnectionRepository,
    private readonly crypto: CredentialCryptoProvider,
    private readonly configService: ConfigService<AllConfigType>,
    @Optional()
    private readonly auditPublisher?: AgentMcpAuditPublisher,
  ) {}

  async clientInformation(
    actor: AgentActor,
    connectionId: string,
    issuer: string,
  ): Promise<StoredOAuthClientInformation | undefined> {
    const { bundle } = await this.load(actor, connectionId);
    if (!bundle) {
      return undefined;
    }

    const normalizedIssuer = this.normalizeIssuer(issuer);
    return bundle.clients.find(
      (client) => this.normalizeIssuer(client.issuer!) === normalizedIssuer,
    ) as StoredOAuthClientInformation | undefined;
  }

  async saveClientInformation(
    actor: AgentActor,
    connectionId: string,
    clientInformation: StoredOAuthClientInformation,
    issuer: string,
  ): Promise<void> {
    const normalizedIssuer = this.normalizeIssuer(issuer);
    const parsed = this.parseClientInformation({
      ...clientInformation,
      issuer: clientInformation.issuer ?? normalizedIssuer,
    });
    if (this.normalizeIssuer(parsed.issuer!) !== normalizedIssuer) {
      throw new AgentMcpOauthCredentialInvalidError();
    }

    await this.mutate(actor, connectionId, ({ bundle }) => {
      const clients = bundle.clients.filter(
        (client) => this.normalizeIssuer(client.issuer!) !== normalizedIssuer,
      );
      clients.push(parsed);
      if (clients.length > MAX_ISSUER_CREDENTIALS) {
        throw new AgentMcpOauthCredentialInvalidError();
      }
      return { ...bundle, clients };
    });
  }

  async tokens(
    actor: AgentActor,
    connectionId: string,
    issuer?: string,
  ): Promise<StoredOAuthTokens | undefined> {
    const { bundle } = await this.load(actor, connectionId);
    if (!bundle?.tokens) {
      return undefined;
    }
    if (
      issuer &&
      this.normalizeIssuer(bundle.tokens.issuer!) !==
        this.normalizeIssuer(issuer)
    ) {
      return undefined;
    }
    return bundle.tokens as StoredOAuthTokens;
  }

  async saveTokens(
    actor: AgentActor,
    connectionId: string,
    tokens: StoredOAuthTokens,
    issuer: string,
  ): Promise<void> {
    const normalizedIssuer = this.normalizeIssuer(issuer);
    const now = new Date();

    await this.mutate(actor, connectionId, ({ bundle, credential }) => {
      const parsed = storedTokensSchema.parse({
        ...tokens,
        issuer: tokens.issuer ?? normalizedIssuer,
        ...(tokens.refresh_token === undefined &&
        bundle.tokens?.refresh_token !== undefined &&
        this.normalizeIssuer(bundle.tokens.issuer!) === normalizedIssuer
          ? { refresh_token: bundle.tokens.refresh_token }
          : {}),
      });
      if (this.normalizeIssuer(parsed.issuer!) !== normalizedIssuer) {
        throw new AgentMcpOauthCredentialInvalidError();
      }

      return {
        bundle: { ...bundle, tokens: parsed },
        expiresAt: this.expiresAt(parsed.expires_in, now),
        refreshedAt: credential ? now : null,
      };
    });
  }

  async hasAccessToken(
    actor: AgentActor,
    connectionId: string,
  ): Promise<boolean> {
    return Boolean((await this.tokens(actor, connectionId))?.access_token);
  }

  async invalidate(
    actor: AgentActor,
    connectionId: string,
    scope: 'client' | 'tokens' | 'all',
  ): Promise<void> {
    const { bundle } = await this.load(actor, connectionId);
    if (!bundle) {
      return;
    }

    await this.mutate(actor, connectionId, ({ bundle: current }) => {
      if (scope === 'client') {
        return { bundle: { ...current, clients: [] } };
      }
      if (scope === 'tokens') {
        const { tokens: _tokens, ...withoutTokens } = current;
        return {
          bundle: withoutTokens,
          expiresAt: null,
        };
      }
      return {
        bundle: this.emptyBundle(current.resourceIdentity),
        expiresAt: null,
        refreshedAt: null,
      };
    });
    await this.publishAudit({
      name: 'agent_mcp.credential.revoked',
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      connectionId,
      resultCode: 'ok',
      authKind: 'oauth',
    });
  }

  private async publishAudit(
    event: Parameters<AgentMcpAuditPublisher['publish']>[0],
  ): Promise<void> {
    try {
      await this.auditPublisher?.publish(event);
    } catch {
      // audit sink failure는 credential invalidation 결과를 바꾸지 않는다.
    }
  }

  private async mutate(
    actor: AgentActor,
    connectionId: string,
    mutate:
      | ((context: {
          bundle: OauthCredentialBundle;
          credential: AgentMcpCredential | null;
        }) => OauthCredentialBundle)
      | ((context: {
          bundle: OauthCredentialBundle;
          credential: AgentMcpCredential | null;
        }) => {
          bundle: OauthCredentialBundle;
          expiresAt?: Date | null;
          refreshedAt?: Date | null;
        }),
  ): Promise<void> {
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
      const { connection, credential, bundle } = await this.load(
        actor,
        connectionId,
      );
      const next = mutate({
        bundle: bundle ?? this.emptyBundle(connection.endpoint),
        credential,
      });
      const nextBundle = 'bundle' in next ? next.bundle : next;
      const serialized = this.serializeBounded(nextBundle);
      const envelope = await this.crypto.encrypt(
        serialized,
        this.associatedData(actor, connectionId),
      );
      const saved = await this.repository.replaceCredentialIfRevision(
        actor.userId,
        actor.organizationId,
        {
          connectionId,
          formatVersion: envelope.version,
          algorithm: envelope.algorithm,
          keyId: envelope.keyId,
          nonce: envelope.nonce,
          ciphertext: envelope.ciphertext,
          authTag: envelope.authTag,
          expiresAt:
            'bundle' in next
              ? (next.expiresAt ?? credential?.expiresAt)
              : credential?.expiresAt,
          refreshedAt:
            'bundle' in next
              ? (next.refreshedAt ?? credential?.refreshedAt)
              : credential?.refreshedAt,
        },
        credential?.revision ?? null,
      );
      if (saved) {
        return;
      }
    }

    throw new AgentMcpConnectionRevisionConflictError();
  }

  private async load(
    actor: AgentActor,
    connectionId: string,
  ): Promise<{
    connection: Awaited<
      ReturnType<AgentMcpConnectionRepository['findOwned']>
    > & {};
    credential: AgentMcpCredential | null;
    bundle: OauthCredentialBundle | null;
  }> {
    const connection = await this.repository.findOwned(
      actor.userId,
      actor.organizationId,
      connectionId,
    );
    if (!connection) {
      throw new AgentMcpConnectionNotFoundError();
    }
    if (connection.authKind !== 'oauth') {
      throw new AgentMcpConnectionAuthKindMismatchError();
    }

    const credential = await this.repository.findCredentialForOwnedConnection(
      actor.userId,
      actor.organizationId,
      connectionId,
    );
    if (!credential) {
      return { connection, credential: null, bundle: null };
    }

    try {
      const envelope = CredentialCryptoEnvelopeSchema.parse({
        version: credential.formatVersion,
        algorithm: credential.algorithm,
        keyId: credential.keyId,
        nonce: credential.nonce,
        ciphertext: credential.ciphertext,
        authTag: credential.authTag,
      });
      const plaintext = await this.crypto.decrypt(
        envelope,
        this.associatedData(actor, connectionId),
      );
      const bundle = oauthCredentialBundleSchema.parse(JSON.parse(plaintext));
      if (new URL(bundle.resourceIdentity).toString() !== connection.endpoint) {
        throw new AgentMcpOauthCredentialInvalidError();
      }
      return { connection, credential, bundle };
    } catch (error) {
      if (error instanceof AgentMcpOauthCredentialInvalidError) {
        throw error;
      }
      throw new AgentMcpOauthCredentialInvalidError({ cause: error });
    }
  }

  private emptyBundle(resourceIdentity: string): OauthCredentialBundle {
    return oauthCredentialBundleSchema.parse({
      version: OAUTH_CREDENTIAL_FORMAT_VERSION,
      resourceIdentity,
      clients: [],
    });
  }

  private parseClientInformation(
    input: unknown,
  ): z.infer<typeof storedClientInformationSchema> {
    const full = OAuthClientInformationFullSchema.safeParse(input);
    if (full.success) {
      return storedClientInformationSchema.parse(full.data);
    }
    return storedClientInformationSchema.parse(
      OAuthClientInformationSchema.parse(input),
    );
  }

  private serializeBounded(bundle: OauthCredentialBundle): string {
    const parsed = oauthCredentialBundleSchema.parse(bundle);
    const serialized = JSON.stringify(parsed);
    const maximum = this.configService.getOrThrow('agentMcpConnections', {
      infer: true,
    }).maxResponseBytes;
    if (Buffer.byteLength(serialized, 'utf8') > maximum) {
      throw new AgentMcpOauthCredentialInvalidError();
    }
    return serialized;
  }

  private normalizeIssuer(issuer: string): string {
    const url = new URL(issuer);
    if (url.protocol !== 'https:') {
      throw new AgentMcpOauthCredentialInvalidError();
    }
    return url.toString();
  }

  private expiresAt(expiresIn: number | undefined, now: Date): Date | null {
    if (
      expiresIn === undefined ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      return null;
    }
    const timestamp = now.getTime() + expiresIn * 1_000;
    if (!Number.isSafeInteger(timestamp)) {
      return null;
    }
    return new Date(timestamp);
  }

  private associatedData(actor: AgentActor, connectionId: string) {
    return {
      recordKind: 'agent-mcp-oauth-credential',
      recordId: connectionId,
      userId: actor.userId,
      organizationId: actor.organizationId,
      version: OAUTH_CREDENTIAL_FORMAT_VERSION,
    } as const;
  }
}
