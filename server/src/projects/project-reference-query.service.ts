import { Injectable } from '@nestjs/common';

import type { ProjectReference } from '@/projects/domain/project-reference';
import { ProjectReferenceRepository } from '@/projects/infrastructure/persistence/project-reference.repository';

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
