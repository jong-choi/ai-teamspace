import type { Project } from '@/projects/domain/project';
import type { ProjectColumn } from '@/projects/domain/project-column';
import type { Ticket, TicketPriority } from '@/projects/domain/ticket';

export type ProjectSummaryReadModel = {
  project: Project;
  activeTicketCount: number;
  doneTicketCount: number;
};

export type CreateProjectPersistenceInput = {
  organizationId: string;
  key: string;
  name: string;
  description: string;
  leadUserId: string | null;
  createdByUserId: string;
};

export type CreateTicketPersistenceInput = {
  organizationId: string;
  projectId: string;
  columnId: string;
  title: string;
  descriptionMarkdown: string;
  priority: TicketPriority;
  assigneeUserId: string | null;
  reporterUserId: string;
  dueAt: Date | null;
};

export type CreateTicketResult =
  | { kind: 'created'; ticket: Ticket }
  | { kind: 'project_not_found' }
  | { kind: 'column_not_found' };

export type ProjectChanges = {
  name?: string;
  description?: string;
  leadUserId?: string | null;
  archivedAt?: Date | null;
};

export type TicketChanges = {
  title?: string;
  descriptionMarkdown?: string;
  priority?: TicketPriority;
  assigneeUserId?: string | null;
  dueAt?: Date | null;
  archivedAt?: Date | null;
};

export type ListTicketsPersistenceInput = {
  organizationId: string;
  projectId: string;
  search?: string;
  columnId?: string;
  assigneeUserId?: string;
  priority?: TicketPriority;
};

export abstract class ProjectRepository {
  abstract listProjects(
    organizationId: string,
  ): Promise<ProjectSummaryReadModel[]>;

  abstract findProjectById(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectSummaryReadModel | null>;

  abstract createProjectWithDefaultColumns(
    input: CreateProjectPersistenceInput,
  ): Promise<Project>;

  abstract updateProject(input: {
    organizationId: string;
    projectId: string;
    changes: ProjectChanges;
  }): Promise<Project | null>;

  abstract listColumns(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectColumn[]>;

  abstract findColumnById(
    organizationId: string,
    projectId: string,
    columnId: string,
  ): Promise<ProjectColumn | null>;

  abstract createColumn(
    organizationId: string,
    projectId: string,
    name: string,
  ): Promise<ProjectColumn | null>;

  abstract renameColumn(
    organizationId: string,
    projectId: string,
    columnId: string,
    name: string,
  ): Promise<ProjectColumn | null>;

  abstract listTickets(input: ListTicketsPersistenceInput): Promise<Ticket[]>;

  abstract findTicketById(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<Ticket | null>;

  abstract createTicketWithNumber(
    input: CreateTicketPersistenceInput,
  ): Promise<CreateTicketResult>;

  abstract updateTicket(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    changes: TicketChanges;
  }): Promise<Ticket | null>;
}
