import type { ProjectProjectionSource } from '@/projects/domain/project-projection-source';

export abstract class ProjectProjectionSourceRepository {
  abstract current(
    organizationId: string,
    sourceId: string,
  ): Promise<ProjectProjectionSource | null>;
  abstract listIds(
    organizationId: string,
    afterId: string | null,
    limit: number,
  ): Promise<Pick<ProjectProjectionSource, 'id'>[]>;
}
