import type { WikiProjectionSource } from '@/wiki/domain/wiki-projection-source';

export abstract class WikiProjectionSourceRepository {
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
