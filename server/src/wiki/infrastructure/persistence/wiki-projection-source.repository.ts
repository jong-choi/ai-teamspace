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
}
