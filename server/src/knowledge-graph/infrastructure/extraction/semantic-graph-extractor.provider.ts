import type { GraphDocument } from '@repo/knowledge-graph';

export abstract class SemanticGraphExtractor {
  abstract extract(
    text: string,
    chunkIndex: number,
    signal: AbortSignal,
  ): Promise<GraphDocument>;
}
