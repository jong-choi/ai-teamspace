import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import {
  isPersonalMcpScope,
  type McpScope,
  normalizeMcpScopes,
} from '@/mcp/contracts/mcp-scope';
import type { McpOrganizationPolicy } from '@/mcp-access/domain/mcp-organization-policy';
import type { McpUserPolicy } from '@/mcp-access/domain/mcp-user-policy';
import {
  toMcpOrganizationPolicyDomain,
  toMcpOrganizationPolicyInsert,
  toMcpOrganizationPolicyUpdate,
} from '@/mcp-access/infrastructure/persistence/drizzle/mappers/mcp-organization-policy.mapper';
import {
  toMcpUserPolicyDomain,
  toMcpUserPolicyInsert,
  toMcpUserPolicyUpdate,
} from '@/mcp-access/infrastructure/persistence/drizzle/mappers/mcp-user-policy.mapper';
import { mcpOrganizationPolicy } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-organization-policy.schema';
import { mcpUserPolicy } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-user-policy.schema';
import {
  type McpAccessComposite,
  McpAccessRepository,
  type McpOrganizationPolicyUpdateValue,
  type McpPolicyUpdateResult,
} from '@/mcp-access/infrastructure/persistence/mcp-access.repository';

import { and, eq } from 'drizzle-orm';

@Injectable()
export class McpAccessDrizzleRepository extends McpAccessRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async findComposite(
    organizationId: string,
    userId: string,
  ): Promise<McpAccessComposite> {
    const [organizationRows, userRows] = await Promise.all([
      this.database.db
        .select()
        .from(mcpOrganizationPolicy)
        .where(eq(mcpOrganizationPolicy.organizationId, organizationId))
        .limit(1),
      this.database.db
        .select()
        .from(mcpUserPolicy)
        .where(
          and(
            eq(mcpUserPolicy.organizationId, organizationId),
            eq(mcpUserPolicy.userId, userId),
          ),
        )
        .limit(1),
    ]);

    return {
      organizationPolicy: organizationRows[0]
        ? toMcpOrganizationPolicyDomain(organizationRows[0])
        : null,
      userPolicy: userRows[0] ? toMcpUserPolicyDomain(userRows[0]) : null,
    };
  }

  async findOrganizationPolicy(
    organizationId: string,
  ): Promise<McpOrganizationPolicy | null> {
    const [row] = await this.database.db
      .select()
      .from(mcpOrganizationPolicy)
      .where(eq(mcpOrganizationPolicy.organizationId, organizationId))
      .limit(1);
    return row ? toMcpOrganizationPolicyDomain(row) : null;
  }

  async findUserPolicy(
    organizationId: string,
    userId: string,
  ): Promise<McpUserPolicy | null> {
    const [row] = await this.database.db
      .select()
      .from(mcpUserPolicy)
      .where(
        and(
          eq(mcpUserPolicy.organizationId, organizationId),
          eq(mcpUserPolicy.userId, userId),
        ),
      )
      .limit(1);
    return row ? toMcpUserPolicyDomain(row) : null;
  }

  async ensureOrganizationPolicy(input: {
    organizationId: string;
    allowedScopes: readonly McpScope[];
    updatedByUserId: string | null;
  }) {
    const [insertedRow] = await this.database.db
      .insert(mcpOrganizationPolicy)
      .values(
        toMcpOrganizationPolicyInsert({
          organizationId: input.organizationId,
          allowedScopes: [...input.allowedScopes],
          updatedByUserId: input.updatedByUserId,
        }),
      )
      .onConflictDoNothing()
      .returning();

    if (insertedRow) {
      return {
        value: toMcpOrganizationPolicyDomain(insertedRow),
        created: true,
      };
    }

    const [row] = await this.database.db
      .select()
      .from(mcpOrganizationPolicy)
      .where(eq(mcpOrganizationPolicy.organizationId, input.organizationId))
      .limit(1);

    if (!row) {
      throw new Error('MCP organization policy provisioning 결과가 없습니다.');
    }
    return {
      value: toMcpOrganizationPolicyDomain(row),
      created: false,
    };
  }

  async ensureUserPolicy(input: {
    organizationId: string;
    userId: string;
    requestedScopes: readonly McpScope[];
  }) {
    const [insertedRow] = await this.database.db
      .insert(mcpUserPolicy)
      .values(
        toMcpUserPolicyInsert({
          organizationId: input.organizationId,
          userId: input.userId,
          requestedScopes: [...input.requestedScopes],
        }),
      )
      .onConflictDoNothing()
      .returning();

    if (insertedRow) {
      return {
        value: toMcpUserPolicyDomain(insertedRow),
        created: true,
      };
    }

    const [row] = await this.database.db
      .select()
      .from(mcpUserPolicy)
      .where(
        and(
          eq(mcpUserPolicy.organizationId, input.organizationId),
          eq(mcpUserPolicy.userId, input.userId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new Error('MCP user policy provisioning 결과가 없습니다.');
    }
    return {
      value: toMcpUserPolicyDomain(row),
      created: false,
    };
  }

  async updateUserPolicyIfRevision(input: {
    organizationId: string;
    userId: string;
    requestedScopes: readonly McpScope[];
    expectedRevision: number;
  }): Promise<McpPolicyUpdateResult<McpUserPolicy>> {
    return this.database.db.transaction(async (transaction) => {
      const [currentRow] = await transaction
        .select()
        .from(mcpUserPolicy)
        .where(
          and(
            eq(mcpUserPolicy.organizationId, input.organizationId),
            eq(mcpUserPolicy.userId, input.userId),
          ),
        )
        .for('update')
        .limit(1);

      if (!currentRow) return { status: 'not_found' };

      const current = toMcpUserPolicyDomain(currentRow);
      if (current.revision !== input.expectedRevision) {
        return {
          status: 'revision_conflict',
          currentRevision: current.revision,
        };
      }

      const requestedScopes = normalizeMcpScopes(input.requestedScopes);
      if (sameScopes(current.requestedScopes, requestedScopes)) {
        return { status: 'updated', value: current };
      }

      const [updatedRow] = await transaction
        .update(mcpUserPolicy)
        .set(
          toMcpUserPolicyUpdate({
            requestedScopes,
            revision: current.revision + 1,
            updatedAt: new Date(),
          }),
        )
        .where(
          and(
            eq(mcpUserPolicy.organizationId, input.organizationId),
            eq(mcpUserPolicy.userId, input.userId),
          ),
        )
        .returning();

      if (!updatedRow) return { status: 'not_found' };
      return {
        status: 'updated',
        value: toMcpUserPolicyDomain(updatedRow),
      };
    });
  }

  async updateOrganizationPolicyAndPruneUsers(input: {
    organizationId: string;
    allowedScopes: readonly McpScope[];
    expectedRevision: number;
    updatedByUserId: string;
  }): Promise<McpPolicyUpdateResult<McpOrganizationPolicyUpdateValue>> {
    return this.database.db.transaction(async (transaction) => {
      const [currentRow] = await transaction
        .select()
        .from(mcpOrganizationPolicy)
        .where(eq(mcpOrganizationPolicy.organizationId, input.organizationId))
        .for('update')
        .limit(1);

      if (!currentRow) return { status: 'not_found' };

      const current = toMcpOrganizationPolicyDomain(currentRow);
      if (current.revision !== input.expectedRevision) {
        return {
          status: 'revision_conflict',
          currentRevision: current.revision,
        };
      }

      const allowedScopes = normalizeMcpScopes(input.allowedScopes);
      if (sameScopes(current.allowedScopes, allowedScopes)) {
        return {
          status: 'updated',
          value: { policy: current, affectedUserCount: 0 },
        };
      }

      const now = new Date();
      const [updatedOrganizationRow] = await transaction
        .update(mcpOrganizationPolicy)
        .set(
          toMcpOrganizationPolicyUpdate({
            allowedScopes,
            revision: current.revision + 1,
            updatedByUserId: input.updatedByUserId,
            updatedAt: now,
          }),
        )
        .where(eq(mcpOrganizationPolicy.organizationId, input.organizationId))
        .returning();

      if (!updatedOrganizationRow) return { status: 'not_found' };

      const userRows = await transaction
        .select()
        .from(mcpUserPolicy)
        .where(eq(mcpUserPolicy.organizationId, input.organizationId))
        .for('update');
      const allowedSet = new Set<McpScope>(allowedScopes);
      const previouslyAllowed = new Set<McpScope>(current.allowedScopes);
      // 조직이 새로 허용한 scope는 멤버가 따로 켜지 않아도 바로 쓸 수 있게 한다.
      const addedScopes = allowedScopes.filter(
        (scope) => !previouslyAllowed.has(scope),
      );
      let affectedUserCount = 0;

      for (const row of userRows) {
        const userPolicy = toMcpUserPolicyDomain(row);
        // 조직이 막은 scope는 빼되, 조직 정책과 무관한 개인 scope는 그대로 둔다.
        const requestedScopes = normalizeMcpScopes([
          ...userPolicy.requestedScopes.filter(
            (scope) => allowedSet.has(scope) || isPersonalMcpScope(scope),
          ),
          ...addedScopes,
        ]);
        if (sameScopes(userPolicy.requestedScopes, requestedScopes)) continue;

        await transaction
          .update(mcpUserPolicy)
          .set(
            toMcpUserPolicyUpdate({
              requestedScopes,
              revision: userPolicy.revision + 1,
              updatedAt: now,
            }),
          )
          .where(
            and(
              eq(mcpUserPolicy.organizationId, userPolicy.organizationId),
              eq(mcpUserPolicy.userId, userPolicy.userId),
            ),
          );
        affectedUserCount += 1;
      }

      return {
        status: 'updated',
        value: {
          policy: toMcpOrganizationPolicyDomain(updatedOrganizationRow),
          affectedUserCount,
        },
      };
    });
  }

  async deleteUserPolicy(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await this.database.db
      .delete(mcpUserPolicy)
      .where(
        and(
          eq(mcpUserPolicy.organizationId, organizationId),
          eq(mcpUserPolicy.userId, userId),
        ),
      );
  }
}

function sameScopes(
  left: readonly McpScope[],
  right: readonly McpScope[],
): boolean {
  return (
    left.length === right.length &&
    left.every((scope, index) => scope === right[index])
  );
}
