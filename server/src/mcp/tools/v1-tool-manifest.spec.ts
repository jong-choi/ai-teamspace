import {
  createV1McpToolManifest,
  createV1McpToolManifestHash,
} from '@/mcp/tools/v1-tool-manifest';

describe('MCP v1 tool manifest', () => {
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
