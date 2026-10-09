import type { SemanticStageInput } from '@/knowledge-graph/domain/semantic-generation';
import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';

export abstract class SemanticGraphStore {
  abstract stageGeneration(input: SemanticStageInput): Promise<void>;
  abstract deleteGeneration(
    scope: SemanticSourceScope,
    generationId: string,
  ): Promise<void>;
  abstract deleteInactiveGenerations(
    scope: SemanticSourceScope,
    keepGenerationId: string | null,
    olderThan: Date,
  ): Promise<boolean>;
}
