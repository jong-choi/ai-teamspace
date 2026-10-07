import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import {
  CredentialCryptoEnvelopeSchema,
  CredentialCryptoProvider,
} from '@/credential-crypto/credential-crypto.provider';
import { MCP_SCOPES } from '@/mcp/contracts/mcp-scope';
import type { McpAgentOauthFlow } from '@/mcp-agent-delegations/domain/mcp-agent-oauth-flow';
import { McpAgentOauthFlowRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-oauth-flow.repository';
import { McpAgentDelegationFlowInvalidError } from '@/mcp-agent-delegations/mcp-agent-delegation.error';

import type { OAuthDiscoveryState } from '@modelcontextprotocol/client';
import { z } from 'zod';

const FLOW_FORMAT_VERSION = 1;

const oauthDiscoveryStateSchema = z.object({
  authorizationServerUrl: z.url(),
  authorizationServerMetadata: z.json().optional(),
  resourceMetadata: z.json().optional(),
  resourceMetadataUrl: z.url().optional(),
});

export type McpAgentDelegationActor = {
  userId: string;
  organizationId: string;
};

@Injectable()
export class McpAgentOauthFlowService {
  constructor(
    private readonly repository: McpAgentOauthFlowRepository,
    private readonly crypto: CredentialCryptoProvider,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async create(
    actor: McpAgentDelegationActor,
    returnTo: string,
    completionUrl: string,
  ): Promise<{ flow: McpAgentOauthFlow; state: string }> {
    const config = this.config();
    const state = randomBytes(32).toString('base64url');
    const now = Date.now();
    const flow = await this.repository.create({
      userId: actor.userId,
      organizationId: actor.organizationId,
      oauthClientIdentity: config.clientId,
      issuer: null,
      stateHash: hashState(state),
      requestedScopes: [...MCP_SCOPES],
      resourceUrl: this.resourceUrl(),
      redirectUrl: config.redirectUrl,
      returnTo,
      completionUrl,
      expiresAt: new Date(now + config.flowTtlSeconds * 1_000),
    });

    return { flow, state };
  }

  async resolveCallback(state: string): Promise<McpAgentOauthFlow> {
    const stateHash = hashState(state);
    const flow = await this.repository.findActiveByStateHash(
      stateHash,
      new Date(),
    );
    if (!flow || !hashesMatch(flow.stateHash, stateHash)) {
      throw new McpAgentDelegationFlowInvalidError();
    }
    this.assertCanonicalFlow(flow);
    return flow;
  }

  async saveCodeVerifier(
    flow: McpAgentOauthFlow,
    codeVerifier: string,
  ): Promise<void> {
    this.assertCanonicalFlow(flow);
    const envelope = await this.crypto.encrypt(
      codeVerifier,
      associatedData(flow, 'mcp-agent-oauth-verifier'),
    );
    const saved = await this.repository.saveVerifierIfAbsent(
      flow.id,
      flow.userId,
      flow.organizationId,
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
      throw new McpAgentDelegationFlowInvalidError();
    }
  }

  async codeVerifier(flow: McpAgentOauthFlow): Promise<string> {
    const current = await this.requireActive(flow);
    if (
      current.verifierFormatVersion === null ||
      current.verifierAlgorithm === null ||
      current.verifierKeyId === null ||
      current.verifierNonce === null ||
      current.verifierCiphertext === null ||
      current.verifierAuthTag === null
    ) {
      throw new McpAgentDelegationFlowInvalidError();
    }

    return this.crypto.decrypt(
      CredentialCryptoEnvelopeSchema.parse({
        version: current.verifierFormatVersion,
        algorithm: current.verifierAlgorithm,
        keyId: current.verifierKeyId,
        nonce: current.verifierNonce,
        ciphertext: current.verifierCiphertext,
        authTag: current.verifierAuthTag,
      }),
      associatedData(current, 'mcp-agent-oauth-verifier'),
    );
  }

  async saveDiscoveryState(
    flow: McpAgentOauthFlow,
    state: OAuthDiscoveryState,
  ): Promise<void> {
    const current = await this.requireActive(flow);
    const parsed = oauthDiscoveryStateSchema.parse(
      JSON.parse(JSON.stringify(state)),
    );
    const serialized = JSON.stringify(parsed);
    const envelope = await this.crypto.encrypt(
      serialized,
      associatedData(current, 'mcp-agent-oauth-discovery'),
    );
    const saved = await this.repository.saveDiscovery(
      current.id,
      current.userId,
      current.organizationId,
      new Date(),
      {
        issuer: new URL(parsed.authorizationServerUrl).toString(),
        discoveryFormatVersion: envelope.version,
        discoveryAlgorithm: envelope.algorithm,
        discoveryKeyId: envelope.keyId,
        discoveryNonce: envelope.nonce,
        discoveryCiphertext: envelope.ciphertext,
        discoveryAuthTag: envelope.authTag,
      },
    );
    if (!saved) {
      throw new McpAgentDelegationFlowInvalidError();
    }
  }

  async discoveryState(
    flow: McpAgentOauthFlow,
  ): Promise<OAuthDiscoveryState | undefined> {
    const current = await this.requireActive(flow);
    if (
      current.issuer === null ||
      current.discoveryFormatVersion === null ||
      current.discoveryAlgorithm === null ||
      current.discoveryKeyId === null ||
      current.discoveryNonce === null ||
      current.discoveryCiphertext === null ||
      current.discoveryAuthTag === null
    ) {
      return undefined;
    }

    const plaintext = await this.crypto.decrypt(
      CredentialCryptoEnvelopeSchema.parse({
        version: current.discoveryFormatVersion,
        algorithm: current.discoveryAlgorithm,
        keyId: current.discoveryKeyId,
        nonce: current.discoveryNonce,
        ciphertext: current.discoveryCiphertext,
        authTag: current.discoveryAuthTag,
      }),
      associatedData(current, 'mcp-agent-oauth-discovery'),
    );
    const parsed = oauthDiscoveryStateSchema.parse(JSON.parse(plaintext));
    if (
      new URL(parsed.authorizationServerUrl).toString() !==
      new URL(current.issuer).toString()
    ) {
      throw new McpAgentDelegationFlowInvalidError();
    }
    return parsed as OAuthDiscoveryState;
  }

  async consume(flow: McpAgentOauthFlow): Promise<void> {
    const consumed = await this.repository.consume(
      flow.id,
      flow.userId,
      flow.organizationId,
      new Date(),
    );
    if (!consumed) {
      throw new McpAgentDelegationFlowInvalidError();
    }
  }

  private async requireActive(
    flow: McpAgentOauthFlow,
  ): Promise<McpAgentOauthFlow> {
    const current = await this.repository.findActiveById(
      flow.id,
      flow.userId,
      flow.organizationId,
      new Date(),
    );
    if (!current) {
      throw new McpAgentDelegationFlowInvalidError();
    }
    this.assertCanonicalFlow(current);
    return current;
  }

  private assertCanonicalFlow(flow: McpAgentOauthFlow): void {
    const config = this.config();
    if (
      flow.oauthClientIdentity !== config.clientId ||
      flow.resourceUrl !== this.resourceUrl() ||
      flow.redirectUrl !== config.redirectUrl
    ) {
      throw new McpAgentDelegationFlowInvalidError();
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

function hashState(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}

function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function associatedData(
  flow: McpAgentOauthFlow,
  recordKind: 'mcp-agent-oauth-verifier' | 'mcp-agent-oauth-discovery',
) {
  return {
    recordKind,
    recordId: flow.id,
    userId: flow.userId,
    organizationId: flow.organizationId,
    version: FLOW_FORMAT_VERSION,
  } as const;
}
