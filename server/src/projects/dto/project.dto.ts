import type { AuthUserIdentity } from '#server/auth/auth-user-directory.service.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { projectSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/project.zod.js';
import type { ProjectSummaryReadModel } from '#server/projects/infrastructure/persistence/project.repository.js';

import { z } from 'zod';

export const ProjectUserSummarySchema = z
  .object({
    userId: z.string().min(1),
    name: z.string(),
    email: z.string().email(),
    username: z.string().nullable(),
    image: z.string().nullable(),
  })
  .meta({ id: 'ProjectUserSummary' });

export type ProjectUserSummary = z.infer<typeof ProjectUserSummarySchema>;

export const ProjectSummarySchema = projectSelectSchema
  .pick({
    id: true,
    key: true,
    name: true,
    description: true,
  })
  .extend({
    lead: ProjectUserSummarySchema.nullable(),
    activeTicketCount: z.number().int().nonnegative(),
    doneTicketCount: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'ProjectSummary' });

export const ProjectDetailSchema = ProjectSummarySchema.extend({
  createdByUserId: projectSelectSchema.shape.createdByUserId,
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
}).meta({ id: 'ProjectDetail' });

export const ProjectListSchema = z
  .object({ items: z.array(ProjectSummarySchema) })
  .meta({ id: 'ProjectList' });

export type ProjectSummaryResponse = z.infer<typeof ProjectSummarySchema>;
export type ProjectDetailResponse = z.infer<typeof ProjectDetailSchema>;
export type ProjectListResponse = z.infer<typeof ProjectListSchema>;

export function toProjectUserSummary(
  user: AuthUserIdentity | undefined,
): ProjectUserSummary | null {
  if (!user) {
    return null;
  }
  return ProjectUserSummarySchema.parse({
    userId: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    image: user.image,
  });
}

export function toProjectSummaryResponse(
  model: ProjectSummaryReadModel,
  lead: AuthUserIdentity | undefined,
): ProjectSummaryResponse {
  return ProjectSummarySchema.parse({
    id: model.project.id,
    key: model.project.key,
    name: model.project.name,
    description: model.project.description,
    lead: toProjectUserSummary(lead),
    activeTicketCount: model.activeTicketCount,
    doneTicketCount: model.doneTicketCount,
    updatedAt: model.project.updatedAt.toISOString(),
  });
}

export function toProjectDetailResponse(
  model: ProjectSummaryReadModel,
  lead: AuthUserIdentity | undefined,
): ProjectDetailResponse {
  return ProjectDetailSchema.parse({
    ...toProjectSummaryResponse(model, lead),
    createdByUserId: model.project.createdByUserId,
    createdAt: model.project.createdAt.toISOString(),
    archivedAt: model.project.archivedAt?.toISOString() ?? null,
  });
}

export class ProjectSummaryDto extends createZodDto(ProjectSummarySchema) {}
export class ProjectDetailDto extends createZodDto(ProjectDetailSchema) {}
export class ProjectListDto extends createZodDto(ProjectListSchema) {}
