import { Injectable, Optional } from '@nestjs/common';

import type { AgentActor } from '@/agent/domain/agent-actor';
import {
  AgentMcpConnectionAuthKindMismatchError,
  AgentMcpConnectionNotFoundError,
} from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import { AgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.publisher';
import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import {
  CredentialCryptoEnvelopeSchema,
  CredentialCryptoProvider,
} from '@/credential-crypto/credential-crypto.provider';

const CREDENTIAL_FORMAT_VERSION = 1;

@Injectable()
export class AgentMcpCredentialService {
  constructor(
    private readonly repository: AgentMcpConnectionRepository,
    private readonly crypto: CredentialCryptoProvider,
    @Optional()
    private readonly auditPublisher?: AgentMcpAuditPublisher,
  ) {}

  async saveBearerToken(
    actor: AgentActor,
    connectionId: string,
    token: string,
  ): Promise<void> {
    const connection = await this.repository.findOwned(
      actor.userId,
      actor.organizationId,
      connectionId,
    );
    if (!connection) {
      throw new AgentMcpConnectionNotFoundError();
    }
    if (connection.authKind !== 'bearer') {
      throw new AgentMcpConnectionAuthKindMismatchError();
    }

    const envelope = await this.crypto.encrypt(
      token,
      this.associatedData(actor, connectionId),
    );
    await this.repository.saveCredential({
      connectionId,
      formatVersion: envelope.version,
      algorithm: envelope.algorithm,
      keyId: envelope.keyId,
      nonce: envelope.nonce,
      ciphertext: envelope.ciphertext,
      authTag: envelope.authTag,
    });
    await this.publishAudit({
      name: 'agent_mcp.credential.replaced',
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      connectionId,
      resultCode: 'ok',
      authKind: connection.authKind,
    });
  }

  async getBearerToken(
    actor: AgentActor,
    connectionId: string,
  ): Promise<string | null> {
    const connection = await this.repository.findOwned(
      actor.userId,
      actor.organizationId,
      connectionId,
    );
    if (!connection) {
      return null;
    }
    if (connection.authKind !== 'bearer') {
      throw new AgentMcpConnectionAuthKindMismatchError();
    }

    const credential = await this.repository.findCredentialForOwnedConnection(
      actor.userId,
      actor.organizationId,
      connectionId,
    );
    if (!credential) {
      return null;
    }

    const envelope = CredentialCryptoEnvelopeSchema.parse({
      version: credential.formatVersion,
      algorithm: credential.algorithm,
      keyId: credential.keyId,
      nonce: credential.nonce,
      ciphertext: credential.ciphertext,
      authTag: credential.authTag,
    });

    return this.crypto.decrypt(
      envelope,
      this.associatedData(actor, connectionId),
    );
  }

  private async publishAudit(
    event: Parameters<AgentMcpAuditPublisher['publish']>[0],
  ): Promise<void> {
    try {
      await this.auditPublisher?.publish(event);
    } catch {
      // audit sink failure는 credential persistence 결과를 바꾸지 않는다.
    }
  }

  private associatedData(actor: AgentActor, connectionId: string) {
    return {
      recordKind: 'agent-mcp-credential',
      recordId: connectionId,
      userId: actor.userId,
      organizationId: actor.organizationId,
      version: CREDENTIAL_FORMAT_VERSION,
    } as const;
  }
}
