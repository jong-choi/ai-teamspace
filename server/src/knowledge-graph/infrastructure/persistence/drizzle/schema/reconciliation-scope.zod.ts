import { reconciliationScope } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.schema';

import { createSelectSchema, createUpdateSchema } from 'drizzle-zod';

export const ReconciliationScopeSchema =
  createSelectSchema(reconciliationScope);
export const ReconciliationProgressSchema = createUpdateSchema(
  reconciliationScope,
).pick({
  afterOrganizationId: true,
  afterAggregateId: true,
});
