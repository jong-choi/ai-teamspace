import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Outbox } from '@nestjs/outbox';

import { DatabaseService } from '@/database/database.service';
import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';
import { outboxAggregateVersion as version } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { outboxSemanticSourceState as state } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import {
  KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC,
  SemanticManualRequestedEventSchema,
} from '@/outbox/outbox-semantic-event.schema';

import { and, eq, gte, lt, sql } from 'drizzle-orm';

type OwnerTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

@Injectable()
export class OutboxSemanticManualRequest {
  constructor(
    private readonly database: DatabaseService,
    private readonly outbox: Outbox<OwnerTransaction>,
  ) {}

  async request(scope: SemanticSourceScope, actorUserId: string) {
    return this.database.runInTransaction(() =>
      this.requestInTransaction(scope, actorUserId),
    );
  }

  async requestInTransaction(scope: SemanticSourceScope, actorUserId: string) {
    const transaction = this.database.requireTransaction();
    const [source] = await transaction
      .select()
      .from(version)
      .where(
        and(
          eq(version.organizationId, scope.organizationId),
          eq(version.aggregateKind, scope.aggregateKind),
          eq(version.aggregateId, scope.aggregateId),
        ),
      )
      .for('share')
      .limit(1);
    if (!source || source.deleted) return { outcome: 'not_found' } as const;
    await transaction.insert(state).values(scope).onConflictDoNothing();
    const condition = and(
      eq(state.organizationId, scope.organizationId),
      eq(state.aggregateKind, scope.aggregateKind),
      eq(state.aggregateId, scope.aggregateId),
    );
    const [current] = await transaction
      .select({
        state,
        leaseValid:
          sql<boolean>`${state.leaseExpiresAt} > clock_timestamp()`.mapWith(
            Boolean,
          ),
      })
      .from(state)
      .where(condition)
      .for('update')
      .limit(1);
    if (!current) throw new Error('SEMANTIC_STATE_MISSING');
    const pending =
      current.state.manualRequestSeq > current.state.indexedManualSeq;
    const startedOrTerminal =
      current.state.attemptManualSeq === current.state.manualRequestSeq &&
      (current.leaseValid ||
        current.state.runStatus === 'failed' ||
        current.state.runStatus === 'validation_failed');
    if (pending && !startedOrTerminal) {
      if (!current.state.manualRequestId || !current.state.manualRequestedAt)
        throw new Error('SEMANTIC_MANUAL_STATE_INVALID');
      return {
        outcome: 'accepted',
        requestId: current.state.manualRequestId,
        manualRequestSeq: current.state.manualRequestSeq,
        coalesced: true,
        acceptedAt: current.state.manualRequestedAt,
      } as const;
    }
    const requestId = randomUUID();
    const [requested] = await transaction
      .update(state)
      .set({
        manualRequestSeq: sql`${state.manualRequestSeq} + 1`,
        manualRequestId: requestId,
        manualRequestedAt: sql`clock_timestamp()`,
        manualRequestedByUserId: actorUserId,
        manualTargetSeq: source.desiredSeq,
        requeueCount: 0,
        lastRequeuedAt: null,
        updatedAt: sql`now()`,
      })
      .where(condition)
      .returning();
    if (!requested?.manualRequestedAt)
      throw new Error('SEMANTIC_MANUAL_STATE_INVALID');
    await this.outbox.add(transaction, {
      topic: KNOWLEDGE_GRAPH_SEMANTIC_MANUAL_TOPIC,
      key: JSON.stringify([
        scope.aggregateKind,
        scope.organizationId,
        scope.aggregateId,
      ]),
      payload: SemanticManualRequestedEventSchema.parse({
        ...scope,
        requestId,
        manualRequestSeq: requested.manualRequestSeq,
        occurredAt: new Date().toISOString(),
      }),
    });
    return {
      outcome: 'accepted',
      requestId,
      manualRequestSeq: requested.manualRequestSeq,
      coalesced: false,
      acceptedAt: requested.manualRequestedAt,
    } as const;
  }

  async markDelivered(scope: SemanticSourceScope, manualRequestSeq: number) {
    await this.database.db
      .update(state)
      .set({ manualDeliveredSeq: manualRequestSeq, updatedAt: sql`now()` })
      .where(
        and(
          eq(state.organizationId, scope.organizationId),
          eq(state.aggregateKind, scope.aggregateKind),
          eq(state.aggregateId, scope.aggregateId),
          gte(state.manualRequestSeq, manualRequestSeq),
          lt(state.manualDeliveredSeq, manualRequestSeq),
        ),
      );
  }
}
