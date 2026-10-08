import type {
  ReconciliationProgress,
  ReconciliationScope,
} from '@/knowledge-graph/domain/reconciliation-scope';

export abstract class ReconciliationScopeRepository {
  abstract initialize(): Promise<void>;
  abstract claim(
    purpose: ReconciliationScope['purpose'],
  ): Promise<ReconciliationScope | null>;
  abstract complete(
    scope: ReconciliationScope,
    progress: ReconciliationProgress,
    outcome: {
      failed: boolean;
      delayMs: number;
      lastError?: ReconciliationScope['lastError'];
    },
  ): Promise<boolean>;
  abstract registerOrganizations(
    scope: ReconciliationScope,
    organizationIds: readonly string[],
  ): Promise<boolean>;
  abstract releaseFailed(scope: ReconciliationScope): Promise<void>;
  abstract removeOrganizationScopes(
    scope: ReconciliationScope,
    organizationId: string,
  ): Promise<boolean>;
}
