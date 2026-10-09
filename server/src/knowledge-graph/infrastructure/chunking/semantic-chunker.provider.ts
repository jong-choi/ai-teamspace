import type { WikiSemanticSource } from '@/wiki/domain/wiki-semantic-source';

export abstract class SemanticChunkerProvider {
  abstract chunks(source: WikiSemanticSource): Promise<string[]>;
}
