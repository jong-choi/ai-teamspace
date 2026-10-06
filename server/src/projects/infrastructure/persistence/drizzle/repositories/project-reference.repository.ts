import { Injectable } from '@nestjs/common';

import { DatabaseService } from '#server/database/database.service.js';
import type { ProjectReference } from '#server/projects/domain/project-reference.js';
import { project } from '#server/projects/infrastructure/persistence/drizzle/schema/project.schema.js';
import { ProjectReferenceRepository } from '#server/projects/infrastructure/persistence/project-reference.repository.js';

import { and, eq, inArray, isNull } from 'drizzle-orm';

@Injectable()
export class ProjectReferenceDrizzleRepository extends ProjectReferenceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async findByIds(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<ProjectReference[]> {
    const uniqueProjectIds = [...new Set(projectIds)];
    if (uniqueProjectIds.length === 0) {
      return [];
    }

    return this.database.db
      .select({ id: project.id, name: project.name })
      .from(project)
      .where(
        and(
          inArray(project.id, uniqueProjectIds),
          eq(project.organizationId, organizationId),
          isNull(project.archivedAt),
        ),
      );
  }
}
