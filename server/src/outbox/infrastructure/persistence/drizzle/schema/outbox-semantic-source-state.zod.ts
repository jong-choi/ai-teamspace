import { outboxSemanticSourceState } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

export const OutboxSemanticSourceStateSelectSchema = createSelectSchema(
  outboxSemanticSourceState,
);
export const OutboxSemanticSourceStateInsertSchema = createInsertSchema(
  outboxSemanticSourceState,
);
export const OutboxSemanticSourceStateUpdateSchema = createUpdateSchema(
  outboxSemanticSourceState,
);
