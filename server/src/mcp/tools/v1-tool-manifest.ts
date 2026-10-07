import { createHash } from 'node:crypto';

import { calendarToolDefinitions } from '@/mcp/tools/calendar/calendar-tool-definitions';
import { chatToolDefinitions } from '@/mcp/tools/chat/chat-tool-definitions';
import type { McpToolDefinition } from '@/mcp/tools/mcp-tool-definition';
import { organizationToolDefinitions } from '@/mcp/tools/organizations/organization-tool-definitions';
import { projectToolDefinitions } from '@/mcp/tools/projects/project-tool-definitions';
import { wikiToolDefinitions } from '@/mcp/tools/wiki/wiki-tool-definitions';

import { z } from 'zod';

export const v1McpToolDefinitions = [
  ...organizationToolDefinitions,
  ...chatToolDefinitions,
  ...wikiToolDefinitions,
  ...projectToolDefinitions,
  ...calendarToolDefinitions,
] as const;

export type V1McpToolName = (typeof v1McpToolDefinitions)[number]['name'];

export type McpToolManifestEntry = {
  name: string;
  title: string;
  description: string;
  requiredScope: McpToolDefinition['requiredScope'];
  classification: McpToolDefinition['classification'];
  annotations: McpToolDefinition['annotations'];
  inputSchema: unknown;
  outputSchema: unknown;
};

export function createV1McpToolManifest(): McpToolManifestEntry[] {
  const seenNames = new Set<string>();

  return v1McpToolDefinitions.map((definition) => {
    if (seenNames.has(definition.name)) {
      throw new Error(`중복 MCP tool 이름입니다: ${definition.name}`);
    }
    seenNames.add(definition.name);

    return {
      name: definition.name,
      title: definition.title,
      description: definition.description,
      requiredScope: definition.requiredScope,
      classification: definition.classification,
      annotations: definition.annotations,
      inputSchema: z.toJSONSchema(definition.inputSchema),
      outputSchema: z.toJSONSchema(definition.outputSchema),
    };
  });
}

export function createV1McpToolManifestHash(): string {
  return createHash('sha256')
    .update(canonicalJson(createV1McpToolManifest()))
    .digest('hex');
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }

  return value;
}
