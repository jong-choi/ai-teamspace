import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { McpAgentDelegationRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-delegation.repository';
import { mcpAgentDelegation } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-delegation.schema';
import {
  mcpAgentDelegationInsertSchema,
  mcpAgentDelegationSelectSchema,
  mcpAgentDelegationTokenUpdateSchema,
} from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-delegation.zod';

import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';

@Injectable()
export class McpAgentDelegationDrizzleRepository extends McpAgentDelegationRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async findActive(
    userId: string,
    organizationId: string,
    issuer: string,
    oauthClientIdentity: string,
  ) {
    const [row] = await this.database.db
      .select()
      .from(mcpAgentDelegation)
      .where(
        and(
          eq(mcpAgentDelegation.userId, userId),
          eq(mcpAgentDelegation.organizationId, organizationId),
          eq(mcpAgentDelegation.issuer, issuer),
          eq(mcpAgentDelegation.oauthClientIdentity, oauthClientIdentity),
          isNull(mcpAgentDelegation.revokedAt),
        ),
      )
      .limit(1);

    return row ? mcpAgentDelegationSelectSchema.parse(row) : null;
  }

  async findLatestActive(
    userId: string,
    organizationId: string,
    oauthClientIdentity: string,
  ) {
    const [row] = await this.database.db
      .select()
      .from(mcpAgentDelegation)
      .where(
        and(
          eq(mcpAgentDelegation.userId, userId),
          eq(mcpAgentDelegation.organizationId, organizationId),
          eq(
            mcpAgentDelegation.oauthClientIdentity,
            oauthClientIdentity,
          ),
          isNull(mcpAgentDelegation.revokedAt),
        ),
      )
      .orderBy(desc(mcpAgentDelegation.updatedAt))
      .limit(1);

    return row ? mcpAgentDelegationSelectSchema.parse(row) : null;
  }

  async upsertActive(
    input: Parameters<McpAgentDelegationRepository['upsertActive']>[0],
  ) {
    const parsed = mcpAgentDelegationInsertSchema.parse(input);
    const [row] = await this.database.db
      .insert(mcpAgentDelegation)
      .values(parsed)
      .onConflictDoUpdate({
        target: [
          mcpAgentDelegation.userId,
          mcpAgentDelegation.organizationId,
          mcpAgentDelegation.issuer,
          mcpAgentDelegation.oauthClientIdentity,
        ],
        set: {
          resourceUrl: parsed.resourceUrl,
          grantedScopes: parsed.grantedScopes,
          tokensFormatVersion: parsed.tokensFormatVersion,
          tokensAlgorithm: parsed.tokensAlgorithm,
          tokensKeyId: parsed.tokensKeyId,
          tokensNonce: parsed.tokensNonce,
          tokensCiphertext: parsed.tokensCiphertext,
          tokensAuthTag: parsed.tokensAuthTag,
          refreshLeaseOwner: null,
          refreshLeaseExpiresAt: null,
          revokedAt: null,
          revision: sql`${mcpAgentDelegation.revision} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return mcpAgentDelegationSelectSchema.parse(row);
  }

  async updateTokensUnderLease(
    delegationId: string,
    expectedRevision: number,
    leaseOwner: string,
    now: Date,
    input: Parameters<
      McpAgentDelegationRepository['updateTokensUnderLease']
    >[4],
  ) {
    const parsed = mcpAgentDelegationTokenUpdateSchema.parse(input);
    const [row] = await this.database.db
      .update(mcpAgentDelegation)
      .set({
        ...parsed,
        refreshLeaseOwner: null,
        refreshLeaseExpiresAt: null,
        revision: sql`${mcpAgentDelegation.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(mcpAgentDelegation.id, delegationId),
          eq(mcpAgentDelegation.revision, expectedRevision),
          eq(mcpAgentDelegation.refreshLeaseOwner, leaseOwner),
          gt(mcpAgentDelegation.refreshLeaseExpiresAt, now),
          isNull(mcpAgentDelegation.revokedAt),
        ),
      )
      .returning();

    return row ? mcpAgentDelegationSelectSchema.parse(row) : null;
  }

  async acquireRefreshLease(
    delegationId: string,
    leaseOwner: string,
    leaseExpiresAt: Date,
    now: Date,
  ) {
    const [row] = await this.database.db
      .update(mcpAgentDelegation)
      .set({
        refreshLeaseOwner: leaseOwner,
        refreshLeaseExpiresAt: leaseExpiresAt,
        revision: sql`${mcpAgentDelegation.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(mcpAgentDelegation.id, delegationId),
          isNull(mcpAgentDelegation.revokedAt),
          or(
            isNull(mcpAgentDelegation.refreshLeaseExpiresAt),
            lte(mcpAgentDelegation.refreshLeaseExpiresAt, now),
            eq(mcpAgentDelegation.refreshLeaseOwner, leaseOwner),
          ),
        ),
      )
      .returning();

    return row ? mcpAgentDelegationSelectSchema.parse(row) : null;
  }

  async releaseRefreshLease(
    delegationId: string,
    leaseOwner: string,
  ): Promise<void> {
    await this.database.db
      .update(mcpAgentDelegation)
      .set({
        refreshLeaseOwner: null,
        refreshLeaseExpiresAt: null,
        revision: sql`${mcpAgentDelegation.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mcpAgentDelegation.id, delegationId),
          eq(mcpAgentDelegation.refreshLeaseOwner, leaseOwner),
        ),
      );
  }

  async revokeActive(
    userId: string,
    organizationId: string,
    issuer: string,
    oauthClientIdentity: string,
  ): Promise<boolean> {
    const now = new Date();
    const rows = await this.database.db
      .update(mcpAgentDelegation)
      .set({
        revokedAt: now,
        refreshLeaseOwner: null,
        refreshLeaseExpiresAt: null,
        revision: sql`${mcpAgentDelegation.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(mcpAgentDelegation.userId, userId),
          eq(mcpAgentDelegation.organizationId, organizationId),
          eq(mcpAgentDelegation.issuer, issuer),
          eq(mcpAgentDelegation.oauthClientIdentity, oauthClientIdentity),
          isNull(mcpAgentDelegation.revokedAt),
        ),
      )
      .returning({ id: mcpAgentDelegation.id });

    return rows.length > 0;
  }
}
