import { createZodDto } from '@/common/dto/create-zod-dto';
import { GraphCompletenessSchema } from '@/knowledge-graph/domain/graph-completeness';
import {
  GraphRebuildModeSchema,
  GraphRebuildRequestSchema,
  GraphRebuildStatusSchema,
} from '@/knowledge-graph/domain/graph-rebuild';

import { z } from 'zod';

export const GraphOperationsStatusSchema = z
  .object({
    completeness: GraphCompletenessSchema,
    activeRebuild: z
      .object({
        requestId: GraphRebuildRequestSchema.shape.id,
        mode: GraphRebuildModeSchema,
        status: GraphRebuildStatusSchema,
      })
      .strict()
      .nullable(),
    projection: z
      .object({
        pending: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        oldestPendingAgeSeconds: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    semantic: z
      .object({
        notIndexed: z.number().int().nonnegative(),
        waiting: z.number().int().nonnegative(),
        accepted: z.number().int().nonnegative(),
        queued: z.number().int().nonnegative(),
        running: z.number().int().nonnegative(),
        stale: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        upToDate: z.number().int().nonnegative(),
        oldestAcceptedAgeSeconds: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    quota: z
      .object({
        refreshUsedThisHour: z.number().int().nonnegative(),
        searchUsedThisMinute: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .meta({ id: 'GraphOperationsStatus' });

export class GraphOperationsStatusDto extends createZodDto(
  GraphOperationsStatusSchema,
) {}
