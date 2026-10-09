import {
  createV1McpToolManifest,
  createV1McpToolManifestHash,
  v1McpToolDefinitions,
} from '@/mcp/tools/v1-tool-manifest';

const expectedToolNames = [
  'organizations_list',
  'organization_members_list',
  'organization_invitation_create',
  'chat_conversations_list',
  'chat_messages_list',
  'chat_message_send',
  'wiki_search',
  'wiki_document_get',
  'wiki_document_create',
  'wiki_document_update',
  'projects_list',
  'project_get',
  'project_ticket_get',
  'project_ticket_create',
  'project_ticket_update',
  'project_ticket_move',
  'calendar_meetings_list',
  'calendar_meeting_get',
  'calendar_availability_check',
  'calendar_meeting_create',
  'calendar_meeting_reschedule',
  'calendar_meeting_cancel',
  'calendar_meeting_rsvp',
  'knowledge_search',
  'knowledge_get_context',
] as const;

describe('MCP v1 tool manifest', () => {
  it('acceptance surface를 정확히 25개와 계획 순서로 고정한다', () => {
    expect(v1McpToolDefinitions).toHaveLength(25);
    expect(v1McpToolDefinitions.map(({ name }) => name)).toEqual(
      expectedToolNames,
    );
    expect(new Set(expectedToolNames).size).toBe(expectedToolNames.length);
  });

  it('모든 manifest entry에 object input/output JSON schema가 존재한다', () => {
    const manifest = createV1McpToolManifest();

    for (const entry of manifest) {
      expect(entry.description.trim()).not.toBe('');
      expect(resolveRootType(entry.inputSchema)).toBe('object');
      expect(resolveRootType(entry.outputSchema)).toBe('object');
    }
  });

  it('manifest hash는 같은 contract에 대해 결정적이다', () => {
    const first = createV1McpToolManifestHash();
    const second = createV1McpToolManifestHash();

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });
});

function resolveRootType(schema: unknown): unknown {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    return undefined;
  }

  const objectSchema = schema as Record<string, unknown>;
  if (objectSchema.type !== undefined) {
    return objectSchema.type;
  }

  const reference = objectSchema.$ref;
  const definitions = objectSchema.$defs;
  if (
    typeof reference !== 'string' ||
    !reference.startsWith('#/$defs/') ||
    definitions === null ||
    typeof definitions !== 'object' ||
    Array.isArray(definitions)
  ) {
    return undefined;
  }

  const definitionName = reference.slice('#/$defs/'.length);
  const definition = (definitions as Record<string, unknown>)[definitionName];
  if (
    definition === null ||
    typeof definition !== 'object' ||
    Array.isArray(definition)
  ) {
    return undefined;
  }

  return (definition as Record<string, unknown>).type;
}
