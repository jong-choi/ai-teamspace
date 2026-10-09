import type {
  WikiGraphPageQuery,
  WikiGraphSource,
  WikiKeywordCandidate,
  WikiSemanticGraphSource,
} from '@/wiki/domain/wiki-graph-source';
import type { WikiProjectionSource } from '@/wiki/domain/wiki-projection-source';
import type { WikiSemanticSource } from '@/wiki/domain/wiki-semantic-source';

export abstract class WikiProjectionSourceRepository {
  abstract currentSemantic(
    organizationId: string,
    sourceId: string,
  ): Promise<WikiSemanticSource | null>;
  abstract current(
    organizationId: string,
    sourceId: string,
  ): Promise<WikiProjectionSource | null>;
  abstract listIds(
    organizationId: string,
    afterId: string | null,
    limit: number,
  ): Promise<Pick<WikiProjectionSource, 'id'>[]>;
  abstract currentManyForGraph(
    organizationId: string,
    ids: readonly string[],
  ): Promise<WikiGraphSource[]>;
  abstract currentSemanticMany(
    organizationId: string,
    ids: readonly string[],
  ): Promise<WikiSemanticGraphSource[]>;
  abstract keywordCandidates(
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<WikiKeywordCandidate[]>;
  abstract listForGraph(
    organizationId: string,
    query: WikiGraphPageQuery,
  ): Promise<WikiGraphSource[]>;
}
