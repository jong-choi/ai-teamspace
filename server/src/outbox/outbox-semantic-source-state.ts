import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import {
  type SemanticActivation,
  type SemanticLease,
  SemanticLeaseSchema,
  type SemanticReleaseOutcome,
  SemanticReleaseOutcomeSchema,
  type SemanticSatisfaction,
  SemanticSourceCurrentSchema,
  type SemanticSourceScope,
} from '@/outbox/domain/semantic-source';
import { outboxAggregateVersion as version } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { outboxSemanticSourceState as state } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';

import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  not,
  or,
  sql,
} from 'drizzle-orm';

@Injectable()
export class OutboxSemanticSourceState {
  constructor(private readonly database: DatabaseService) {}

  async listSearchableSources(
    organizationId: string,
    fingerprint: string,
    limit: number,
  ) {
    return this.database.db
      .select({
        aggregateId: state.aggregateId,
        deleted: version.deleted,
        activeGenerationId: state.activeGenerationId,
        indexedSignature: state.indexedSignature,
        indexedSourceUpdatedAt: state.indexedSourceUpdatedAt,
        indexedFingerprint: state.indexedFingerprint,
      })
      .from(state)
      .innerJoin(
        version,
        and(
          eq(version.organizationId, state.organizationId),
          eq(version.aggregateKind, state.aggregateKind),
          eq(version.aggregateId, state.aggregateId),
        ),
      )
      .where(
        and(
          eq(state.organizationId, organizationId),
          eq(state.aggregateKind, 'wiki_document'),
          isNotNull(state.activeGenerationId),
          eq(state.indexedFingerprint, fingerprint),
          eq(version.deleted, false),
        ),
      )
      .orderBy(asc(state.aggregateId))
      .limit(limit);
  }

  async currentBatch(
    organizationId: string,
    kind: 'wiki_document',
    ids: readonly string[],
  ) {
    if (ids.length === 0) return [];
    return this.database.db
      .select({
        aggregateId: version.aggregateId,
        desiredSeq: version.desiredSeq,
        deleted: version.deleted,
        updatedAt: version.updatedAt,
        activeGenerationId: state.activeGenerationId,
        indexedSignature: state.indexedSignature,
        indexedSourceUpdatedAt: state.indexedSourceUpdatedAt,
        indexedFingerprint: state.indexedFingerprint,
      })
      .from(version)
      .leftJoin(
        state,
        and(
          eq(state.organizationId, version.organizationId),
          eq(state.aggregateKind, version.aggregateKind),
          eq(state.aggregateId, version.aggregateId),
        ),
      )
      .where(
        and(
          eq(version.organizationId, organizationId),
          eq(version.aggregateKind, kind),
          inArray(version.aggregateId, [...new Set(ids)]),
        ),
      );
  }

  async current(scope: SemanticSourceScope) {
    const [row] = await this.database.db
      .select({
        version: {
          desiredSeq: version.desiredSeq,
          deleted: version.deleted,
          updatedAt: version.updatedAt,
        },
        state,
        dbNow: sql<Date>`clock_timestamp()`.mapWith(state.updatedAt),
      })
      .from(version)
      .leftJoin(
        state,
        and(
          eq(state.organizationId, version.organizationId),
          eq(state.aggregateKind, version.aggregateKind),
          eq(state.aggregateId, version.aggregateId),
        ),
      )
      .where(this.versionCondition(scope))
      .limit(1);
    return row ? SemanticSourceCurrentSchema.parse(row) : null;
  }

  async observeCommitted(scope: SemanticSourceScope, sourceVersion: number) {
    return this.database.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(version)
        .where(this.versionCondition(scope))
        .for('share')
        .limit(1);
      if (!current) return { kind: 'missing' } as const;
      await transaction.insert(state).values(scope).onConflictDoNothing();
      if (current.desiredSeq === sourceVersion) {
        await transaction
          .update(state)
          .set({
            observedSeq: sourceVersion,
            observedAt: sql`clock_timestamp()`,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              this.stateCondition(scope),
              sql`${state.observedSeq} < ${sourceVersion}`,
            ),
          );
      }
      const [observed] = await transaction
        .select({
          observedSeq: state.observedSeq,
          observedAt: state.observedAt,
          dbNow: sql<Date>`clock_timestamp()`.mapWith(state.updatedAt),
        })
        .from(state)
        .where(this.stateCondition(scope))
        .limit(1);
      if (!observed) throw new Error('SEMANTIC_STATE_MISSING');
      return {
        kind: current.desiredSeq === sourceVersion ? 'observed' : 'stale',
        ...observed,
        desiredSeq: current.desiredSeq,
        deleted: current.deleted,
      } as const;
    });
  }

  async acquireLease(scope: SemanticSourceScope, fingerprint: string) {
    return this.database.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(version)
        .where(this.versionCondition(scope))
        .for('share')
        .limit(1);
      if (!current) return 'missing' as const;
      await transaction.insert(state).values(scope).onConflictDoNothing();
      await transaction
        .select({ id: state.aggregateId })
        .from(state)
        .where(this.stateCondition(scope))
        .for('update');
      const [claimed] = await transaction
        .update(state)
        .set({
          leaseToken: randomUUID(),
          leaseExpiresAt: sql`clock_timestamp() + interval '5 minutes'`,
          fenceToken: sql`${state.fenceToken} + 1`,
          attemptSeq: current.desiredSeq,
          retryCount: sql`case when ${state.attemptSeq} = ${current.desiredSeq} and ${state.attemptManualSeq} = ${state.manualRequestSeq} and ${state.attemptFingerprint} = ${fingerprint} then ${state.retryCount} else 0 end`,
          attemptManualSeq: state.manualRequestSeq,
          attemptFingerprint: fingerprint,
          runStatus: 'running',
          gcRequired: true,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            this.stateCondition(scope),
            or(
              isNull(state.leaseToken),
              lte(state.leaseExpiresAt, sql`clock_timestamp()`),
            ),
            current.deleted
              ? undefined
              : or(
                  not(
                    inArray(state.runStatus, ['failed', 'validation_failed']),
                  ),
                  ne(state.attemptSeq, current.desiredSeq),
                  ne(state.attemptManualSeq, state.manualRequestSeq),
                  isNull(state.attemptFingerprint),
                  ne(state.attemptFingerprint, fingerprint),
                ),
          ),
        )
        .returning();
      return claimed ? SemanticLeaseSchema.parse(claimed) : ('busy' as const);
    });
  }

  async heartbeat(scope: SemanticSourceScope, lease: SemanticLease) {
    return this.database.db.transaction(async (transaction) => {
      await transaction
        .select({ id: state.aggregateId })
        .from(state)
        .where(this.stateCondition(scope))
        .for('update');
      const changed = await transaction
        .update(state)
        .set({
          leaseExpiresAt: sql`clock_timestamp() + interval '5 minutes'`,
          updatedAt: sql`now()`,
        })
        .where(this.leaseCondition(scope, lease))
        .returning({ token: state.leaseToken });
      return changed.length === 1;
    });
  }

  async release(
    scope: SemanticSourceScope,
    lease: SemanticLease,
    outcome: SemanticReleaseOutcome,
  ) {
    const parsed = SemanticReleaseOutcomeSchema.parse(outcome);
    return this.database.db.transaction(async (transaction) => {
      await transaction
        .select({ id: state.aggregateId })
        .from(state)
        .where(this.stateCondition(scope))
        .for('update');
      const changed = await transaction
        .update(state)
        .set({
          ...parsed,
          leaseToken: null,
          leaseExpiresAt: null,
          retryCount:
            parsed.runStatus === 'idle' ? 0 : sql`${state.retryCount} + 1`,
          updatedAt: sql`now()`,
        })
        .where(this.leaseCondition(scope, lease))
        .returning({ kind: state.aggregateKind });
      return changed.length === 1;
    });
  }

  activate(
    scope: SemanticSourceScope,
    lease: SemanticLease,
    result: SemanticActivation,
  ) {
    return this.complete(scope, lease, result, result.activeGenerationId);
  }

  satisfyWithoutReindex(
    scope: SemanticSourceScope,
    lease: SemanticLease,
    result: SemanticSatisfaction,
  ) {
    return this.complete(scope, lease, result);
  }

  markRemoved(scope: SemanticSourceScope, lease: SemanticLease) {
    return this.complete(scope, lease, null);
  }

  async clearGc(
    scope: SemanticSourceScope,
    expectedActiveGenerationId: string | null,
  ) {
    const changed = await this.database.db
      .update(state)
      .set({ gcRequired: false, updatedAt: sql`now()` })
      .where(
        and(
          this.stateCondition(scope),
          isNull(state.leaseToken),
          expectedActiveGenerationId === null
            ? isNull(state.activeGenerationId)
            : eq(state.activeGenerationId, expectedActiveGenerationId),
        ),
      )
      .returning({ kind: state.aggregateKind });
    return changed.length === 1;
  }

  private async complete(
    scope: SemanticSourceScope,
    lease: SemanticLease,
    result: SemanticSatisfaction | null,
    generationId?: string,
  ) {
    return this.database.db.transaction(async (transaction) => {
      // registry를 먼저 잠가 owner 변경과 state 활성화의 잠금 순서를 통일한다.
      const [current] = await transaction
        .select()
        .from(version)
        .where(this.versionCondition(scope))
        .for('share')
        .limit(1);
      const [previous] = await transaction
        .select()
        .from(state)
        .where(this.stateCondition(scope))
        .for('update')
        .limit(1);
      if (!current || !previous) return { outcome: 'superseded' } as const;
      const validVersion =
        current.desiredSeq === lease.attemptSeq &&
        current.deleted === (result === null);
      const satisfying = result !== null && generationId === undefined;
      const validSatisfaction =
        !satisfying ||
        (previous.activeGenerationId !== null &&
          previous.indexedSignature === result.indexedSignature &&
          previous.indexedFingerprint === result.indexedFingerprint &&
          previous.indexedManualSeq === previous.manualRequestSeq);
      const changed =
        validVersion && validSatisfaction
          ? await transaction
              .update(state)
              .set({
                activeGenerationId:
                  result === null
                    ? null
                    : (generationId ?? previous.activeGenerationId),
                indexedSeq: lease.attemptSeq,
                indexedManualSeq:
                  result === null
                    ? previous.manualRequestSeq
                    : generationId
                      ? lease.attemptManualSeq
                      : previous.indexedManualSeq,
                indexedSignature: result?.indexedSignature ?? null,
                indexedSourceUpdatedAt: result?.indexedSourceUpdatedAt ?? null,
                indexedFingerprint: result?.indexedFingerprint ?? null,
                lastIndexedAt: sql`clock_timestamp()`,
                runStatus: 'idle',
                lastErrorCode: null,
                retryCount: 0,
                leaseToken: null,
                leaseExpiresAt: null,
                requeueCount: 0,
                lastRequeuedAt: null,
                gcRequired: true,
                updatedAt: sql`now()`,
              })
              .where(
                and(
                  this.leaseCondition(scope, lease),
                  eq(state.attemptSeq, lease.attemptSeq),
                  eq(state.attemptManualSeq, lease.attemptManualSeq),
                  eq(state.attemptFingerprint, lease.attemptFingerprint),
                  result
                    ? eq(state.attemptFingerprint, result.indexedFingerprint)
                    : undefined,
                  result
                    ? eq(state.manualRequestSeq, lease.attemptManualSeq)
                    : undefined,
                ),
              )
              .returning({ active: state.activeGenerationId })
          : [];
      if (changed.length === 1)
        return {
          outcome: 'activated',
          previousGenerationId: previous.activeGenerationId,
        } as const;
      // 실패한 CAS는 자기 lease만 반납한다. takeover 이후의 다른 run은 건드리지 않는다.
      await transaction
        .update(state)
        .set({
          runStatus: 'idle',
          leaseToken: null,
          leaseExpiresAt: null,
          gcRequired: true,
          updatedAt: sql`now()`,
        })
        .where(this.leaseCondition(scope, lease));
      return { outcome: 'superseded' } as const;
    });
  }

  private stateCondition(scope: SemanticSourceScope) {
    return and(
      eq(state.organizationId, scope.organizationId),
      eq(state.aggregateKind, scope.aggregateKind),
      eq(state.aggregateId, scope.aggregateId),
    );
  }
  private versionCondition(scope: SemanticSourceScope) {
    return and(
      eq(version.organizationId, scope.organizationId),
      eq(version.aggregateKind, scope.aggregateKind),
      eq(version.aggregateId, scope.aggregateId),
    );
  }
  private leaseCondition(scope: SemanticSourceScope, lease: SemanticLease) {
    return and(
      this.stateCondition(scope),
      eq(state.leaseToken, lease.leaseToken),
      eq(state.fenceToken, lease.fenceToken),
      gt(state.leaseExpiresAt, sql`clock_timestamp()`),
    );
  }
}
