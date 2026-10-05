import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { ProjectColumn } from '#server/projects/domain/project-column.js';
import { projectColumnSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.zod.js';

import { z } from 'zod';

export const ProjectColumnResponseSchema = projectColumnSelectSchema
  .pick({
    id: true,
    projectId: true,
    name: true,
    position: true,
  })
  .extend({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'ProjectColumn' });

export const ProjectColumnListSchema = z
  .object({ items: z.array(ProjectColumnResponseSchema) })
  .meta({ id: 'ProjectColumnList' });

export type ProjectColumnResponse = z.infer<typeof ProjectColumnResponseSchema>;
export type ProjectColumnListResponse = z.infer<typeof ProjectColumnListSchema>;

export function toProjectColumnResponse(
  column: ProjectColumn,
): ProjectColumnResponse {
  return ProjectColumnResponseSchema.parse({
    id: column.id,
    projectId: column.projectId,
    name: column.name,
    position: column.position,
    createdAt: column.createdAt.toISOString(),
    updatedAt: column.updatedAt.toISOString(),
  });
}

export class ProjectColumnDto extends createZodDto(
  ProjectColumnResponseSchema,
) {}
export class ProjectColumnListDto extends createZodDto(
  ProjectColumnListSchema,
) {}
