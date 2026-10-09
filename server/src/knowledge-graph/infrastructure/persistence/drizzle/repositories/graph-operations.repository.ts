import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { requestQuota } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/request-quota.schema';
import { GraphOperationsRepository } from '@/knowledge-graph/infrastructure/persistence/graph-operations.repository';

import { and, eq, sql } from 'drizzle-orm';

@Injectable()
export class GraphOperationsDrizzleRepository extends GraphOperationsRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async quotaUsage(organizationId: string) {
    const [row] = await this.database.db
      .select({
        refreshUsedThisHour:
          sql<number>`coalesce(sum(${requestQuota.count}) filter (where ${requestQuota.action} = 'wiki_refresh' and ${requestQuota.windowStartAt} = date_bin(interval '1 hour', clock_timestamp(), timestamptz '1970-01-01 00:00:00+00')), 0)`.mapWith(
            Number,
          ),
        searchUsedThisMinute:
          sql<number>`coalesce(sum(${requestQuota.count}) filter (where ${requestQuota.action} = 'search_query' and ${requestQuota.windowStartAt} = date_bin(interval '1 minute', clock_timestamp(), timestamptz '1970-01-01 00:00:00+00')), 0)`.mapWith(
            Number,
          ),
      })
      .from(requestQuota)
      .where(
        and(
          eq(requestQuota.organizationId, organizationId),
          eq(requestQuota.subjectKind, 'organization'),
          eq(requestQuota.subjectId, organizationId),
        ),
      );
    return {
      refreshUsedThisHour: row?.refreshUsedThisHour ?? 0,
      searchUsedThisMinute: row?.searchUsedThisMinute ?? 0,
    };
  }
}
