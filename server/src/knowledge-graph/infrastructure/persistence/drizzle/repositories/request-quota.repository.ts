import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { KnowledgeGraphRateLimitedError } from '@/knowledge-graph/domain/graph-query.error';
import {
  RequestQuotaActionSchema,
  RequestQuotaPolicySchema,
} from '@/knowledge-graph/domain/request-quota';
import { requestQuota } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/request-quota.schema';
import { RequestQuotaRepository } from '@/knowledge-graph/infrastructure/persistence/request-quota.repository';

import { and, eq, lt, type SQL, sql } from 'drizzle-orm';

@Injectable()
export class RequestQuotaDrizzleRepository extends RequestQuotaRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async consume(input: Parameters<RequestQuotaRepository['consume']>[0]) {
    const action = RequestQuotaActionSchema.parse(input.action);
    const policy = RequestQuotaPolicySchema.parse(input.policy);
    const transaction = this.database.requireTransaction();
    const windowStartAt = sql<Date>`date_bin(make_interval(secs => ${policy.windowSeconds}), clock_timestamp(), timestamptz '1970-01-01 00:00:00+00')`;
    const organization = await this.consumeSubject({
      organizationId: input.organizationId,
      subjectKind: 'organization',
      subjectId: input.organizationId,
      action,
      windowStartAt,
      windowSeconds: policy.windowSeconds,
      limit: policy.organizationLimit,
    });
    if (input.actorUserId && policy.actorLimit !== null)
      await this.consumeSubject({
        organizationId: input.organizationId,
        subjectKind: 'actor',
        subjectId: input.actorUserId,
        action,
        windowStartAt: organization.windowStartAt,
        windowSeconds: policy.windowSeconds,
        limit: policy.actorLimit,
      });

    await transaction
      .delete(requestQuota)
      .where(
        and(
          eq(requestQuota.organizationId, input.organizationId),
          eq(requestQuota.action, action),
          lt(
            requestQuota.windowStartAt,
            sql`${organization.windowStartAt}::timestamptz - make_interval(secs => ${policy.windowSeconds * 2})`,
          ),
        ),
      );
    return organization;
  }

  private async consumeSubject(input: {
    organizationId: string;
    subjectKind: 'actor' | 'organization';
    subjectId: string;
    action: 'wiki_refresh' | 'search_query' | 'graph_rebuild';
    windowStartAt: Date | SQL<Date>;
    windowSeconds: number;
    limit: number;
  }) {
    const transaction = this.database.requireTransaction();
    const rows = await transaction
      .insert(requestQuota)
      .values({
        organizationId: input.organizationId,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        action: input.action,
        windowStartAt: input.windowStartAt,
        count: 1,
        updatedAt: sql`clock_timestamp()`,
      })
      .onConflictDoUpdate({
        target: [
          requestQuota.organizationId,
          requestQuota.subjectKind,
          requestQuota.subjectId,
          requestQuota.action,
          requestQuota.windowStartAt,
        ],
        set: {
          count: sql`${requestQuota.count} + 1`,
          updatedAt: sql`clock_timestamp()`,
        },
        setWhere: lt(requestQuota.count, input.limit),
      })
      .returning({
        windowStartAt: requestQuota.windowStartAt,
        dbNow: requestQuota.updatedAt,
      });
    const row = rows[0];
    if (!row) {
      const [current] = await transaction
        .select({
          retryAfterSeconds:
            sql<number>`greatest(1, ceil(extract(epoch from (${requestQuota.windowStartAt} + make_interval(secs => ${input.windowSeconds}) - clock_timestamp()))))`.mapWith(
              Number,
            ),
        })
        .from(requestQuota)
        .where(
          and(
            eq(requestQuota.organizationId, input.organizationId),
            eq(requestQuota.subjectKind, input.subjectKind),
            eq(requestQuota.subjectId, input.subjectId),
            eq(requestQuota.action, input.action),
            eq(requestQuota.windowStartAt, input.windowStartAt),
          ),
        )
        .limit(1);
      throw new KnowledgeGraphRateLimitedError(current?.retryAfterSeconds ?? 1);
    }
    return {
      windowStartAt: row.windowStartAt,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (row.windowStartAt.getTime() +
            input.windowSeconds * 1000 -
            row.dbNow.getTime()) /
            1000,
        ),
      ),
    };
  }
}
