import type { Project } from '@/projects/domain/project';

export type ProjectReference = Pick<Project, 'id' | 'name'>;
