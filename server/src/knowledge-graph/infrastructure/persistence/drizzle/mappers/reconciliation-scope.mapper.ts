import type { ReconciliationScope } from '@/knowledge-graph/domain/reconciliation-scope';
import type { reconciliationScope } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.schema';
import { ReconciliationScopeSchema } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.zod';

export function toReconciliationScopeDomain(
  row: typeof reconciliationScope.$inferSelect,
): ReconciliationScope {
  return ReconciliationScopeSchema.parse(row);
}
