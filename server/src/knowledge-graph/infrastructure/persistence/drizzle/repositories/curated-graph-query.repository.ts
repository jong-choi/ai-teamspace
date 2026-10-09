import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { CuratedGraphQueryRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph-query.repository';
import { curatedEdge } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edge.schema';
import { curatedNode } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-node.schema';
import { toLikeContainsPattern } from '@/utils/like-pattern';

import { and, asc, count, eq, gt, ilike, isNull, or } from 'drizzle-orm';

@Injectable()
export class CuratedGraphQueryDrizzleRepository extends CuratedGraphQueryRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  listNodes(
    organizationId: string,
    query: Parameters<CuratedGraphQueryRepository['listNodes']>[1],
  ) {
    return this.database.db
      .select()
      .from(curatedNode)
      .where(
        and(
          eq(curatedNode.organizationId, organizationId),
          eq(curatedNode.status, 'active'),
          isNull(curatedNode.deletedAt),
          query.q
            ? ilike(curatedNode.title, toLikeContainsPattern(query.q))
            : undefined,
          query.after
            ? or(
                gt(curatedNode.title, query.after.title),
                and(
                  eq(curatedNode.title, query.after.title),
                  gt(curatedNode.id, query.after.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(curatedNode.title), asc(curatedNode.id))
      .limit(query.limit);
  }

  async countNodes(organizationId: string, q?: string | null) {
    const [row] = await this.database.db
      .select({ value: count() })
      .from(curatedNode)
      .where(
        and(
          eq(curatedNode.organizationId, organizationId),
          eq(curatedNode.status, 'active'),
          isNull(curatedNode.deletedAt),
          q ? ilike(curatedNode.title, toLikeContainsPattern(q)) : undefined,
        ),
      );
    return row?.value ?? 0;
  }

  async nodeById(organizationId: string, nodeId: string) {
    const [row] = await this.database.db
      .select()
      .from(curatedNode)
      .where(
        and(
          eq(curatedNode.organizationId, organizationId),
          eq(curatedNode.id, nodeId),
          eq(curatedNode.status, 'active'),
          isNull(curatedNode.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async countConnectedEdges(organizationId: string, nodeId: string) {
    const [row] = await this.database.db
      .select({ value: count() })
      .from(curatedEdge)
      .where(this.activeConnectedEdgeCondition(organizationId, nodeId));
    return row?.value ?? 0;
  }

  listConnectedEdges(organizationId: string, nodeId: string, limit: number) {
    return this.database.db
      .select()
      .from(curatedEdge)
      .where(this.activeConnectedEdgeCondition(organizationId, nodeId))
      .orderBy(asc(curatedEdge.id))
      .limit(limit);
  }

  listEdges(
    organizationId: string,
    query: Parameters<CuratedGraphQueryRepository['listEdges']>[1],
  ) {
    return this.database.db
      .select()
      .from(curatedEdge)
      .where(
        and(
          this.activeEdgeCondition(organizationId),
          query.afterId ? gt(curatedEdge.id, query.afterId) : undefined,
        ),
      )
      .orderBy(asc(curatedEdge.id))
      .limit(query.limit);
  }

  async countEdges(organizationId: string) {
    const [row] = await this.database.db
      .select({ value: count() })
      .from(curatedEdge)
      .where(this.activeEdgeCondition(organizationId));
    return row?.value ?? 0;
  }

  async edgeById(organizationId: string, edgeId: string) {
    const [row] = await this.database.db
      .select()
      .from(curatedEdge)
      .where(
        and(
          this.activeEdgeCondition(organizationId),
          eq(curatedEdge.id, edgeId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private activeEdgeCondition(organizationId: string) {
    return and(
      eq(curatedEdge.organizationId, organizationId),
      eq(curatedEdge.status, 'active'),
      isNull(curatedEdge.deletedAt),
    );
  }

  private activeConnectedEdgeCondition(organizationId: string, nodeId: string) {
    return and(
      this.activeEdgeCondition(organizationId),
      or(
        eq(curatedEdge.sourceNodeId, nodeId),
        eq(curatedEdge.targetNodeId, nodeId),
      ),
    );
  }
}
