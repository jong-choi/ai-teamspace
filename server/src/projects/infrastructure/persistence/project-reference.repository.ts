import type { ProjectReference } from '@/projects/domain/project-reference';

export abstract class ProjectReferenceRepository {
  abstract findByIds(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<ProjectReference[]>;
}
