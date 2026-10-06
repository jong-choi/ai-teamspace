import type { Project } from '@/projects/domain/project';

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

export type ProjectChanges = {
  name?: string;
  description?: string;
  leadUserId?: string | null;
  archivedAt?: Date | null;
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
}
