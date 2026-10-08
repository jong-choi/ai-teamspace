import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';

import { inArray, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const purposes = [
  'organizations',
  'owner_sources',
  'membership_sources',
  'organization_presence',
] as const;
const sourceKinds = (() => {
  const [first, ...rest] =
    OutboxAggregateVersionSchema.shape.aggregateKind.options;
  if (first === undefined)
    throw new Error('투영 원본 종류는 비어 있을 수 없습니다.');
  return [first, ...rest] satisfies [typeof first, ...typeof rest];
})();

export const reconciliationScope = pgTable(
  'kg_reconciliation_scope',
  {
    id: text('id').primaryKey(),
    purpose: text('purpose', { enum: purposes }).notNull(),
    organizationId: text('organization_id'),
    aggregateKind: text('aggregate_kind', { enum: sourceKinds }),
    afterOrganizationId: text('after_organization_id'),
    afterAggregateId: text('after_aggregate_id'),
    leaseToken: uuid('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true, precision: 3 }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    failureCount: integer('failure_count').default(0).notNull(),
    lastError: text('last_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('kg_reconciliation_scope_claim_idx').on(
      table.purpose,
      table.nextRunAt,
      table.leaseUntil,
      table.id,
    ),
    check(
      'kg_reconciliation_scope_purpose_check',
      inArray(table.purpose, [...purposes]).inlineParams(),
    ),
    check(
      'kg_reconciliation_scope_kind_check',
      sql`${table.aggregateKind} is null or ${inArray(table.aggregateKind, [...sourceKinds]).inlineParams()}`,
    ),
    check(
      'kg_reconciliation_scope_owner_check',
      sql`(${table.purpose} = 'owner_sources' and ${table.organizationId} is not null and ${table.aggregateKind} is not null) or (${table.purpose} <> 'owner_sources' and ${table.organizationId} is null and ${table.aggregateKind} is null)`,
    ),
    check(
      'kg_reconciliation_scope_lease_check',
      sql`(${table.leaseToken} is null and ${table.leaseUntil} is null) or (${table.leaseToken} is not null and ${table.leaseUntil} is not null)`,
    ),
    check(
      'kg_reconciliation_scope_cursor_check',
      sql`(${inArray(table.purpose, ['organizations', 'organization_presence']).inlineParams()} and ${table.afterAggregateId} is null)
        or (${table.purpose} = 'owner_sources' and ${table.afterOrganizationId} is null)
        or (${table.purpose} = 'membership_sources' and ((${table.afterOrganizationId} is null) = (${table.afterAggregateId} is null)))`,
    ),
    check(
      'kg_reconciliation_scope_failure_count_check',
      sql`${table.failureCount} >= 0`,
    ),
  ],
);
