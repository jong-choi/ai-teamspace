import { Injectable } from '@nestjs/common';

import { DatabaseService } from '#server/database/database.service.js';
import { ProjectKeyConflictError } from '#server/projects/domain/project.error.js';
import type { Project } from '#server/projects/domain/project.js';
import type { ProjectColumn } from '#server/projects/domain/project-column.js';
import { defaultProjectColumns } from '#server/projects/domain/project-default-columns.js';
import type { Ticket, TicketPriority } from '#server/projects/domain/ticket.js';
import {
  toProjectDomain,
  toProjectInsert,
  toProjectUpdate,
} from '#server/projects/infrastructure/persistence/drizzle/mappers/project.mapper.js';
import {
  toProjectColumnDomain,
  toProjectColumnInsert,
  toProjectColumnUpdate,
} from '#server/projects/infrastructure/persistence/drizzle/mappers/project-column.mapper.js';
import {
  toTicketDomain,
  toTicketInsert,
  toTicketUpdate,
} from '#server/projects/infrastructure/persistence/drizzle/mappers/ticket.mapper.js';
import { project } from '#server/projects/infrastructure/persistence/drizzle/schema/project.schema.js';
import { projectColumn } from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.schema.js';
import { ticket } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.schema.js';
import {
  type CreateProjectPersistenceInput,
  type CreateTicketPersistenceInput,
  type CreateTicketResult,
  type ListTicketsPersistenceInput,
  ProjectRepository,
  type ProjectSummaryReadModel,
} from '#server/projects/infrastructure/persistence/project.repository.js';

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  max,
  or,
} from 'drizzle-orm';

type ProjectStats = {
  activeTicketCount: number;
  doneTicketCount: number;
};

type ProjectTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

type TicketMutationInput = {
  organizationId: string;
  projectId: string;
  ticketId: string;
  requireActiveTicket: boolean;
  values: Parameters<typeof toTicketUpdate>[0];
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
    input: CreateProjectPersistenceInput,
  ): Promise<Project> {
    try {
      return await this.database.db.transaction(async (transaction) => {
        const [row] = await transaction
          .insert(project)
          .values(
            toProjectInsert({
              organizationId: input.organizationId,
              key: input.key,
              name: input.name,
              description: input.description,
              leadUserId: input.leadUserId,
              createdByUserId: input.createdByUserId,
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

  renameProject(
    organizationId: string,
    projectId: string,
    name: string,
  ): Promise<Project | null> {
    return this.updateActiveProject(organizationId, projectId, { name });
  }

  changeProjectDescription(
    organizationId: string,
    projectId: string,
    description: string,
  ): Promise<Project | null> {
    return this.updateActiveProject(organizationId, projectId, { description });
  }

  changeProjectLead(
    organizationId: string,
    projectId: string,
    leadUserId: string | null,
  ): Promise<Project | null> {
    return this.updateActiveProject(organizationId, projectId, { leadUserId });
  }

  setProjectArchived(
    organizationId: string,
    projectId: string,
    archivedAt: Date | null,
  ): Promise<Project | null> {
    return this.updateProject(organizationId, projectId, { archivedAt });
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

      if (!projectRow) {
        return null;
      }

      const [positionRow] = await transaction
        .select({ position: max(projectColumn.position) })
        .from(projectColumn)
        .where(eq(projectColumn.projectId, projectId));
      const position = (positionRow?.position ?? -1) + 1;
      const now = new Date();

      const [row] = await transaction
        .insert(projectColumn)
        .values(
          toProjectColumnInsert({
            projectId,
            name,
            position,
            isCompleted: false,
            updatedAt: now,
          }),
        )
        .returning();

      if (!row) {
        throw new Error('프로젝트 컬럼 생성 결과가 없습니다.');
      }

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
      if (!projectRow) {
        return null;
      }

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

      if (!row) {
        return null;
      }

      await transaction
        .update(project)
        .set(toProjectUpdate({ updatedAt: now }))
        .where(eq(project.id, projectId));

      return toProjectColumnDomain(row);
    });
  }

  async listTickets(input: ListTicketsPersistenceInput): Promise<Ticket[]> {
    const search = input.search?.trim();
    const searchCondition = search
      ? or(
          ilike(ticket.title, `%${escapeLikePattern(search)}%`),
          ilike(ticket.descriptionMarkdown, `%${escapeLikePattern(search)}%`),
        )
      : undefined;

    const rows = await this.database.db
      .select()
      .from(ticket)
      .where(
        and(
          eq(ticket.organizationId, input.organizationId),
          eq(ticket.projectId, input.projectId),
          isNull(ticket.archivedAt),
          input.columnId ? eq(ticket.columnId, input.columnId) : undefined,
          input.assigneeUserId
            ? eq(ticket.assigneeUserId, input.assigneeUserId)
            : undefined,
          input.priority ? eq(ticket.priority, input.priority) : undefined,
          searchCondition,
        ),
      )
      .orderBy(asc(ticket.position), asc(ticket.id));

    return rows.map(toTicketDomain);
  }

  async findTicketById(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<Ticket | null> {
    const [row] = await this.database.db
      .select()
      .from(ticket)
      .where(
        and(
          eq(ticket.id, ticketId),
          eq(ticket.organizationId, organizationId),
          eq(ticket.projectId, projectId),
        ),
      )
      .limit(1);

    return row ? toTicketDomain(row) : null;
  }

  async createTicketWithNumber(
    input: CreateTicketPersistenceInput,
  ): Promise<CreateTicketResult> {
    return this.database.db.transaction(async (transaction) => {
      const [projectRow] = await transaction
        .select()
        .from(project)
        .where(
          and(
            eq(project.id, input.projectId),
            eq(project.organizationId, input.organizationId),
            isNull(project.archivedAt),
          ),
        )
        .for('update')
        .limit(1);

      if (!projectRow) {
        return { kind: 'project_not_found' };
      }

      const [columnRow] = await transaction
        .select({ id: projectColumn.id })
        .from(projectColumn)
        .where(
          and(
            eq(projectColumn.id, input.columnId),
            eq(projectColumn.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (!columnRow) {
        return { kind: 'column_not_found' };
      }

      const [positionRow] = await transaction
        .select({ position: max(ticket.position) })
        .from(ticket)
        .where(
          and(
            eq(ticket.projectId, input.projectId),
            eq(ticket.columnId, input.columnId),
            isNull(ticket.archivedAt),
          ),
        );
      const position = (positionRow?.position ?? -1) + 1;
      const now = new Date();

      await transaction
        .update(project)
        .set(
          toProjectUpdate({
            nextTicketNumber: projectRow.nextTicketNumber + 1,
            updatedAt: now,
          }),
        )
        .where(eq(project.id, input.projectId));

      const [row] = await transaction
        .insert(ticket)
        .values(
          toTicketInsert({
            organizationId: input.organizationId,
            projectId: input.projectId,
            columnId: input.columnId,
            number: projectRow.nextTicketNumber,
            title: input.title,
            descriptionMarkdown: input.descriptionMarkdown,
            priority: input.priority,
            assigneeUserId: input.assigneeUserId,
            reporterUserId: input.reporterUserId,
            position,
            dueAt: input.dueAt,
            updatedAt: now,
          }),
        )
        .returning();

      if (!row) {
        throw new Error('티켓 생성 결과가 없습니다.');
      }

      return { kind: 'created', ticket: toTicketDomain(row) };
    });
  }

  editTicketContent(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    title: string;
    descriptionMarkdown: string;
  }): Promise<Ticket | null> {
    return this.updateTicketAndTouchProject({
      ...input,
      requireActiveTicket: true,
      values: {
        title: input.title,
        descriptionMarkdown: input.descriptionMarkdown,
      },
    });
  }

  changeTicketPriority(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    priority: TicketPriority;
  }): Promise<Ticket | null> {
    return this.updateTicketAndTouchProject({
      ...input,
      requireActiveTicket: true,
      values: { priority: input.priority },
    });
  }

  assignTicket(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    assigneeUserId: string | null;
  }): Promise<Ticket | null> {
    return this.updateTicketAndTouchProject({
      ...input,
      requireActiveTicket: true,
      values: { assigneeUserId: input.assigneeUserId },
    });
  }

  changeTicketDueAt(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    dueAt: Date | null;
  }): Promise<Ticket | null> {
    return this.updateTicketAndTouchProject({
      ...input,
      requireActiveTicket: true,
      values: { dueAt: input.dueAt },
    });
  }

  async setTicketArchived(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    archivedAt: Date | null;
  }): Promise<Ticket | null> {
    return this.database.db.transaction(async (transaction) => {
      const [projectRow] = await transaction
        .select({ id: project.id })
        .from(project)
        .where(
          and(
            eq(project.id, input.projectId),
            eq(project.organizationId, input.organizationId),
            isNull(project.archivedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (!projectRow) {
        return null;
      }

      const [current] = await transaction
        .select()
        .from(ticket)
        .where(
          and(
            eq(ticket.id, input.ticketId),
            eq(ticket.organizationId, input.organizationId),
            eq(ticket.projectId, input.projectId),
          ),
        )
        .for('update')
        .limit(1);
      if (!current) {
        return null;
      }

      const now = new Date();
      let position = current.position;
      const restoring =
        input.archivedAt === null && current.archivedAt !== null;
      if (restoring) {
        const [positionRow] = await transaction
          .select({ position: max(ticket.position) })
          .from(ticket)
          .where(
            and(
              eq(ticket.organizationId, input.organizationId),
              eq(ticket.projectId, input.projectId),
              eq(ticket.columnId, current.columnId),
              isNull(ticket.archivedAt),
            ),
          );
        position = (positionRow?.position ?? -1) + 1;
      }

      const [row] = await transaction
        .update(ticket)
        .set(
          toTicketUpdate({
            archivedAt: input.archivedAt,
            position,
            updatedAt: now,
          }),
        )
        .where(eq(ticket.id, input.ticketId))
        .returning();
      if (!row) {
        throw new Error('티켓 보관 상태 변경 결과가 없습니다.');
      }

      if (input.archivedAt !== null && current.archivedAt === null) {
        await normalizeActiveTicketOrder(
          transaction,
          input.organizationId,
          input.projectId,
          current.columnId,
          now,
        );
      }

      await transaction
        .update(project)
        .set(toProjectUpdate({ updatedAt: now }))
        .where(
          and(
            eq(project.id, input.projectId),
            eq(project.organizationId, input.organizationId),
          ),
        );

      return toTicketDomain(row);
    });
  }

  private updateActiveProject(
    organizationId: string,
    projectId: string,
    values: Parameters<typeof toProjectUpdate>[0],
  ): Promise<Project | null> {
    return this.updateProject(organizationId, projectId, values, true);
  }

  private async updateProject(
    organizationId: string,
    projectId: string,
    values: Parameters<typeof toProjectUpdate>[0],
    requireActive = false,
  ): Promise<Project | null> {
    const [row] = await this.database.db
      .update(project)
      .set(toProjectUpdate({ ...values, updatedAt: new Date() }))
      .where(
        and(
          eq(project.id, projectId),
          eq(project.organizationId, organizationId),
          requireActive ? isNull(project.archivedAt) : undefined,
        ),
      )
      .returning();

    return row ? toProjectDomain(row) : null;
  }

  private async updateTicketAndTouchProject(
    input: TicketMutationInput,
  ): Promise<Ticket | null> {
    return this.database.db.transaction(async (transaction) => {
      const [projectRow] = await transaction
        .select({ id: project.id })
        .from(project)
        .where(
          and(
            eq(project.id, input.projectId),
            eq(project.organizationId, input.organizationId),
            isNull(project.archivedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (!projectRow) {
        return null;
      }

      const now = new Date();
      const [row] = await transaction
        .update(ticket)
        .set(toTicketUpdate({ ...input.values, updatedAt: now }))
        .where(
          and(
            eq(ticket.id, input.ticketId),
            eq(ticket.organizationId, input.organizationId),
            eq(ticket.projectId, input.projectId),
            input.requireActiveTicket ? isNull(ticket.archivedAt) : undefined,
          ),
        )
        .returning();

      if (!row) {
        return null;
      }

      await transaction
        .update(project)
        .set(toProjectUpdate({ updatedAt: now }))
        .where(
          and(
            eq(project.id, input.projectId),
            eq(project.organizationId, input.organizationId),
          ),
        );

      return toTicketDomain(row);
    });
  }

  private async loadProjectStats(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<Map<string, ProjectStats>> {
    const statsByProjectId = new Map<string, ProjectStats>();
    if (projectIds.length === 0) {
      return statsByProjectId;
    }

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

async function normalizeActiveTicketOrder(
  transaction: ProjectTransaction,
  organizationId: string,
  projectId: string,
  columnId: string,
  updatedAt: Date,
): Promise<void> {
  const rows = await transaction
    .select()
    .from(ticket)
    .where(
      and(
        eq(ticket.organizationId, organizationId),
        eq(ticket.projectId, projectId),
        eq(ticket.columnId, columnId),
        isNull(ticket.archivedAt),
      ),
    )
    .orderBy(asc(ticket.position), asc(ticket.id))
    .for('update');

  for (const [position, row] of rows.entries()) {
    if (row.position === position) {
      continue;
    }
    await transaction
      .update(ticket)
      .set(toTicketUpdate({ position, updatedAt }))
      .where(
        and(
          eq(ticket.id, row.id),
          eq(ticket.organizationId, organizationId),
          eq(ticket.projectId, projectId),
        ),
      );
  }
}

function escapeLikePattern(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function hasPostgresConstraint(error: unknown, constraint: string): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current !== 'object') {
      return false;
    }
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
