import type { ProjectReference } from '#server/projects/domain/project-reference.js';

export abstract class ProjectReferenceRepository {
  abstract findByIds(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<ProjectReference[]>;
}
