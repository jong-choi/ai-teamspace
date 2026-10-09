import type {
  ProjectGraphPageQuery,
  ProjectGraphSource,
} from '@/projects/domain/project-graph-source';
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
  abstract currentManyForGraph(
    organizationId: string,
    ids: readonly string[],
  ): Promise<ProjectGraphSource[]>;
  abstract listForGraph(
    organizationId: string,
    query: ProjectGraphPageQuery,
  ): Promise<ProjectGraphSource[]>;
}
