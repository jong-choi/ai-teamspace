import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { SEMANTIC_QUIET_MS } from '@/knowledge-graph/domain/semantic-timing';
import {
  type SemanticRecoveryCandidate,
  SemanticRecoveryCandidateSchema,
  type SemanticSourceScope,
  SemanticSourceScopeSchema,
} from '@/outbox/domain/semantic-source';
import { outboxAggregateVersion as version } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import {
  outboxSemanticSourceState as state,
  semanticSourceKinds,
} from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';

import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNull,
  lt,
  ne,
  not,
  or,
  sql,
} from 'drizzle-orm';

@Injectable()
export class OutboxSemanticRecovery {
  constructor(private readonly database: DatabaseService) {}

  async discoverMissing(limit: number) {
    const rows = await this.database.db
      .select({
        organizationId: version.organizationId,
        aggregateKind: version.aggregateKind,
        aggregateId: version.aggregateId,
      })
      .from(version)
      .where(
        and(
          inArray(version.aggregateKind, [...semanticSourceKinds]),
          not(
            exists(
              this.database.db
                .select({ id: state.aggregateId })
                .from(state)
                .where(this.joinCondition()),
            ),
          ),
        ),
      )
      .orderBy(
        asc(version.organizationId),
        asc(version.aggregateKind),
        asc(version.aggregateId),
      )
      .limit(limit);
    if (!rows.length) return 0;
    const scopes = SemanticSourceScopeSchema.array().parse(rows);
    const created = await this.database.db
      .insert(state)
      .values(scopes)
      .onConflictDoNothing()
      .returning({ kind: state.aggregateKind });
    return created.length;
  }

  async claimGapBatch(limit: number, fingerprint: string) {
    return this.database.db.transaction(async (transaction) => {
      const candidates = await transaction
        .select({
          organizationId: state.organizationId,
          aggregateKind: state.aggregateKind,
          aggregateId: state.aggregateId,
        })
        .from(state)
        .innerJoin(version, this.joinCondition())
        .where(this.eligibleCondition(fingerprint))
        .orderBy(
          asc(sql`coalesce(${state.lastRequeuedAt}, 'epoch'::timestamptz)`),
          asc(state.updatedAt),
          asc(state.organizationId),
          asc(state.aggregateId),
        )
        .limit(limit);
      if (!candidates.length) return [];
      // public write 경로와 같은 registry → state 잠금 순서다. 다른 claim의 잠긴 state는 건너뛴다.
      const held = await transaction
        .select({
          organizationId: version.organizationId,
          aggregateKind: version.aggregateKind,
          aggregateId: version.aggregateId,
        })
        .from(version)
        .where(or(...candidates.map((scope) => this.versionCondition(scope))))
        .orderBy(
          asc(version.organizationId),
          asc(version.aggregateKind),
          asc(version.aggregateId),
        )
        .for('share', { skipLocked: true });
      if (!held.length) return [];
      const scopes = SemanticSourceScopeSchema.array().parse(held);
      const claimed = await transaction
        .select({
          scope: {
            organizationId: state.organizationId,
            aggregateKind: state.aggregateKind,
            aggregateId: state.aggregateId,
          },
          state,
          version: {
            desiredSeq: version.desiredSeq,
            deleted: version.deleted,
            updatedAt: version.updatedAt,
          },
          dbNow: sql<Date>`clock_timestamp()`.mapWith(state.updatedAt),
        })
        .from(state)
        .innerJoin(version, this.joinCondition())
        .where(
          and(
            this.eligibleCondition(fingerprint),
            or(...scopes.map((scope) => this.stateCondition(scope))),
          ),
        )
        .orderBy(
          asc(state.organizationId),
          asc(state.aggregateKind),
          asc(state.aggregateId),
        )
        .for('update', { of: state, skipLocked: true });
      const results = [];
      for (const row of claimed) {
        const newObservation = row.state.observedSeq < row.version.desiredSeq;
        const [recorded] = await transaction
          .update(state)
          .set({
            observedSeq: newObservation
              ? row.version.desiredSeq
              : row.state.observedSeq,
            observedAt: newObservation
              ? sql`clock_timestamp()`
              : row.state.observedAt,
            requeueCount: newObservation ? 1 : sql`${state.requeueCount} + 1`,
            lastRequeuedAt: sql`clock_timestamp()`,
            updatedAt: sql`now()`,
          })
          .where(this.stateCondition(row.scope))
          .returning();
        if (!recorded) throw new Error('SEMANTIC_RECOVERY_STATE_MISSING');
        results.push(
          SemanticRecoveryCandidateSchema.parse({ ...row, state: recorded }),
        );
      }
      return results;
    });
  }

  async stats(fingerprint: string) {
    const [row] = await this.database.db
      .select({
        desired:
          sql<number>`count(*) filter (where ${version.deleted} = false and ${state.indexedSeq} < ${version.desiredSeq})`.mapWith(
            Number,
          ),
        manual:
          sql<number>`count(*) filter (where ${version.deleted} = false and ${state.indexedManualSeq} < ${state.manualRequestSeq})`.mapWith(
            Number,
          ),
        running:
          sql<number>`count(*) filter (where ${state.runStatus} = 'running' and ${state.leaseExpiresAt} > clock_timestamp())`.mapWith(
            Number,
          ),
        failed:
          sql<number>`count(*) filter (where ${state.runStatus} in ('failed', 'validation_failed') and ${state.attemptSeq} = ${version.desiredSeq} and ${state.attemptManualSeq} = ${state.manualRequestSeq} and ${state.attemptFingerprint} = ${fingerprint})`.mapWith(
            Number,
          ),
        oldestPendingAt:
          sql<Date | null>`min(${state.updatedAt}) filter (where ${state.indexedSeq} < ${version.desiredSeq} or ${state.indexedManualSeq} < ${state.manualRequestSeq})`.mapWith(
            state.updatedAt,
          ),
      })
      .from(state)
      .innerJoin(version, this.joinCondition());
    if (!row) throw new Error('SEMANTIC_RECOVERY_STATS_MISSING');
    return row;
  }
  async organizationStats(organizationId: string, fingerprint: string) {
    const gap = sql`${state.indexedSeq} < ${version.desiredSeq} or ${state.indexedManualSeq} < ${state.manualRequestSeq} or ${state.indexedFingerprint} is distinct from ${fingerprint}`;
    const terminal = sql`${state.runStatus} in ('failed', 'validation_failed') and ${state.attemptSeq} = ${version.desiredSeq} and ${state.attemptManualSeq} = ${state.manualRequestSeq} and ${state.attemptFingerprint} = ${fingerprint}`;
    const running = sql`${state.runStatus} = 'running' and ${state.leaseExpiresAt} > clock_timestamp()`;
    const manualGap = sql`${state.indexedManualSeq} < ${state.manualRequestSeq}`;
    const accepted = sql`(${manualGap}) and ${state.manualDeliveredSeq} < ${state.manualRequestSeq}`;
    const queued = sql`((${manualGap}) and ${state.manualDeliveredSeq} >= ${state.manualRequestSeq}) or (${state.runStatus} = 'retry_waiting' and (${gap}))`;
    const quiet = sql`${state.observedAt} is null or ${state.observedAt} + (${SEMANTIC_QUIET_MS} * interval '1 millisecond') > clock_timestamp()`;
    const desiredOrFingerprint = sql`${state.indexedSeq} < ${version.desiredSeq} or ${state.indexedFingerprint} is distinct from ${fingerprint}`;
    const eligibleGap = sql`(${desiredOrFingerprint}) and not (${manualGap}) and not (${running}) and not (${terminal})`;
    const [row] = await this.database.db
      .select({
        notIndexed:
          sql<number>`count(*) filter (where ${version.deleted} = false and ${state.activeGenerationId} is null and not (${running}) and not (${terminal}) and not (${accepted}) and not (${queued}) and (not (${eligibleGap}) or not (${quiet})))`.mapWith(
            Number,
          ),
        waiting:
          sql<number>`count(*) filter (where ${version.deleted} = false and (${eligibleGap}) and (${quiet}))`.mapWith(
            Number,
          ),
        accepted:
          sql<number>`count(*) filter (where ${version.deleted} = false and not (${running}) and not (${terminal}) and (${accepted}))`.mapWith(
            Number,
          ),
        queued:
          sql<number>`count(*) filter (where ${version.deleted} = false and not (${running}) and not (${terminal}) and not (${accepted}) and (${queued}))`.mapWith(
            Number,
          ),
        running:
          sql<number>`count(*) filter (where ${version.deleted} = false and (${running}))`.mapWith(
            Number,
          ),
        stale:
          sql<number>`count(*) filter (where ${version.deleted} = false and ${state.activeGenerationId} is not null and (${eligibleGap}) and not (${quiet}))`.mapWith(
            Number,
          ),
        failed:
          sql<number>`count(*) filter (where ${version.deleted} = false and (${terminal}))`.mapWith(
            Number,
          ),
        upToDate:
          sql<number>`count(*) filter (where ${version.deleted} = false and ${state.activeGenerationId} is not null and not (${gap}) and not (${running}))`.mapWith(
            Number,
          ),
        oldestAcceptedAt:
          sql<Date | null>`min(${state.manualRequestedAt}) filter (where ${version.deleted} = false and (${accepted}))`.mapWith(
            state.manualRequestedAt,
          ),
        pending:
          sql<number>`count(*) filter (where ${version.deleted} = false and (${gap}) and not (${terminal}) and not (${running}))`.mapWith(
            Number,
          ),
      })
      .from(state)
      .innerJoin(version, this.joinCondition())
      .where(eq(state.organizationId, organizationId));
    if (!row) throw new Error('SEMANTIC_ORGANIZATION_STATS_MISSING');
    return row;
  }

  async releaseDeliveryFailure(claimed: SemanticRecoveryCandidate) {
    if (!claimed.state.lastRequeuedAt) return false;
    const changed = await this.database.db
      .update(state)
      .set({ lastRequeuedAt: null, updatedAt: sql`clock_timestamp()` })
      .where(
        and(
          this.stateCondition(claimed.scope),
          eq(state.lastRequeuedAt, claimed.state.lastRequeuedAt),
          eq(state.requeueCount, claimed.state.requeueCount),
          eq(state.observedSeq, claimed.state.observedSeq),
          eq(state.manualRequestSeq, claimed.state.manualRequestSeq),
        ),
      )
      .returning({ id: state.aggregateId });
    return changed.length === 1;
  }

  private eligibleCondition(fingerprint: string) {
    const notTerminal = or(
      not(inArray(state.runStatus, ['failed', 'validation_failed'])),
      ne(state.attemptSeq, version.desiredSeq),
      ne(state.attemptManualSeq, state.manualRequestSeq),
      isNull(state.attemptFingerprint),
      ne(state.attemptFingerprint, fingerprint),
    );
    const cooldown = sql`least(300000 * power(2, least(${state.requeueCount}, 4)), 3600000) * interval '1 millisecond'`;
    return and(
      // 첫 수동 전달·새 desired는 즉시 복구한다. 이후의 반복 접수에만 cooldown을 적용한다.
      or(
        lt(state.indexedManualSeq, state.manualRequestSeq),
        isNull(state.lastRequeuedAt),
        lt(state.observedSeq, version.desiredSeq),
        lt(state.lastRequeuedAt, sql`clock_timestamp() - ${cooldown}`),
      ),
      or(
        and(
          eq(version.deleted, true),
          or(
            lt(state.indexedSeq, version.desiredSeq),
            eq(state.gcRequired, true),
          ),
        ),
        and(
          eq(version.deleted, false),
          notTerminal,
          or(
            lt(state.indexedManualSeq, state.manualRequestSeq),
            lt(state.indexedSeq, version.desiredSeq),
            and(
              sql`${state.indexedSeq} > 0`,
              or(
                isNull(state.indexedFingerprint),
                ne(state.indexedFingerprint, fingerprint),
              ),
            ),
            and(
              eq(state.runStatus, 'running'),
              lt(
                state.leaseExpiresAt,
                sql`clock_timestamp() - interval '1 minute'`,
              ),
            ),
            and(
              eq(state.gcRequired, true),
              isNull(state.leaseToken),
              lt(
                sql`coalesce(${state.lastIndexedAt}, ${state.updatedAt})`,
                sql`clock_timestamp() - interval '10 minutes'`,
              ),
            ),
          ),
        ),
      ),
    );
  }
  private joinCondition() {
    return and(
      eq(state.organizationId, version.organizationId),
      eq(state.aggregateKind, version.aggregateKind),
      eq(state.aggregateId, version.aggregateId),
    );
  }
  private stateCondition(scope: SemanticSourceScope) {
    return and(
      eq(state.organizationId, scope.organizationId),
      eq(state.aggregateKind, scope.aggregateKind),
      eq(state.aggregateId, scope.aggregateId),
    );
  }
  private versionCondition(
    scope: Pick<SemanticSourceScope, 'organizationId' | 'aggregateId'> & {
      aggregateKind: typeof version.$inferSelect.aggregateKind;
    },
  ) {
    return and(
      eq(version.organizationId, scope.organizationId),
      eq(version.aggregateKind, scope.aggregateKind),
      eq(version.aggregateId, scope.aggregateId),
    );
  }
}
