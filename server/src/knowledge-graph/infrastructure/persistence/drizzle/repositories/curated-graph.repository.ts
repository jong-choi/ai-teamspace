import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import {
  CuratedGraphEndpointInvalidError,
  CuratedGraphNodeConnectedError,
  CuratedGraphRevisionConflictError,
} from '@/knowledge-graph/domain/curated-graph.error';
import type {
  CreateCuratedEdgeInput,
  CreateCuratedNodeInput,
  UpdateCuratedEdgeInput,
  UpdateCuratedNodeInput,
} from '@/knowledge-graph/dto/curated-graph.dto';
import { CuratedGraphRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph.repository';
import { curatedEdge } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edge.schema';
import { curatedEditAudit } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edit-audit.schema';
import {
  CreateCuratedEdgeSchema,
  CreateCuratedNodeSchema,
  curatedEdgeSelectSchema,
  curatedNodeSelectSchema,
  UpdateCuratedEdgeSchema,
  UpdateCuratedNodeSchema,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-graph.zod';
import { curatedNode } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-node.schema';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';

import { and, eq, inArray, isNull, or } from 'drizzle-orm';

type CuratedGraphTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

@Injectable()
export class CuratedGraphDrizzleRepository extends CuratedGraphRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly graphEvents: OutboxAggregateChangePublisher,
  ) {
    super();
  }

  async createNode(
    organizationId: string,
    actorUserId: string,
    input: CreateCuratedNodeInput,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const parsed = CreateCuratedNodeSchema.parse(input);
      const now = new Date();
      const [row] = await transaction
        .insert(curatedNode)
        .values({
          organizationId,
          kind: parsed.kind,
          title: parsed.title,
          properties: parsed.properties,
          status: 'active',
          revision: 1,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .returning();
      if (!row) throw new Error('curated node 생성 결과가 없습니다.');

      await this.appendAudit(transaction, {
        organizationId,
        actorUserId,
        targetKind: 'node',
        targetId: row.id,
        operation: 'create',
        targetRevision: row.revision,
        before: null,
        after: row,
        occurredAt: now,
      });
      await this.graphEvents.curatedNodeChanged(
        transaction,
        organizationId,
        row.id,
        'changed',
      );
      return curatedNodeSelectSchema.parse(row);
    });
  }

  async updateNode(
    organizationId: string,
    nodeId: string,
    actorUserId: string,
    expectedRevision: number,
    input: UpdateCuratedNodeInput,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const current = await this.lockActiveNode(
        transaction,
        organizationId,
        nodeId,
      );
      if (!current) return null;
      this.assertRevision(current.revision, expectedRevision);
      const parsed = UpdateCuratedNodeSchema.parse(input);
      const now = new Date();
      const [row] = await transaction
        .update(curatedNode)
        .set({
          ...parsed,
          revision: current.revision + 1,
          updatedByUserId: actorUserId,
          updatedAt: now,
        })
        .where(
          and(
            eq(curatedNode.organizationId, organizationId),
            eq(curatedNode.id, nodeId),
            eq(curatedNode.revision, current.revision),
            isNull(curatedNode.deletedAt),
          ),
        )
        .returning();
      if (!row) throw new CuratedGraphRevisionConflictError();

      await this.appendAudit(transaction, {
        organizationId,
        actorUserId,
        targetKind: 'node',
        targetId: nodeId,
        operation: 'update',
        targetRevision: row.revision,
        before: current,
        after: row,
        occurredAt: now,
      });
      await this.graphEvents.curatedNodeChanged(
        transaction,
        organizationId,
        nodeId,
        'changed',
      );
      return curatedNodeSelectSchema.parse(row);
    });
  }

  async deleteNode(
    organizationId: string,
    nodeId: string,
    actorUserId: string,
    expectedRevision: number,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const current = await this.lockActiveNode(
        transaction,
        organizationId,
        nodeId,
      );
      if (!current) return null;
      this.assertRevision(current.revision, expectedRevision);
      const [connected] = await transaction
        .select({ id: curatedEdge.id })
        .from(curatedEdge)
        .where(
          and(
            eq(curatedEdge.organizationId, organizationId),
            isNull(curatedEdge.deletedAt),
            or(
              eq(curatedEdge.sourceNodeId, nodeId),
              eq(curatedEdge.targetNodeId, nodeId),
            ),
          ),
        )
        .limit(1);
      if (connected) throw new CuratedGraphNodeConnectedError();

      const now = new Date();
      const [row] = await transaction
        .update(curatedNode)
        .set({
          status: 'deleted',
          revision: current.revision + 1,
          updatedByUserId: actorUserId,
          updatedAt: now,
          deletedAt: now,
        })
        .where(
          and(
            eq(curatedNode.organizationId, organizationId),
            eq(curatedNode.id, nodeId),
            eq(curatedNode.revision, current.revision),
            isNull(curatedNode.deletedAt),
          ),
        )
        .returning();
      if (!row) throw new CuratedGraphRevisionConflictError();

      await this.appendAudit(transaction, {
        organizationId,
        actorUserId,
        targetKind: 'node',
        targetId: nodeId,
        operation: 'delete',
        targetRevision: row.revision,
        before: current,
        after: row,
        occurredAt: now,
      });
      await this.graphEvents.curatedNodeChanged(
        transaction,
        organizationId,
        nodeId,
        'removed',
      );
      return curatedNodeSelectSchema.parse(row);
    });
  }

  async createEdge(
    organizationId: string,
    actorUserId: string,
    input: CreateCuratedEdgeInput,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const parsed = CreateCuratedEdgeSchema.parse(input);
      await this.assertActiveEndpoints(
        transaction,
        organizationId,
        parsed.sourceNodeId,
        parsed.targetNodeId,
      );
      const now = new Date();
      const [row] = await transaction
        .insert(curatedEdge)
        .values({
          organizationId,
          sourceNodeId: parsed.sourceNodeId,
          targetNodeId: parsed.targetNodeId,
          predicate: parsed.predicate,
          directed: parsed.directed,
          properties: parsed.properties,
          status: 'active',
          revision: 1,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .returning();
      if (!row) throw new Error('curated edge 생성 결과가 없습니다.');

      await this.appendAudit(transaction, {
        organizationId,
        actorUserId,
        targetKind: 'edge',
        targetId: row.id,
        operation: 'create',
        targetRevision: row.revision,
        before: null,
        after: row,
        occurredAt: now,
      });
      await this.graphEvents.curatedEdgeChanged(
        transaction,
        organizationId,
        row.id,
        'changed',
      );
      return curatedEdgeSelectSchema.parse(row);
    });
  }

  async updateEdge(
    organizationId: string,
    edgeId: string,
    actorUserId: string,
    expectedRevision: number,
    input: UpdateCuratedEdgeInput,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const current = await this.lockActiveEdge(
        transaction,
        organizationId,
        edgeId,
      );
      if (!current) return null;
      this.assertRevision(current.revision, expectedRevision);
      const parsed = UpdateCuratedEdgeSchema.parse(input);
      const now = new Date();
      const [row] = await transaction
        .update(curatedEdge)
        .set({
          ...parsed,
          revision: current.revision + 1,
          updatedByUserId: actorUserId,
          updatedAt: now,
        })
        .where(
          and(
            eq(curatedEdge.organizationId, organizationId),
            eq(curatedEdge.id, edgeId),
            eq(curatedEdge.revision, current.revision),
            isNull(curatedEdge.deletedAt),
          ),
        )
        .returning();
      if (!row) throw new CuratedGraphRevisionConflictError();

      await this.appendAudit(transaction, {
        organizationId,
        actorUserId,
        targetKind: 'edge',
        targetId: edgeId,
        operation: 'update',
        targetRevision: row.revision,
        before: current,
        after: row,
        occurredAt: now,
      });
      await this.graphEvents.curatedEdgeChanged(
        transaction,
        organizationId,
        edgeId,
        'changed',
      );
      return curatedEdgeSelectSchema.parse(row);
    });
  }

  async deleteEdge(
    organizationId: string,
    edgeId: string,
    actorUserId: string,
    expectedRevision: number,
  ) {
    return this.database.db.transaction(async (transaction) => {
      const current = await this.lockActiveEdge(
        transaction,
        organizationId,
        edgeId,
      );
      if (!current) return null;
      this.assertRevision(current.revision, expectedRevision);
      const now = new Date();
      const [row] = await transaction
        .update(curatedEdge)
        .set({
          status: 'deleted',
          revision: current.revision + 1,
          updatedByUserId: actorUserId,
          updatedAt: now,
          deletedAt: now,
        })
        .where(
          and(
            eq(curatedEdge.organizationId, organizationId),
            eq(curatedEdge.id, edgeId),
            eq(curatedEdge.revision, current.revision),
            isNull(curatedEdge.deletedAt),
          ),
        )
        .returning();
      if (!row) throw new CuratedGraphRevisionConflictError();

      await this.appendAudit(transaction, {
        organizationId,
        actorUserId,
        targetKind: 'edge',
        targetId: edgeId,
        operation: 'delete',
        targetRevision: row.revision,
        before: current,
        after: row,
        occurredAt: now,
      });
      await this.graphEvents.curatedEdgeChanged(
        transaction,
        organizationId,
        edgeId,
        'removed',
      );
      return curatedEdgeSelectSchema.parse(row);
    });
  }

  private async lockActiveNode(
    transaction: CuratedGraphTransaction,
    organizationId: string,
    nodeId: string,
  ) {
    const [row] = await transaction
      .select()
      .from(curatedNode)
      .where(
        and(
          eq(curatedNode.organizationId, organizationId),
          eq(curatedNode.id, nodeId),
          isNull(curatedNode.deletedAt),
        ),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  private async lockActiveEdge(
    transaction: CuratedGraphTransaction,
    organizationId: string,
    edgeId: string,
  ) {
    const [row] = await transaction
      .select()
      .from(curatedEdge)
      .where(
        and(
          eq(curatedEdge.organizationId, organizationId),
          eq(curatedEdge.id, edgeId),
          isNull(curatedEdge.deletedAt),
        ),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  private async assertActiveEndpoints(
    transaction: CuratedGraphTransaction,
    organizationId: string,
    sourceNodeId: string,
    targetNodeId: string,
  ): Promise<void> {
    if (sourceNodeId === targetNodeId) {
      throw new CuratedGraphEndpointInvalidError();
    }
    const rows = await transaction
      .select({ id: curatedNode.id })
      .from(curatedNode)
      .where(
        and(
          eq(curatedNode.organizationId, organizationId),
          isNull(curatedNode.deletedAt),
          inArray(curatedNode.id, [sourceNodeId, targetNodeId]),
        ),
      )
      .for('update');
    if (new Set(rows.map(({ id }) => id)).size !== 2) {
      throw new CuratedGraphEndpointInvalidError();
    }
  }

  private assertRevision(currentRevision: number, expectedRevision: number) {
    if (currentRevision !== expectedRevision) {
      throw new CuratedGraphRevisionConflictError();
    }
  }

  private async appendAudit(
    transaction: CuratedGraphTransaction,
    event: Omit<
      typeof curatedEditAudit.$inferInsert,
      'eventId' | 'beforeDigest' | 'afterDigest'
    > & {
      before:
        | typeof curatedNode.$inferSelect
        | typeof curatedEdge.$inferSelect
        | null;
      after:
        | typeof curatedNode.$inferSelect
        | typeof curatedEdge.$inferSelect
        | null;
    },
  ): Promise<void> {
    await transaction.insert(curatedEditAudit).values({
      organizationId: event.organizationId,
      actorUserId: event.actorUserId,
      targetKind: event.targetKind,
      targetId: event.targetId,
      operation: event.operation,
      targetRevision: event.targetRevision,
      beforeDigest: event.before === null ? null : digest(event.before),
      afterDigest: event.after === null ? null : digest(event.after),
      occurredAt: event.occurredAt,
    });
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson(Reflect.get(value, key))}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
