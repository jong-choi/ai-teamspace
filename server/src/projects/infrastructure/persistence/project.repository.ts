import type { Project } from '#server/projects/domain/project.js';
import type { ProjectColumn } from '#server/projects/domain/project-column.js';
import type { Ticket, TicketPriority } from '#server/projects/domain/ticket.js';

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

  abstract renameProject(
    organizationId: string,
    projectId: string,
    name: string,
  ): Promise<Project | null>;

  abstract changeProjectDescription(
    organizationId: string,
    projectId: string,
    description: string,
  ): Promise<Project | null>;

  abstract changeProjectLead(
    organizationId: string,
    projectId: string,
    leadUserId: string | null,
  ): Promise<Project | null>;

  abstract setProjectArchived(
    organizationId: string,
    projectId: string,
    archivedAt: Date | null,
  ): Promise<Project | null>;

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

  abstract editTicketContent(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    title: string;
    descriptionMarkdown: string;
  }): Promise<Ticket | null>;

  abstract changeTicketPriority(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    priority: TicketPriority;
  }): Promise<Ticket | null>;

  abstract assignTicket(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    assigneeUserId: string | null;
  }): Promise<Ticket | null>;

  abstract changeTicketDueAt(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    dueAt: Date | null;
  }): Promise<Ticket | null>;

  abstract setTicketArchived(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    archivedAt: Date | null;
  }): Promise<Ticket | null>;
}
