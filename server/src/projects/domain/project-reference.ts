import type { Project } from '#server/projects/domain/project.js';

export type ProjectReference = Pick<Project, 'id' | 'name'>;
