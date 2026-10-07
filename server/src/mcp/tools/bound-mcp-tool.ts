import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import type { McpToolDefinition } from '@/mcp/tools/mcp-tool-definition';

import { z } from 'zod';

export type McpToolAuthorization = (
  definition: McpToolDefinition,
  input: Record<string, unknown>,
  auth: McpAuthContext,
) => Promise<void>;

export type BoundMcpTool = {
  definition: McpToolDefinition;
  invoke(
    rawInput: unknown,
    auth: McpAuthContext,
    authorize: McpToolAuthorization,
  ): Promise<Record<string, unknown>>;
};

export function bindMcpTool<
  const TInput extends z.ZodObject,
  const TOutput extends z.ZodObject,
>(
  definition: McpToolDefinition<TInput, TOutput>,
  handler: (
    input: z.infer<TInput>,
    auth: McpAuthContext,
  ) => Promise<z.input<TOutput>> | z.input<TOutput>,
): BoundMcpTool {
  return {
    definition,
    async invoke(rawInput, auth, authorize) {
      const input = definition.inputSchema.parse(rawInput);
      await authorize(definition, input as Record<string, unknown>, auth);

      const output = await handler(input, auth);
      return definition.outputSchema.parse(output) as Record<string, unknown>;
    },
  };
}
