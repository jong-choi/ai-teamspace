import { z } from 'zod';

export const AGENT_MCP_ERROR_CATEGORIES = [
  'connection_unavailable',
  'authorization_required',
  'credential_expired',
  'protocol_incompatible',
  'discovery_failed',
  'tool_not_allowed',
  'tool_timeout',
  'tool_error',
  'response_too_large',
  'cancelled',
] as const;

export const AgentMcpLastErrorCategorySchema = z.enum(
  AGENT_MCP_ERROR_CATEGORIES,
);

export type AgentMcpLastErrorCategory = z.infer<
  typeof AgentMcpLastErrorCategorySchema
>;
