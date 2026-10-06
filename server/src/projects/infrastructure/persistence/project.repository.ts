import type { Project } from '@/projects/domain/project';
import type { CreateProjectInput } from '@/projects/dto/create-project.dto';
import type { UpdateProjectInput } from '@/projects/dto/update-project.dto';

export type ProjectSummaryReadModel = {
  project: Project;
  activeTicketCount: number;
  doneTicketCount: number;
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
    organizationId: string,
    createdByUserId: string,
    input: CreateProjectInput,
  ): Promise<Project>;

  abstract updateProject(
    organizationId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project | null>;
}
