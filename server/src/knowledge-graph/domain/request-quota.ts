import { RequestQuotaSelectSchema } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/request-quota.zod';

import { z } from 'zod';

export const RequestQuotaActionSchema = RequestQuotaSelectSchema.shape.action;
export type RequestQuotaAction = z.infer<typeof RequestQuotaActionSchema>;

export const RequestQuotaPolicySchema = z
  .object({
    windowSeconds: z.number().int().min(1).max(86_400),
    actorLimit: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable(),
    organizationLimit: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type RequestQuotaPolicy = z.infer<typeof RequestQuotaPolicySchema>;
