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
}).extend({
  operation: z.enum(['changed', 'removed']),
  sourceVersion: z.number().int().positive(),
  occurredAt: z.iso.datetime(),
});
