import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { ProjectProjectionSourceSchema } from '@/projects/domain/project-projection-source';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { projectColumn } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.schema';
import { ProjectProjectionSourceRepository } from '@/projects/infrastructure/persistence/project-projection-source.repository';

import { and, asc, eq, gt } from 'drizzle-orm';

@Injectable()
export class ProjectProjectionSourceDrizzleRepository extends ProjectProjectionSourceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async current(organizationId: string, projectId: string) {
    return this.database.db.transaction(
      async (transaction) => {
        const [source] = await transaction
          .select({
            id: project.id,
            organizationId: project.organizationId,
            key: project.key,
            name: project.name,
            leadUserId: project.leadUserId,
            archivedAt: project.archivedAt,
            updatedAt: project.updatedAt,
          })
          .from(project)
          .where(
            and(
              eq(project.organizationId, organizationId),
              eq(project.id, projectId),
            ),
          )
          .limit(1);
        if (!source) return null;

        const columns = await transaction
          .select({
            id: projectColumn.id,
            name: projectColumn.name,
            position: projectColumn.position,
            isCompleted: projectColumn.isCompleted,
          })
          .from(projectColumn)
          .where(eq(projectColumn.projectId, projectId))
          .orderBy(asc(projectColumn.position), asc(projectColumn.id));

        return ProjectProjectionSourceSchema.parse({ ...source, columns });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.database.db
      .select({ id: project.id })
      .from(project)
      .where(
        and(
          eq(project.organizationId, organizationId),
          afterId ? gt(project.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(project.id))
      .limit(limit);
  }
}
