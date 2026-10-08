import { AgentReasoningEffortSchema } from '@/agent/domain/agent-reasoning-effort';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const AgentModelInfoSchema = z
  .object({
    model: z.string().min(1),
    supportedReasoningEfforts: z.array(AgentReasoningEffortSchema).min(1),
    defaultReasoningEffort: AgentReasoningEffortSchema,
  })
  .meta({ id: 'AgentModelInfo' });

export type AgentModelInfoResponse = z.infer<typeof AgentModelInfoSchema>;

export class AgentModelInfoDto extends createZodDto(AgentModelInfoSchema) {}
