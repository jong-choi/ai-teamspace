import { mcpAccessKeyAllocation } from '@/mcp-access-keys/infrastructure/persistence/drizzle/schema/mcp-access-key-allocation.schema';
import { mcpAccessKeyOperation } from '@/mcp-access-keys/infrastructure/persistence/drizzle/schema/mcp-access-key-operation.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const mcpAccessKeyAllocationSelectSchema = createSelectSchema(
  mcpAccessKeyAllocation,
  {
    slot: z.number().int().nonnegative(),
    betterAuthKeyId: z.string().trim().min(1).nullable(),
  },
);

export const mcpAccessKeyAllocationInsertSchema = createInsertSchema(
  mcpAccessKeyAllocation,
  {
    slot: z.number().int().nonnegative(),
    betterAuthKeyId: z.string().trim().min(1).nullable().optional(),
  },
);

export const mcpAccessKeyAllocationUpdateSchema = createUpdateSchema(
  mcpAccessKeyAllocation,
  {
    slot: z.number().int().nonnegative(),
    betterAuthKeyId: z.string().trim().min(1).nullable(),
  },
).partial();

export const mcpAccessKeyOperationSelectSchema = createSelectSchema(
  mcpAccessKeyOperation,
  {
    idempotencyKey: z.string().trim().min(1).max(200),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    resultingKeyId: z.string().trim().min(1).nullable(),
  },
);

export const mcpAccessKeyOperationInsertSchema = createInsertSchema(
  mcpAccessKeyOperation,
  {
    idempotencyKey: z.string().trim().min(1).max(200),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    resultingKeyId: z.string().trim().min(1).nullable().optional(),
  },
);
