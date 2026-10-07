import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const AgentMcpSelectedToolInputSchema = z.object({
  originalToolName: z.string().min(1).max(256),
  schemaFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  enabled: z.boolean().default(true),
});

export const UpdateAgentMcpToolPolicySchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    mode: z.enum(['selected', 'all']),
    tools: z.array(AgentMcpSelectedToolInputSchema).max(500),
  })
  .superRefine((input, context) => {
    const names = new Set<string>();
    for (const [index, tool] of input.tools.entries()) {
      if (names.has(tool.originalToolName)) {
        context.addIssue({
          code: 'custom',
          path: ['tools', index, 'originalToolName'],
          message: '같은 tool을 중복 선택할 수 없습니다.',
        });
      }
      names.add(tool.originalToolName);
    }
  })
  .meta({ id: 'UpdateAgentMcpToolPolicy' });

export type UpdateAgentMcpToolPolicyInput = z.infer<
  typeof UpdateAgentMcpToolPolicySchema
>;

export class UpdateAgentMcpToolPolicyDto extends createZodDto(
  UpdateAgentMcpToolPolicySchema,
) {}
