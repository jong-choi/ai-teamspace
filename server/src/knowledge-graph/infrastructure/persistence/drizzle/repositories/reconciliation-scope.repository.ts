import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import type {
  ReconciliationProgress,
  ReconciliationScope,
} from '@/knowledge-graph/domain/reconciliation-scope';
import {
  ORGANIZATION_CYCLE_DELAY_MS,
  ORGANIZATION_DISCOVERY_BATCH,
  SCOPE_LEASE_MS,
} from '@/knowledge-graph/domain/reconciliation-scope';
import { toReconciliationScopeDomain } from '@/knowledge-graph/infrastructure/persistence/drizzle/mappers/reconciliation-scope.mapper';
import { reconciliationScope } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.schema';
import { ReconciliationProgressSchema } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.zod';
import { ReconciliationScopeRepository } from '@/knowledge-graph/infrastructure/persistence/reconciliation-scope.repository';
import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';

import { and, asc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';

@Injectable()
export class ReconciliationScopeDrizzleRepository extends ReconciliationScopeRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }
  async initialize(): Promise<void> {
    await this.database.db
      .insert(reconciliationScope)
      .values([
        { id: 'organizations', purpose: 'organizations' },
        { id: 'membership_sources', purpose: 'membership_sources' },
        { id: 'organization_presence', purpose: 'organization_presence' },
      ])
      .onConflictDoNothing();
  }
  async claim(purpose: ReconciliationScope['purpose']) {
    return this.database.db.transaction(async (transaction) => {
      const [scope] = await transaction
        .select()
        .from(reconciliationScope)
        .where(
          and(
            eq(reconciliationScope.purpose, purpose),
            lte(reconciliationScope.nextRunAt, sql`now()`),
            or(
              isNull(reconciliationScope.leaseUntil),
              lte(reconciliationScope.leaseUntil, sql`now()`),
            ),
          ),
        )
        .orderBy(
          asc(reconciliationScope.nextRunAt),
          asc(reconciliationScope.id),
        )
        .limit(1)
        .for('update', { skipLocked: true });
      if (!scope) return null;
      const [claimed] = await transaction
        .update(reconciliationScope)
        .set({
          leaseToken: randomUUID(),
          leaseUntil: sql`now() + ${SCOPE_LEASE_MS} * interval '1 millisecond'`,
          updatedAt: sql`now()`,
        })
        .where(eq(reconciliationScope.id, scope.id))
        .returning();
      return claimed ? toReconciliationScopeDomain(claimed) : null;
    });
  }
  async complete(
    scope: ReconciliationScope,
    progress: ReconciliationProgress,
    outcome: Parameters<ReconciliationScopeRepository['complete']>[2],
  ): Promise<boolean> {
    if (!scope.leaseToken) return false;
    const parsed = ReconciliationProgressSchema.parse(progress);
    const [completed] = await this.database.db
      .update(reconciliationScope)
      .set({
        ...parsed,
        leaseToken: null,
        leaseUntil: null,
        updatedAt: sql`now()`,
        nextRunAt: sql`now() + ${outcome.delayMs} * interval '1 millisecond'`,
        failureCount: outcome.failed
          ? sql`${reconciliationScope.failureCount} + 1`
          : 0,
        lastError: outcome.failed
          ? (outcome.lastError ?? 'KNOWLEDGE_GRAPH_RECONCILIATION_FAILED')
          : null,
      })
      .where(
        and(
          eq(reconciliationScope.id, scope.id),
          eq(reconciliationScope.leaseToken, scope.leaseToken),
          gt(reconciliationScope.leaseUntil, sql`now()`),
        ),
      )
      .returning({ id: reconciliationScope.id });
    return completed !== undefined;
  }
  async registerOrganizations(
    scope: ReconciliationScope,
    organizationIds: readonly string[],
  ): Promise<boolean> {
    const leaseToken = scope.leaseToken;
    if (!leaseToken || scope.purpose !== 'organizations') return false;
    return this.database.db.transaction(async (transaction) => {
      const [owned] = await transaction
        .select({ id: reconciliationScope.id })
        .from(reconciliationScope)
        .where(
          and(
            eq(reconciliationScope.id, scope.id),
            eq(reconciliationScope.leaseToken, leaseToken),
            eq(reconciliationScope.purpose, 'organizations'),
            gt(reconciliationScope.leaseUntil, sql`now()`),
          ),
        )
        .for('update');
      if (!owned) return false;
      const rows = organizationIds.flatMap((organizationId) =>
        OutboxAggregateVersionSchema.shape.aggregateKind.options.map(
          (aggregateKind): typeof reconciliationScope.$inferInsert => ({
            id: JSON.stringify([
              'owner_sources',
              organizationId,
              aggregateKind,
            ]),
            purpose: 'owner_sources',
            organizationId,
            aggregateKind,
          }),
        ),
      );
      if (rows.length > 0)
        await transaction
          .insert(reconciliationScope)
          .values(rows)
          .onConflictDoNothing();
      await transaction
        .update(reconciliationScope)
        .set({
          afterOrganizationId:
            organizationIds.length === ORGANIZATION_DISCOVERY_BATCH
              ? (organizationIds.at(-1) ?? null)
              : null,
          leaseToken: null,
          leaseUntil: null,
          nextRunAt: sql`now() + ${organizationIds.length === ORGANIZATION_DISCOVERY_BATCH ? 0 : ORGANIZATION_CYCLE_DELAY_MS} * interval '1 millisecond'`,
          failureCount: 0,
          lastError: null,
          updatedAt: sql`now()`,
        })
        .where(eq(reconciliationScope.id, scope.id));
      return true;
    });
  }
  async releaseFailed(scope: ReconciliationScope): Promise<void> {
    await this.complete(scope, {}, { failed: true, delayMs: 60_000 });
  }
  async removeOrganizationScopes(
    scope: ReconciliationScope,
    organizationId: string,
  ): Promise<boolean> {
    const token = scope.leaseToken;
    if (scope.purpose !== 'organization_presence' || !token) return false;
    return this.database.db.transaction(async (transaction) => {
      const [owned] = await transaction
        .select({ id: reconciliationScope.id })
        .from(reconciliationScope)
        .where(
          and(
            eq(reconciliationScope.id, scope.id),
            eq(reconciliationScope.purpose, 'organization_presence'),
            eq(reconciliationScope.leaseToken, token),
            gt(reconciliationScope.leaseUntil, sql`now()`),
          ),
        )
        .for('update')
        .limit(1);
      if (!owned) return false;
      await transaction
        .delete(reconciliationScope)
        .where(
          and(
            eq(reconciliationScope.purpose, 'owner_sources'),
            eq(reconciliationScope.organizationId, organizationId),
          ),
        );
      return true;
    });
  }
}
