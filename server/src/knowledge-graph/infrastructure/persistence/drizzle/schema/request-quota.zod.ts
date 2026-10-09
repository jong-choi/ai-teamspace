import { requestQuota } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/request-quota.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

export const RequestQuotaSelectSchema = createSelectSchema(requestQuota);
export const RequestQuotaInsertSchema = createInsertSchema(requestQuota);
export const RequestQuotaUpdateSchema = createUpdateSchema(requestQuota);
