import type { SemanticCorrectionGraph } from '@/knowledge-graph/domain/semantic-correction';
import type { SemanticSourceScope } from '@/outbox/domain/semantic-source';

export abstract class SemanticGraphReader {
  abstract readGeneration(
    scope: SemanticSourceScope,
    generationId: string,
  ): Promise<SemanticCorrectionGraph>;
}
