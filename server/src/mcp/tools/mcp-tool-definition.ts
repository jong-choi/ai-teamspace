import type { McpScope } from '@/mcp/contracts/mcp-scope';

import { z } from 'zod';

export type McpToolClassification =
  'read' | 'write' | 'consequential' | 'destructive';

export type McpToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export type McpToolDefinition<
  TInput extends z.ZodObject = z.ZodObject,
  TOutput extends z.ZodObject = z.ZodObject,
> = {
  name: string;
  title: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  requiredScope: McpScope;
  classification: McpToolClassification;
  annotations: McpToolAnnotations;
};

export function defineMcpTool<
  const TInput extends z.ZodObject,
  const TOutput extends z.ZodObject,
>(
  definition: McpToolDefinition<TInput, TOutput>,
): McpToolDefinition<TInput, TOutput> {
  return definition;
}

export const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const satisfies McpToolAnnotations;

export const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const satisfies McpToolAnnotations;

export const consequentialWriteAnnotations = {
  ...writeAnnotations,
  openWorldHint: true,
} as const satisfies McpToolAnnotations;

export const destructiveWriteAnnotations = {
  ...consequentialWriteAnnotations,
  destructiveHint: true,
} as const satisfies McpToolAnnotations;
