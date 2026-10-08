import {
  ReconciliationProgressSchema,
  ReconciliationScopeSchema,
} from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.zod';

import type { z } from 'zod';

export const SCOPE_LEASE_MS = 120_000;
// lease 만료 전에 처리한 곳까지 cursor를 기록한다.
export const SCOPE_WORK_BUDGET_MS = 90_000;
export const ORGANIZATION_DISCOVERY_BATCH = 25;
export const ORGANIZATION_CYCLE_DELAY_MS = 10 * 60_000;

export type ReconciliationScope = z.infer<typeof ReconciliationScopeSchema>;
export type ReconciliationProgress = z.infer<
  typeof ReconciliationProgressSchema
>;
