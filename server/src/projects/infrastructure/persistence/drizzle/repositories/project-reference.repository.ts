import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import type { ProjectReference } from '@/projects/domain/project-reference';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { projectSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/project.zod';
import { ProjectReferenceRepository } from '@/projects/infrastructure/persistence/project-reference.repository';

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
    const uniqueProjectIds = [...new Set(projectIds)].filter(
      (id) => projectSelectSchema.shape.id.safeParse(id).success,
    );
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
