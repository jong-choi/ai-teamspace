import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AgentActor } from '@/agent/domain/agent-actor';
import {
  AgentMcpConnectionAuthKindMismatchError,
  AgentMcpConnectionNotFoundError,
  AgentMcpOauthStateInvalidError,
} from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import type { AgentMcpOauthState } from '@/agent-mcp-connections/domain/agent-mcp-oauth-state';
import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AllConfigType } from '@/config/config.type';
import {
  CredentialCryptoEnvelopeSchema,
  CredentialCryptoProvider,
} from '@/credential-crypto/credential-crypto.provider';

import type { OAuthDiscoveryState } from '@modelcontextprotocol/client';
import { z } from 'zod';

const OAUTH_STATE_TTL_MS = 10 * 60_000;
const OAUTH_STATE_FORMAT_VERSION = 1;
const oauthDiscoveryStateSchema = z.object({
  authorizationServerUrl: z.url(),
  authorizationServerMetadata: z.json().optional(),
  resourceMetadata: z.json().optional(),
  resourceMetadataUrl: z.url().optional(),
});

@Injectable()
export class AgentMcpOauthStateService {
  constructor(
    private readonly repository: AgentMcpConnectionRepository,
    private readonly crypto: CredentialCryptoProvider,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async createState(
    actor: AgentActor,
    connectionId: string,
    redirectUri: string,
  ): Promise<{ state: string; expiresAt: Date }> {
    const connection = await this.requireOauthConnection(actor, connectionId);
    const state = randomBytes(32).toString('base64url');
    const stateHash = this.hashState(state);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_MS);
    const normalizedRedirectUri = new URL(redirectUri).toString();

    const created = await this.repository.createOAuthState({
      stateHash,
      connectionId,
      ownerUserId: actor.userId,
      organizationId: actor.organizationId,
      resourceIdentity: connection.endpoint,
      redirectUri: normalizedRedirectUri,
      expiresAt,
    });
    if (!created) {
      throw new AgentMcpConnectionNotFoundError();
    }

    return { state, expiresAt };
  }

  async resolveCallbackState(
    actor: AgentActor,
    state: string,
    redirectUri: string,
  ): Promise<AgentMcpOauthState> {
    const stateHash = this.hashState(state);
    const active = await this.repository.findActiveOAuthStateByHash(
      actor.userId,
      actor.organizationId,
      stateHash,
      new Date(),
    );
    if (!active || !this.hashesMatch(active.stateHash, stateHash)) {
      throw new AgentMcpOauthStateInvalidError();
    }

    const connection = await this.requireOauthConnection(
      actor,
      active.connectionId,
    );
    if (
      active.resourceIdentity !== connection.endpoint ||
      active.redirectUri !== new URL(redirectUri).toString()
    ) {
      throw new AgentMcpOauthStateInvalidError();
    }
    return active;
  }

  async saveCodeVerifier(
    actor: AgentActor,
    connectionId: string,
    state: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<void> {
    const active = await this.requireActiveState(
      actor,
      connectionId,
      state,
      redirectUri,
    );
    const envelope = await this.crypto.encrypt(
      codeVerifier,
      this.associatedData(actor, active.stateHash),
    );
    const saved = await this.repository.saveOAuthStateVerifier(
      actor.userId,
      actor.organizationId,
      connectionId,
      active.stateHash,
      new Date(),
      {
        verifierFormatVersion: envelope.version,
        verifierAlgorithm: envelope.algorithm,
        verifierKeyId: envelope.keyId,
        verifierNonce: envelope.nonce,
        verifierCiphertext: envelope.ciphertext,
        verifierAuthTag: envelope.authTag,
      },
    );

    if (!saved) {
      throw new AgentMcpOauthStateInvalidError();
    }
  }

  async codeVerifier(
    actor: AgentActor,
    connectionId: string,
    state: string,
    redirectUri: string,
  ): Promise<string> {
    const active = await this.requireActiveState(
      actor,
      connectionId,
      state,
      redirectUri,
    );
    if (
      active.verifierFormatVersion === null ||
      active.verifierAlgorithm === null ||
      active.verifierKeyId === null ||
      active.verifierNonce === null ||
      active.verifierCiphertext === null ||
      active.verifierAuthTag === null
    ) {
      throw new AgentMcpOauthStateInvalidError();
    }

    const envelope = CredentialCryptoEnvelopeSchema.parse({
      version: active.verifierFormatVersion,
      algorithm: active.verifierAlgorithm,
      keyId: active.verifierKeyId,
      nonce: active.verifierNonce,
      ciphertext: active.verifierCiphertext,
      authTag: active.verifierAuthTag,
    });
    return this.crypto.decrypt(
      envelope,
      this.associatedData(actor, active.stateHash),
    );
  }

  async saveDiscoveryState(
    actor: AgentActor,
    connectionId: string,
    state: string,
    redirectUri: string,
    discoveryState: OAuthDiscoveryState,
  ): Promise<void> {
    const active = await this.requireActiveState(
      actor,
      connectionId,
      state,
      redirectUri,
    );
    const normalized = oauthDiscoveryStateSchema.parse(
      JSON.parse(JSON.stringify(discoveryState)),
    );
    const serialized = JSON.stringify(normalized);
    const maxResponseBytes = this.configService.getOrThrow(
      'agentMcpConnections',
      { infer: true },
    ).maxResponseBytes;
    if (Buffer.byteLength(serialized, 'utf8') > maxResponseBytes) {
      throw new AgentMcpOauthStateInvalidError();
    }

    const envelope = await this.crypto.encrypt(
      serialized,
      this.discoveryAssociatedData(actor, active.stateHash),
    );
    const saved = await this.repository.saveOAuthStateDiscovery(
      actor.userId,
      actor.organizationId,
      connectionId,
      active.stateHash,
      new Date(),
      {
        authorizationServer: new URL(
          normalized.authorizationServerUrl,
        ).toString(),
        discoveryFormatVersion: envelope.version,
        discoveryAlgorithm: envelope.algorithm,
        discoveryKeyId: envelope.keyId,
        discoveryNonce: envelope.nonce,
        discoveryCiphertext: envelope.ciphertext,
        discoveryAuthTag: envelope.authTag,
      },
    );
    if (!saved) {
      throw new AgentMcpOauthStateInvalidError();
    }
  }

  async discoveryState(
    actor: AgentActor,
    connectionId: string,
    state: string,
    redirectUri: string,
  ): Promise<OAuthDiscoveryState> {
    const active = await this.requireActiveState(
      actor,
      connectionId,
      state,
      redirectUri,
    );
    if (
      active.authorizationServer === null ||
      active.discoveryFormatVersion === null ||
      active.discoveryAlgorithm === null ||
      active.discoveryKeyId === null ||
      active.discoveryNonce === null ||
      active.discoveryCiphertext === null ||
      active.discoveryAuthTag === null
    ) {
      throw new AgentMcpOauthStateInvalidError();
    }

    const envelope = CredentialCryptoEnvelopeSchema.parse({
      version: active.discoveryFormatVersion,
      algorithm: active.discoveryAlgorithm,
      keyId: active.discoveryKeyId,
      nonce: active.discoveryNonce,
      ciphertext: active.discoveryCiphertext,
      authTag: active.discoveryAuthTag,
    });
    const plaintext = await this.crypto.decrypt(
      envelope,
      this.discoveryAssociatedData(actor, active.stateHash),
    );
    const parsed = oauthDiscoveryStateSchema.parse(JSON.parse(plaintext));
    if (
      new URL(parsed.authorizationServerUrl).toString() !==
      active.authorizationServer
    ) {
      throw new AgentMcpOauthStateInvalidError();
    }

    return parsed as OAuthDiscoveryState;
  }

  async consumeState(
    actor: AgentActor,
    connectionId: string,
    state: string,
    redirectUri: string,
  ): Promise<AgentMcpOauthState> {
    const active = await this.requireActiveState(
      actor,
      connectionId,
      state,
      redirectUri,
    );
    const consumed = await this.repository.consumeOAuthState(
      actor.userId,
      actor.organizationId,
      connectionId,
      active.stateHash,
      new Date(),
    );
    if (!consumed) {
      throw new AgentMcpOauthStateInvalidError();
    }
    return consumed;
  }

  private async requireActiveState(
    actor: AgentActor,
    connectionId: string,
    rawState: string,
    redirectUri: string,
  ): Promise<AgentMcpOauthState> {
    const connection = await this.requireOauthConnection(actor, connectionId);
    const stateHash = this.hashState(rawState);
    const active = await this.repository.findActiveOAuthState(
      actor.userId,
      actor.organizationId,
      connectionId,
      stateHash,
      new Date(),
    );
    if (
      !active ||
      active.resourceIdentity !== connection.endpoint ||
      active.redirectUri !== new URL(redirectUri).toString()
    ) {
      throw new AgentMcpOauthStateInvalidError();
    }

    return active;
  }

  private async requireOauthConnection(
    actor: AgentActor,
    connectionId: string,
  ) {
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
    return connection;
  }

  private hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }

  private hashesMatch(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left, 'hex');
    const rightBytes = Buffer.from(right, 'hex');
    return (
      leftBytes.length === rightBytes.length &&
      timingSafeEqual(leftBytes, rightBytes)
    );
  }

  private associatedData(actor: AgentActor, stateHash: string) {
    return {
      recordKind: 'agent-mcp-oauth-pkce',
      recordId: stateHash,
      userId: actor.userId,
      organizationId: actor.organizationId,
      version: OAUTH_STATE_FORMAT_VERSION,
    } as const;
  }

  private discoveryAssociatedData(actor: AgentActor, stateHash: string) {
    return {
      recordKind: 'agent-mcp-oauth-discovery',
      recordId: stateHash,
      userId: actor.userId,
      organizationId: actor.organizationId,
      version: OAUTH_STATE_FORMAT_VERSION,
    } as const;
  }
}
