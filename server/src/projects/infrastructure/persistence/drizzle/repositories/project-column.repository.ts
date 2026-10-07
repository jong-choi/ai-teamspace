import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import type { ProjectColumn } from '@/projects/domain/project-column';
import { toProjectUpdate } from '@/projects/infrastructure/persistence/drizzle/mappers/project.mapper';
import {
  toProjectColumnDomain,
  toProjectColumnInsert,
  toProjectColumnUpdate,
} from '@/projects/infrastructure/persistence/drizzle/mappers/project-column.mapper';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { projectColumn } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.schema';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';

import { and, asc, eq, isNull, max } from 'drizzle-orm';

@Injectable()
export class ProjectColumnDrizzleRepository extends ProjectColumnRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async listColumns(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectColumn[]> {
    const rows = await this.database.db
      .select({ column: projectColumn })
      .from(projectColumn)
      .innerJoin(project, eq(project.id, projectColumn.projectId))
      .where(
        and(
          eq(project.organizationId, organizationId),
          eq(project.id, projectId),
        ),
      )
      .orderBy(asc(projectColumn.position), asc(projectColumn.id));

    return rows.map(({ column }) => toProjectColumnDomain(column));
  }

  async findColumnById(
    organizationId: string,
    projectId: string,
    columnId: string,
  ): Promise<ProjectColumn | null> {
    const [row] = await this.database.db
      .select({ column: projectColumn })
      .from(projectColumn)
      .innerJoin(project, eq(project.id, projectColumn.projectId))
      .where(
        and(
          eq(project.organizationId, organizationId),
          eq(project.id, projectId),
          eq(projectColumn.id, columnId),
        ),
      )
      .limit(1);

    return row ? toProjectColumnDomain(row.column) : null;
  }

  async createColumn(
    organizationId: string,
    projectId: string,
    name: string,
  ): Promise<ProjectColumn | null> {
    return this.database.db.transaction(async (transaction) => {
      const [projectRow] = await transaction
        .select({ id: project.id })
        .from(project)
        .where(
          and(
            eq(project.id, projectId),
            eq(project.organizationId, organizationId),
            isNull(project.archivedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (!projectRow) return null;

      const [positionRow] = await transaction
        .select({ position: max(projectColumn.position) })
        .from(projectColumn)
        .where(eq(projectColumn.projectId, projectId));
      const now = new Date();
      const [row] = await transaction
        .insert(projectColumn)
        .values(
          toProjectColumnInsert({
            projectId,
            name,
            position: (positionRow?.position ?? -1) + 1,
            isCompleted: false,
            updatedAt: now,
          }),
        )
        .returning();
      if (!row) throw new Error('프로젝트 컬럼 생성 결과가 없습니다.');

      await transaction
        .update(project)
        .set(toProjectUpdate({ updatedAt: now }))
        .where(eq(project.id, projectId));
      return toProjectColumnDomain(row);
    });
  }

  async renameColumn(
    organizationId: string,
    projectId: string,
    columnId: string,
    name: string,
  ): Promise<ProjectColumn | null> {
    return this.database.db.transaction(async (transaction) => {
      const [projectRow] = await transaction
        .select({ id: project.id })
        .from(project)
        .where(
          and(
            eq(project.id, projectId),
            eq(project.organizationId, organizationId),
            isNull(project.archivedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (!projectRow) return null;

      const now = new Date();
      const [row] = await transaction
        .update(projectColumn)
        .set(toProjectColumnUpdate({ name, updatedAt: now }))
        .where(
          and(
            eq(projectColumn.id, columnId),
            eq(projectColumn.projectId, projectId),
          ),
        )
        .returning();
      if (!row) return null;

      await transaction
        .update(project)
        .set(toProjectUpdate({ updatedAt: now }))
        .where(eq(project.id, projectId));
      return toProjectColumnDomain(row);
    });
  }
}
