import { Injectable } from '@nestjs/common';

import {
  type AgentMcpConnection,
  AgentMcpConnectionSchema,
} from '@/agent-mcp-connections/domain/agent-mcp-connection';
import type { AgentMcpLastErrorCategory } from '@/agent-mcp-connections/domain/agent-mcp-connection-health';
import { AgentMcpConnectionToolSchema } from '@/agent-mcp-connections/domain/agent-mcp-connection-tool';
import { AgentMcpCredentialSchema } from '@/agent-mcp-connections/domain/agent-mcp-credential';
import { AgentMcpOauthStateSchema } from '@/agent-mcp-connections/domain/agent-mcp-oauth-state';
import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import { agentMcpConnection } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.schema';
import {
  agentMcpConnectionInsertSchema,
  agentMcpConnectionMutableSchema,
} from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.zod';
import { agentMcpConnectionTool } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection-tool.schema';
import { agentMcpConnectionToolPolicyInputSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection-tool.zod';
import { agentMcpCredential } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-credential.schema';
import { agentMcpCredentialInsertSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-credential.zod';
import { agentMcpOauthState } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-oauth-state.schema';
import {
  agentMcpOauthStateDiscoveryUpdateSchema,
  agentMcpOauthStateInsertSchema,
  agentMcpOauthStateVerifierUpdateSchema,
} from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-oauth-state.zod';
import { DatabaseService } from '@/database/database.service';

import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { z } from 'zod';

@Injectable()
export class AgentMcpConnectionDrizzleRepository extends AgentMcpConnectionRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async createPendingConnection(
    input: z.input<typeof agentMcpConnectionInsertSchema>,
  ) {
    const parsed = agentMcpConnectionInsertSchema.parse({
      ...input,
      enabled: false,
      revision: 0,
    });
    const [row] = await this.database.db
      .insert(agentMcpConnection)
      .values(parsed)
      .returning();

    if (!row) {
      throw new Error('외부 MCP connection 생성 결과가 없습니다.');
    }
    return AgentMcpConnectionSchema.parse(row);
  }

  async findOwned(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
  ) {
    const [row] = await this.database.db
      .select()
      .from(agentMcpConnection)
      .where(
        and(
          eq(agentMcpConnection.id, connectionId),
          eq(agentMcpConnection.ownerUserId, ownerUserId),
          eq(agentMcpConnection.organizationId, organizationId),
        ),
      )
      .limit(1);

    return row ? AgentMcpConnectionSchema.parse(row) : null;
  }

  async listOwned(ownerUserId: string, organizationId: string) {
    const rows = await this.database.db
      .select()
      .from(agentMcpConnection)
      .where(
        and(
          eq(agentMcpConnection.ownerUserId, ownerUserId),
          eq(agentMcpConnection.organizationId, organizationId),
        ),
      )
      .orderBy(desc(agentMcpConnection.updatedAt), asc(agentMcpConnection.id));

    return rows.map((row) => AgentMcpConnectionSchema.parse(row));
  }

  async listEnabledForActor(ownerUserId: string, organizationId: string) {
    const rows = await this.database.db
      .select()
      .from(agentMcpConnection)
      .where(
        and(
          eq(agentMcpConnection.ownerUserId, ownerUserId),
          eq(agentMcpConnection.organizationId, organizationId),
          eq(agentMcpConnection.enabled, true),
        ),
      )
      .orderBy(asc(agentMcpConnection.id));

    return rows.map((row) => AgentMcpConnectionSchema.parse(row));
  }

  async updateIfRevision(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    expectedRevision: number,
    patch: z.input<typeof agentMcpConnectionMutableSchema>,
  ) {
    const parsedPatch = agentMcpConnectionMutableSchema.parse(patch);
    const [row] = await this.database.db
      .update(agentMcpConnection)
      .set({
        ...parsedPatch,
        revision: sql`${agentMcpConnection.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(agentMcpConnection.id, connectionId),
          eq(agentMcpConnection.ownerUserId, ownerUserId),
          eq(agentMcpConnection.organizationId, organizationId),
          eq(agentMcpConnection.revision, expectedRevision),
        ),
      )
      .returning();

    return row ? AgentMcpConnectionSchema.parse(row) : null;
  }

  async removeOwned(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    expectedRevision: number,
  ) {
    const rows = await this.database.db
      .delete(agentMcpConnection)
      .where(
        and(
          eq(agentMcpConnection.id, connectionId),
          eq(agentMcpConnection.ownerUserId, ownerUserId),
          eq(agentMcpConnection.organizationId, organizationId),
          eq(agentMcpConnection.revision, expectedRevision),
        ),
      )
      .returning({ id: agentMcpConnection.id });

    return rows.length > 0;
  }

  async updateSecurityBoundaryIfRevision(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    expectedRevision: number,
    patch: z.input<typeof agentMcpConnectionMutableSchema>,
  ) {
    const parsedPatch = agentMcpConnectionMutableSchema.parse(patch);
    return this.database.db.transaction(async (transaction) => {
      const [row] = await transaction
        .update(agentMcpConnection)
        .set({
          ...parsedPatch,
          lastTestedAt: null,
          lastErrorCategory: null,
          revision: sql`${agentMcpConnection.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agentMcpConnection.id, connectionId),
            eq(agentMcpConnection.ownerUserId, ownerUserId),
            eq(agentMcpConnection.organizationId, organizationId),
            eq(agentMcpConnection.revision, expectedRevision),
          ),
        )
        .returning();

      if (!row) {
        return null;
      }

      await transaction
        .delete(agentMcpOauthState)
        .where(eq(agentMcpOauthState.connectionId, connectionId));
      await transaction
        .delete(agentMcpCredential)
        .where(eq(agentMcpCredential.connectionId, connectionId));
      await transaction
        .delete(agentMcpConnectionTool)
        .where(eq(agentMcpConnectionTool.connectionId, connectionId));

      return AgentMcpConnectionSchema.parse(row);
    });
  }

  async recordHealth(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    testedAt: Date,
    errorCategory: AgentMcpLastErrorCategory | null,
  ) {
    const [row] = await this.database.db
      .update(agentMcpConnection)
      .set({
        lastTestedAt: testedAt,
        lastErrorCategory: errorCategory,
      })
      .where(
        and(
          eq(agentMcpConnection.id, connectionId),
          eq(agentMcpConnection.ownerUserId, ownerUserId),
          eq(agentMcpConnection.organizationId, organizationId),
        ),
      )
      .returning();

    return row ? AgentMcpConnectionSchema.parse(row) : null;
  }

  async saveCredential(
    input: z.input<typeof agentMcpCredentialInsertSchema>,
  ): Promise<void> {
    const parsed = agentMcpCredentialInsertSchema.parse(input);
    await this.database.db
      .insert(agentMcpCredential)
      .values(parsed)
      .onConflictDoUpdate({
        target: agentMcpCredential.connectionId,
        set: {
          formatVersion: parsed.formatVersion ?? 1,
          algorithm: parsed.algorithm,
          keyId: parsed.keyId,
          nonce: parsed.nonce,
          ciphertext: parsed.ciphertext,
          authTag: parsed.authTag,
          revision: sql`${agentMcpCredential.revision} + 1`,
          refreshLeaseId: null,
          refreshLeaseExpiresAt: null,
          expiresAt: parsed.expiresAt ?? null,
          refreshedAt: parsed.refreshedAt ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async findCredentialForOwnedConnection(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
  ) {
    const [row] = await this.database.db
      .select({ credential: agentMcpCredential })
      .from(agentMcpCredential)
      .innerJoin(
        agentMcpConnection,
        eq(agentMcpConnection.id, agentMcpCredential.connectionId),
      )
      .where(
        and(
          eq(agentMcpConnection.id, connectionId),
          eq(agentMcpConnection.ownerUserId, ownerUserId),
          eq(agentMcpConnection.organizationId, organizationId),
        ),
      )
      .limit(1);

    return row ? AgentMcpCredentialSchema.parse(row.credential) : null;
  }

  async replaceCredentialIfRevision(
    ownerUserId: string,
    organizationId: string,
    input: z.input<typeof agentMcpCredentialInsertSchema>,
    expectedRevision: number | null,
  ) {
    const parsed = agentMcpCredentialInsertSchema.parse(input);

    return this.database.db.transaction(async (transaction) => {
      const [owned] = await transaction
        .select({ id: agentMcpConnection.id })
        .from(agentMcpConnection)
        .where(
          and(
            eq(agentMcpConnection.id, parsed.connectionId),
            eq(agentMcpConnection.ownerUserId, ownerUserId),
            eq(agentMcpConnection.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!owned) {
        return null;
      }

      if (expectedRevision === null) {
        const [created] = await transaction
          .insert(agentMcpCredential)
          .values({ ...parsed, revision: 0 })
          .onConflictDoNothing({ target: agentMcpCredential.connectionId })
          .returning();

        return created ? AgentMcpCredentialSchema.parse(created) : null;
      }

      const [updated] = await transaction
        .update(agentMcpCredential)
        .set({
          formatVersion: parsed.formatVersion ?? 1,
          algorithm: parsed.algorithm,
          keyId: parsed.keyId,
          nonce: parsed.nonce,
          ciphertext: parsed.ciphertext,
          authTag: parsed.authTag,
          expiresAt: parsed.expiresAt ?? null,
          refreshedAt: parsed.refreshedAt ?? null,
          revision: sql`${agentMcpCredential.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agentMcpCredential.connectionId, parsed.connectionId),
            eq(agentMcpCredential.revision, expectedRevision),
          ),
        )
        .returning();

      return updated ? AgentMcpCredentialSchema.parse(updated) : null;
    });
  }

  async acquireCredentialRefreshLease(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    leaseId: string,
    now: Date,
    expiresAt: Date,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const [owned] = await transaction
        .select({ id: agentMcpConnection.id })
        .from(agentMcpConnection)
        .where(
          and(
            eq(agentMcpConnection.id, connectionId),
            eq(agentMcpConnection.ownerUserId, ownerUserId),
            eq(agentMcpConnection.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!owned) {
        return false;
      }

      const rows = await transaction
        .update(agentMcpCredential)
        .set({
          refreshLeaseId: leaseId,
          refreshLeaseExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agentMcpCredential.connectionId, connectionId),
            or(
              isNull(agentMcpCredential.refreshLeaseId),
              lte(agentMcpCredential.refreshLeaseExpiresAt, now),
            ),
          ),
        )
        .returning({ connectionId: agentMcpCredential.connectionId });

      return rows.length > 0;
    });
  }

  async releaseCredentialRefreshLease(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    leaseId: string,
  ): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      const [owned] = await transaction
        .select({ id: agentMcpConnection.id })
        .from(agentMcpConnection)
        .where(
          and(
            eq(agentMcpConnection.id, connectionId),
            eq(agentMcpConnection.ownerUserId, ownerUserId),
            eq(agentMcpConnection.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!owned) {
        return;
      }

      await transaction
        .update(agentMcpCredential)
        .set({
          refreshLeaseId: null,
          refreshLeaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agentMcpCredential.connectionId, connectionId),
            eq(agentMcpCredential.refreshLeaseId, leaseId),
          ),
        );
    });
  }

  async updateToolPolicyIfRevision(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    expectedRevision: number,
    mode: AgentMcpConnection['toolPolicyMode'],
    tools: readonly z.input<
      typeof agentMcpConnectionToolPolicyInputSchema
    >[],
  ) {
    const parsedTools = tools.map((tool) =>
      agentMcpConnectionToolPolicyInputSchema.parse(tool),
    );

    return this.database.db.transaction(async (transaction) => {
      const [owned] = await transaction
        .select({ id: agentMcpConnection.id })
        .from(agentMcpConnection)
        .where(
          and(
            eq(agentMcpConnection.id, connectionId),
            eq(agentMcpConnection.ownerUserId, ownerUserId),
            eq(agentMcpConnection.organizationId, organizationId),
            eq(agentMcpConnection.revision, expectedRevision),
          ),
        )
        .for('update')
        .limit(1);

      if (!owned) {
        return null;
      }

      await transaction
        .delete(agentMcpConnectionTool)
        .where(eq(agentMcpConnectionTool.connectionId, connectionId));

      if (parsedTools.length > 0) {
        await transaction.insert(agentMcpConnectionTool).values(
          parsedTools.map((tool) => ({
            connectionId,
            originalToolName: tool.originalToolName,
            schemaFingerprint: tool.schemaFingerprint ?? null,
            enabled: tool.enabled ?? true,
          })),
        );
      }

      const [row] = await transaction
        .update(agentMcpConnection)
        .set({
          toolPolicyMode: mode,
          revision: sql`${agentMcpConnection.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agentMcpConnection.id, connectionId),
            eq(agentMcpConnection.revision, expectedRevision),
          ),
        )
        .returning();

      return row ? AgentMcpConnectionSchema.parse(row) : null;
    });
  }

  async listEnabledTools(connectionId: string) {
    const rows = await this.database.db
      .select()
      .from(agentMcpConnectionTool)
      .where(
        and(
          eq(agentMcpConnectionTool.connectionId, connectionId),
          eq(agentMcpConnectionTool.enabled, true),
        ),
      )
      .orderBy(asc(agentMcpConnectionTool.originalToolName));

    return rows.map((row) => AgentMcpConnectionToolSchema.parse(row));
  }

  async createOAuthState(
    input: z.input<typeof agentMcpOauthStateInsertSchema>,
  ) {
    const parsed = agentMcpOauthStateInsertSchema.parse(input);

    return this.database.db.transaction(async (transaction) => {
      const [owned] = await transaction
        .select({ id: agentMcpConnection.id })
        .from(agentMcpConnection)
        .where(
          and(
            eq(agentMcpConnection.id, parsed.connectionId),
            eq(agentMcpConnection.ownerUserId, parsed.ownerUserId),
            eq(agentMcpConnection.organizationId, parsed.organizationId),
          ),
        )
        .limit(1);

      if (!owned) {
        return null;
      }

      const [row] = await transaction
        .insert(agentMcpOauthState)
        .values(parsed)
        .returning();

      return row ? AgentMcpOauthStateSchema.parse(row) : null;
    });
  }

  async findActiveOAuthState(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    stateHash: string,
    now: Date,
  ) {
    const [row] = await this.database.db
      .select()
      .from(agentMcpOauthState)
      .where(
        and(
          eq(agentMcpOauthState.stateHash, stateHash),
          eq(agentMcpOauthState.connectionId, connectionId),
          eq(agentMcpOauthState.ownerUserId, ownerUserId),
          eq(agentMcpOauthState.organizationId, organizationId),
          isNull(agentMcpOauthState.consumedAt),
          gt(agentMcpOauthState.expiresAt, now),
        ),
      )
      .limit(1);

    return row ? AgentMcpOauthStateSchema.parse(row) : null;
  }

  async findActiveOAuthStateByHash(
    ownerUserId: string,
    organizationId: string,
    stateHash: string,
    now: Date,
  ) {
    const [row] = await this.database.db
      .select()
      .from(agentMcpOauthState)
      .where(
        and(
          eq(agentMcpOauthState.stateHash, stateHash),
          eq(agentMcpOauthState.ownerUserId, ownerUserId),
          eq(agentMcpOauthState.organizationId, organizationId),
          isNull(agentMcpOauthState.consumedAt),
          gt(agentMcpOauthState.expiresAt, now),
        ),
      )
      .limit(1);

    return row ? AgentMcpOauthStateSchema.parse(row) : null;
  }

  async saveOAuthStateVerifier(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    stateHash: string,
    now: Date,
    envelope: z.input<typeof agentMcpOauthStateVerifierUpdateSchema>,
  ) {
    const parsed = agentMcpOauthStateVerifierUpdateSchema.parse(envelope);
    const rows = await this.database.db
      .update(agentMcpOauthState)
      .set(parsed)
      .where(
        and(
          eq(agentMcpOauthState.stateHash, stateHash),
          eq(agentMcpOauthState.connectionId, connectionId),
          eq(agentMcpOauthState.ownerUserId, ownerUserId),
          eq(agentMcpOauthState.organizationId, organizationId),
          isNull(agentMcpOauthState.consumedAt),
          isNull(agentMcpOauthState.verifierCiphertext),
          gt(agentMcpOauthState.expiresAt, now),
        ),
      )
      .returning({ stateHash: agentMcpOauthState.stateHash });

    return rows.length === 1;
  }

  async saveOAuthStateDiscovery(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    stateHash: string,
    now: Date,
    snapshot: z.input<typeof agentMcpOauthStateDiscoveryUpdateSchema>,
  ) {
    const parsed = agentMcpOauthStateDiscoveryUpdateSchema.parse(snapshot);
    const rows = await this.database.db
      .update(agentMcpOauthState)
      .set(parsed)
      .where(
        and(
          eq(agentMcpOauthState.stateHash, stateHash),
          eq(agentMcpOauthState.connectionId, connectionId),
          eq(agentMcpOauthState.ownerUserId, ownerUserId),
          eq(agentMcpOauthState.organizationId, organizationId),
          isNull(agentMcpOauthState.consumedAt),
          isNull(agentMcpOauthState.discoveryCiphertext),
          gt(agentMcpOauthState.expiresAt, now),
        ),
      )
      .returning({ stateHash: agentMcpOauthState.stateHash });

    return rows.length === 1;
  }

  async consumeOAuthState(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    stateHash: string,
    now: Date,
  ) {
    const [row] = await this.database.db
      .update(agentMcpOauthState)
      .set({ consumedAt: now })
      .where(
        and(
          eq(agentMcpOauthState.stateHash, stateHash),
          eq(agentMcpOauthState.connectionId, connectionId),
          eq(agentMcpOauthState.ownerUserId, ownerUserId),
          eq(agentMcpOauthState.organizationId, organizationId),
          isNull(agentMcpOauthState.consumedAt),
          gt(agentMcpOauthState.expiresAt, now),
        ),
      )
      .returning();

    return row ? AgentMcpOauthStateSchema.parse(row) : null;
  }
}
