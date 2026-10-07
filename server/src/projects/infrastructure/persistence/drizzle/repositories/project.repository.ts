import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import type { Project } from '@/projects/domain/project';
import { ProjectKeyConflictError } from '@/projects/domain/project.error';
import { defaultProjectColumns } from '@/projects/domain/project-default-columns';
import type { CreateProjectInput } from '@/projects/dto/create-project.dto';
import type { UpdateProjectInput } from '@/projects/dto/update-project.dto';
import {
  toProjectDomain,
  toProjectInsert,
  toProjectUpdate,
} from '@/projects/infrastructure/persistence/drizzle/mappers/project.mapper';
import { toProjectColumnInsert } from '@/projects/infrastructure/persistence/drizzle/mappers/project-column.mapper';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { projectColumn } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.schema';
import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';
import {
  ProjectRepository,
  type ProjectSummaryReadModel,
} from '@/projects/infrastructure/persistence/project.repository';

import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';

type ProjectStats = {
  activeTicketCount: number;
  doneTicketCount: number;
};

@Injectable()
export class ProjectDrizzleRepository extends ProjectRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async listProjects(
    organizationId: string,
  ): Promise<ProjectSummaryReadModel[]> {
    const rows = await this.database.db
      .select()
      .from(project)
      .where(
        and(
          eq(project.organizationId, organizationId),
          isNull(project.archivedAt),
        ),
      )
      .orderBy(desc(project.updatedAt), asc(project.id));

    const projects = rows.map(toProjectDomain);
    const statsByProjectId = await this.loadProjectStats(
      organizationId,
      projects.map(({ id }) => id),
    );

    return projects.map((projectDomain) => ({
      project: projectDomain,
      ...(statsByProjectId.get(projectDomain.id) ?? {
        activeTicketCount: 0,
        doneTicketCount: 0,
      }),
    }));
  }

  async findProjectById(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectSummaryReadModel | null> {
    const [row] = await this.database.db
      .select()
      .from(project)
      .where(
        and(
          eq(project.id, projectId),
          eq(project.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!row) {
      return null;
    }

    const projectDomain = toProjectDomain(row);
    const statsByProjectId = await this.loadProjectStats(organizationId, [
      projectId,
    ]);

    return {
      project: projectDomain,
      ...(statsByProjectId.get(projectId) ?? {
        activeTicketCount: 0,
        doneTicketCount: 0,
      }),
    };
  }

  async createProjectWithDefaultColumns(
    organizationId: string,
    createdByUserId: string,
    input: CreateProjectInput,
  ): Promise<Project> {
    try {
      return await this.database.db.transaction(async (transaction) => {
        const [row] = await transaction
          .insert(project)
          .values(
            toProjectInsert({
              organizationId,
              key: input.key,
              name: input.name,
              description: input.description ?? '',
              leadUserId: input.leadUserId ?? null,
              createdByUserId,
              nextTicketNumber: 1,
            }),
          )
          .returning();

        if (!row) {
          throw new Error('프로젝트 생성 결과가 없습니다.');
        }

        await transaction.insert(projectColumn).values(
          defaultProjectColumns.map((column, position) =>
            toProjectColumnInsert({
              projectId: row.id,
              name: column.name,
              position,
              isCompleted: column.isCompleted,
            }),
          ),
        );

        return toProjectDomain(row);
      });
    } catch (error) {
      if (hasPostgresConstraint(error, 'project_organization_key_uidx')) {
        throw new ProjectKeyConflictError({ cause: error });
      }
      throw error;
    }
  }

  async updateProject(
    organizationId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project | null> {
    return this.database.db.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(project)
        .where(
          and(
            eq(project.id, projectId),
            eq(project.organizationId, organizationId),
          ),
        )
        .for('update')
        .limit(1);
      if (!current) {
        return null;
      }

      const restoring =
        current.archivedAt !== null &&
        input.archived === false &&
        input.name === undefined &&
        input.description === undefined &&
        input.leadUserId === undefined;
      if (current.archivedAt !== null && !restoring) {
        return null;
      }

      const [row] = await transaction
        .update(project)
        .set(
          toProjectUpdate({
            name: input.name,
            description: input.description,
            leadUserId: input.leadUserId,
            archivedAt:
              input.archived === undefined
                ? undefined
                : input.archived
                  ? new Date()
                  : null,
            updatedAt: new Date(),
          }),
        )
        .where(
          and(
            eq(project.id, projectId),
            eq(project.organizationId, organizationId),
          ),
        )
        .returning();

      return row ? toProjectDomain(row) : null;
    });
  }

  private async loadProjectStats(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<Map<string, ProjectStats>> {
    const statsByProjectId = new Map<string, ProjectStats>();
    if (projectIds.length === 0) return statsByProjectId;

    const [activeRows, doneRows] = await Promise.all([
      this.database.db
        .select({ projectId: ticket.projectId, count: count(ticket.id) })
        .from(ticket)
        .innerJoin(projectColumn, eq(projectColumn.id, ticket.columnId))
        .where(
          and(
            eq(ticket.organizationId, organizationId),
            inArray(ticket.projectId, [...projectIds]),
            isNull(ticket.archivedAt),
            eq(projectColumn.isCompleted, false),
          ),
        )
        .groupBy(ticket.projectId),
      this.database.db
        .select({ projectId: ticket.projectId, count: count(ticket.id) })
        .from(ticket)
        .innerJoin(projectColumn, eq(projectColumn.id, ticket.columnId))
        .where(
          and(
            eq(ticket.organizationId, organizationId),
            inArray(ticket.projectId, [...projectIds]),
            isNull(ticket.archivedAt),
            eq(projectColumn.isCompleted, true),
          ),
        )
        .groupBy(ticket.projectId),
    ]);

    for (const projectId of projectIds) {
      statsByProjectId.set(projectId, {
        activeTicketCount: 0,
        doneTicketCount: 0,
      });
    }
    for (const row of activeRows) {
      statsByProjectId.get(row.projectId)!.activeTicketCount = Number(
        row.count,
      );
    }
    for (const row of doneRows) {
      statsByProjectId.get(row.projectId)!.doneTicketCount = Number(row.count);
    }

    return statsByProjectId;
  }
}

function hasPostgresConstraint(error: unknown, constraint: string): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current !== 'object') return false;
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (candidate.code === '23505' && candidate.constraint === constraint) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}
