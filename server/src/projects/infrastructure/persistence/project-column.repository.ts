import type { ProjectColumn } from '@/projects/domain/project-column';

export abstract class ProjectColumnRepository {
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
}
