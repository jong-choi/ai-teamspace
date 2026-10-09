import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';

import { createSelectSchema } from 'drizzle-zod';

export const outboxAggregateVersionSelectSchema = createSelectSchema(
  outboxAggregateVersion,
);
