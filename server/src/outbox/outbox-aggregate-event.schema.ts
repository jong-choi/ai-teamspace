import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';

import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const OutboxAggregateVersionSchema = createSelectSchema(
  outboxAggregateVersion,
);

export const OutboxAggregateEventSchema = OutboxAggregateVersionSchema.pick({
  organizationId: true,
  aggregateKind: true,
  aggregateId: true,
})
  .extend({
    organizationId: OutboxAggregateVersionSchema.shape.organizationId
      .min(1)
      .max(256),
    aggregateId: OutboxAggregateVersionSchema.shape.aggregateId.min(1).max(256),
    operation: z.enum(['changed', 'removed']),
    sourceVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    occurredAt: z.iso.datetime(),
  })
  .strict();
