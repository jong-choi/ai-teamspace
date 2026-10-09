import { outboxAggregateVersionSelectSchema } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.zod';

export const OutboxAggregateKindSchema =
  outboxAggregateVersionSelectSchema.shape.aggregateKind;
