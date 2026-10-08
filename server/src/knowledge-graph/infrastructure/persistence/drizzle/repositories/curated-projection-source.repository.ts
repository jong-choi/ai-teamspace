import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { CuratedProjectionSourceRepository } from '@/knowledge-graph/infrastructure/persistence/curated-projection-source.repository';
import { curatedEdge } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-edge.schema';
import {
  curatedEdgeSelectSchema,
  curatedNodeSelectSchema,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-graph.zod';
import { curatedNode } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-node.schema';

import { and, asc, eq, gt } from 'drizzle-orm';

@Injectable()
export class CuratedProjectionSourceDrizzleRepository extends CuratedProjectionSourceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async node(organizationId: string, nodeId: string) {
    const [row] = await this.database.db
      .select()
      .from(curatedNode)
      .where(
        and(
          eq(curatedNode.organizationId, organizationId),
          eq(curatedNode.id, nodeId),
        ),
      )
      .limit(1);
    return row ? curatedNodeSelectSchema.parse(row) : null;
  }

  async edge(organizationId: string, edgeId: string) {
    const [row] = await this.database.db
      .select()
      .from(curatedEdge)
      .where(
        and(
          eq(curatedEdge.organizationId, organizationId),
          eq(curatedEdge.id, edgeId),
        ),
      )
      .limit(1);
    return row ? curatedEdgeSelectSchema.parse(row) : null;
  }
  listNodeIds(organizationId: string, afterId: string | null, limit: number) {
    return this.database.db
      .select({ id: curatedNode.id, deletedAt: curatedNode.deletedAt })
      .from(curatedNode)
      .where(
        and(
          eq(curatedNode.organizationId, organizationId),
          afterId ? gt(curatedNode.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(curatedNode.id))
      .limit(limit);
  }

  listEdgeIds(organizationId: string, afterId: string | null, limit: number) {
    return this.database.db
      .select({ id: curatedEdge.id, deletedAt: curatedEdge.deletedAt })
      .from(curatedEdge)
      .where(
        and(
          eq(curatedEdge.organizationId, organizationId),
          afterId ? gt(curatedEdge.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(curatedEdge.id))
      .limit(limit);
  }
}
