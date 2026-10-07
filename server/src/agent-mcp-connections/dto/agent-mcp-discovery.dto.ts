import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

const ExternalMcpAnnotationHintsSchema = z.object({
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
});

export const AgentMcpDiscoveredToolSchema = z
  .object({
    originalToolName: z.string().min(1).max(256),
    title: z.string().max(256).optional(),
    description: z.string().max(4_096).optional(),
    inputSchema: z.json(),
    schemaFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    selected: z.boolean(),
    schemaChanged: z.boolean(),
    annotations: ExternalMcpAnnotationHintsSchema.optional(),
  })
  .meta({ id: 'AgentMcpDiscoveredTool' });

export const AgentMcpToolCatalogSchema = z
  .object({
    serverName: z.string().max(256).optional(),
    serverVersion: z.string().max(128).optional(),
    tools: z.array(AgentMcpDiscoveredToolSchema),
  })
  .meta({ id: 'AgentMcpToolCatalog' });

export const AgentMcpConnectionTestSchema = z
  .object({
    status: z.literal('ready'),
    serverName: z.string().max(256).optional(),
    serverVersion: z.string().max(128).optional(),
    toolCount: z.number().int().nonnegative(),
  })
  .meta({ id: 'AgentMcpConnectionTest' });

export type AgentMcpToolCatalogResponse = z.infer<
  typeof AgentMcpToolCatalogSchema
>;
export type AgentMcpConnectionTestResponse = z.infer<
  typeof AgentMcpConnectionTestSchema
>;

export class AgentMcpToolCatalogDto extends createZodDto(
  AgentMcpToolCatalogSchema,
) {}

export class AgentMcpConnectionTestDto extends createZodDto(
  AgentMcpConnectionTestSchema,
) {}
