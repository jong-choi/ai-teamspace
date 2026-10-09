import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import { semanticRetryLimits } from '@/knowledge-graph/domain/semantic-retry-policy';
import {
  type SemanticSourceScope,
  SemanticSourceScopeSchema,
} from '@/outbox/domain/semantic-source';

export const KNOWLEDGE_GRAPH_SEMANTIC_QUEUE = 'knowledge-graph-semantic';
export const SEMANTIC_AUTO_JOB = 'semantic-auto';
export const SEMANTIC_MANUAL_JOB = 'semantic-manual';
export const SEMANTIC_REMOVE_JOB = 'semantic-remove';
export const SemanticJobDataSchema = SemanticSourceScopeSchema.strict();

export const SEMANTIC_JOB_OPTIONS = {
  attempts: semanticRetryLimits.attempts,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 7 * 86400 },
} as const;

export function semanticAutoDedupId(scope: SemanticSourceScope) {
  return `kg-semantic-auto-${digestGraphJson([scope.organizationId, scope.aggregateKind, scope.aggregateId])}`;
}
export function semanticRemoveJobId(
  scope: SemanticSourceScope,
  desiredSeq: number,
) {
  return `kg-semantic-remove-${digestGraphJson([scope.organizationId, scope.aggregateKind, scope.aggregateId])}-${desiredSeq}`;
}
