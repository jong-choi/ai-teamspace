import { Injectable } from '@nestjs/common';

import type { ProjectReference } from '#server/projects/domain/project-reference.js';
import { ProjectReferenceRepository } from '#server/projects/infrastructure/persistence/project-reference.repository.js';

@Injectable()
export class ProjectReferenceQueryService {
  constructor(private readonly repository: ProjectReferenceRepository) {}

  findReferences(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<ProjectReference[]> {
    return this.repository.findByIds(organizationId, projectIds);
  }
}
