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

/** OAuth client provider가 PKCE verifier와 discovery state를 읽고 쓰는 flow 저장 경계다. */
export type McpAgentOauthFlowStore = Pick<
  McpAgentOauthFlowService,
  | 'saveCodeVerifier'
  | 'codeVerifier'
  | 'saveDiscoveryState'
  | 'discoveryState'
  | 'consume'
>;

/**
 * token 교환 전에 선점한 callback flow다.
 *
 * flow row는 이미 consume되어 다시 읽을 수 없으므로 선점 직전에 복호화한 PKCE verifier와
 * discovery state를 메모리에서 제공한다. 같은 callback의 다른 요청은 선점에 실패해 token 교환을 하지 않는다.
 */
export class ClaimedMcpAgentOauthCallback implements McpAgentOauthFlowStore {
  constructor(
    readonly flow: McpAgentOauthFlow,
    private readonly claimedCodeVerifier: string,
    private claimedDiscoveryState: OAuthDiscoveryState | undefined,
  ) {}

  saveCodeVerifier(): Promise<void> {
    // callback 처리 중 새 authorization을 시작하지 않는다.
    return Promise.reject(new McpAgentDelegationFlowInvalidError());
  }

  codeVerifier(): Promise<string> {
    return Promise.resolve(this.claimedCodeVerifier);
  }

  saveDiscoveryState(
    _flow: McpAgentOauthFlow,
    state: OAuthDiscoveryState,
  ): Promise<void> {
    this.claimedDiscoveryState = state;
    return Promise.resolve();
  }

  discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    return Promise.resolve(this.claimedDiscoveryState);
  }

  consume(): Promise<void> {
    // 선점할 때 이미 consume했다.
    return Promise.resolve();
  }
}

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

  /**
   * callback flow를 token 교환 전에 원자적으로 consume해 같은 state의 동시·재전송 요청 중 하나만 처리한다.
   * 실패한 callback도 flow를 소진하므로 재시도는 새 delegation start가 필요하다.
   */
  async claimCallback(state: string): Promise<ClaimedMcpAgentOauthCallback> {
    const flow = await this.resolveCallback(state);
    const codeVerifier = await this.codeVerifier(flow);
    const discoveryState = await this.discoveryState(flow);
    await this.consume(flow);
    return new ClaimedMcpAgentOauthCallback(flow, codeVerifier, discoveryState);
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
