import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { mcpAgentOauthFlow } from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-oauth-flow.schema';
import {
  mcpAgentOauthFlowDiscoveryUpdateSchema,
  mcpAgentOauthFlowInsertSchema,
  mcpAgentOauthFlowSelectSchema,
  mcpAgentOauthFlowVerifierUpdateSchema,
} from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-oauth-flow.zod';
import { McpAgentOauthFlowRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-oauth-flow.repository';

import { and, desc, eq, gt, isNull } from 'drizzle-orm';

@Injectable()
export class McpAgentOauthFlowDrizzleRepository extends McpAgentOauthFlowRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async create(input: Parameters<McpAgentOauthFlowRepository['create']>[0]) {
    const parsed = mcpAgentOauthFlowInsertSchema.parse(input);
    const [row] = await this.database.db
      .insert(mcpAgentOauthFlow)
      .values(parsed)
      .returning();

    return mcpAgentOauthFlowSelectSchema.parse(row);
  }

  async findActiveByStateHash(stateHash: string, now: Date) {
    const [row] = await this.database.db
      .select()
      .from(mcpAgentOauthFlow)
      .where(
        and(
          eq(mcpAgentOauthFlow.stateHash, stateHash),
          isNull(mcpAgentOauthFlow.consumedAt),
          gt(mcpAgentOauthFlow.expiresAt, now),
        ),
      )
      .limit(1);

    return row ? mcpAgentOauthFlowSelectSchema.parse(row) : null;
  }

  async findLatestActiveForActor(
    userId: string,
    organizationId: string,
    oauthClientIdentity: string,
    now: Date,
  ) {
    const [row] = await this.database.db
      .select()
      .from(mcpAgentOauthFlow)
      .where(
        and(
          eq(mcpAgentOauthFlow.userId, userId),
          eq(mcpAgentOauthFlow.organizationId, organizationId),
          eq(mcpAgentOauthFlow.oauthClientIdentity, oauthClientIdentity),
          isNull(mcpAgentOauthFlow.consumedAt),
          gt(mcpAgentOauthFlow.expiresAt, now),
        ),
      )
      .orderBy(desc(mcpAgentOauthFlow.createdAt))
      .limit(1);

    return row ? mcpAgentOauthFlowSelectSchema.parse(row) : null;
  }

  async findActiveById(
    flowId: string,
    userId: string,
    organizationId: string,
    now: Date,
  ) {
    const [row] = await this.database.db
      .select()
      .from(mcpAgentOauthFlow)
      .where(
        and(
          eq(mcpAgentOauthFlow.id, flowId),
          eq(mcpAgentOauthFlow.userId, userId),
          eq(mcpAgentOauthFlow.organizationId, organizationId),
          isNull(mcpAgentOauthFlow.consumedAt),
          gt(mcpAgentOauthFlow.expiresAt, now),
        ),
      )
      .limit(1);

    return row ? mcpAgentOauthFlowSelectSchema.parse(row) : null;
  }

  async saveVerifierIfAbsent(
    flowId: string,
    userId: string,
    organizationId: string,
    now: Date,
    input: Parameters<McpAgentOauthFlowRepository['saveVerifierIfAbsent']>[4],
  ) {
    const parsed = mcpAgentOauthFlowVerifierUpdateSchema.parse(input);
    const [row] = await this.database.db
      .update(mcpAgentOauthFlow)
      .set({
        ...parsed,
        updatedAt: now,
      })
      .where(
        and(
          eq(mcpAgentOauthFlow.id, flowId),
          eq(mcpAgentOauthFlow.userId, userId),
          eq(mcpAgentOauthFlow.organizationId, organizationId),
          isNull(mcpAgentOauthFlow.consumedAt),
          gt(mcpAgentOauthFlow.expiresAt, now),
          isNull(mcpAgentOauthFlow.verifierFormatVersion),
        ),
      )
      .returning();

    return row ? mcpAgentOauthFlowSelectSchema.parse(row) : null;
  }

  async saveDiscovery(
    flowId: string,
    userId: string,
    organizationId: string,
    now: Date,
    input: Parameters<McpAgentOauthFlowRepository['saveDiscovery']>[4],
  ) {
    const parsed = mcpAgentOauthFlowDiscoveryUpdateSchema.parse(input);
    const [row] = await this.database.db
      .update(mcpAgentOauthFlow)
      .set({
        ...parsed,
        updatedAt: now,
      })
      .where(
        and(
          eq(mcpAgentOauthFlow.id, flowId),
          eq(mcpAgentOauthFlow.userId, userId),
          eq(mcpAgentOauthFlow.organizationId, organizationId),
          isNull(mcpAgentOauthFlow.consumedAt),
          gt(mcpAgentOauthFlow.expiresAt, now),
        ),
      )
      .returning();

    return row ? mcpAgentOauthFlowSelectSchema.parse(row) : null;
  }

  async consume(
    flowId: string,
    userId: string,
    organizationId: string,
    now: Date,
  ) {
    const [row] = await this.database.db
      .update(mcpAgentOauthFlow)
      .set({
        consumedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(mcpAgentOauthFlow.id, flowId),
          eq(mcpAgentOauthFlow.userId, userId),
          eq(mcpAgentOauthFlow.organizationId, organizationId),
          isNull(mcpAgentOauthFlow.consumedAt),
          gt(mcpAgentOauthFlow.expiresAt, now),
        ),
      )
      .returning();

    return row ? mcpAgentOauthFlowSelectSchema.parse(row) : null;
  }
}
