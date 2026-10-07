import { createHash, randomBytes } from 'node:crypto';

import { z } from 'zod';

const RESERVED_NAMESPACES = new Set(['internal', 'workos']);
const TOOL_NAME_MAX_LENGTH = 64;
const ORIGINAL_TOOL_NAME_MAX_LENGTH = 256;
const TOOL_SCHEMA_MAX_BYTES = 128 * 1024;
const TOOL_SCHEMA_MAX_DEPTH = 32;
const TOOL_SCHEMA_MAX_ELEMENTS = 4_096;
const NORMALIZED_TOOL_SEGMENT = /[^A-Za-z0-9_-]+/g;

export const AgentMcpNamespaceSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]{2,23}$/)
  .refine((namespace) => !RESERVED_NAMESPACES.has(namespace), {
    message: '예약된 외부 MCP namespace는 사용할 수 없습니다.',
  });

export function createAgentMcpNamespace(): string {
  return AgentMcpNamespaceSchema.parse(`ext${randomBytes(6).toString('hex')}`);
}

export function createAgentMcpToolName(
  namespace: string,
  originalToolName: string,
): string {
  const parsedNamespace = AgentMcpNamespaceSchema.parse(namespace);
  const original = z
    .string()
    .min(1)
    .max(ORIGINAL_TOOL_NAME_MAX_LENGTH)
    .parse(originalToolName);
  const prefix = `${parsedNamespace}__`;
  const normalized = original
    .normalize('NFKC')
    .replace(NORMALIZED_TOOL_SEGMENT, '_')
    .replace(/^_+|_+$/g, '');

  if (
    normalized === original &&
    normalized.length > 0 &&
    prefix.length + normalized.length <= TOOL_NAME_MAX_LENGTH
  ) {
    return `${prefix}${normalized}`;
  }

  const hash = createHash('sha256').update(original).digest('hex').slice(0, 12);
  const suffix = `__${hash}`;
  const maxSegmentLength = TOOL_NAME_MAX_LENGTH - prefix.length - suffix.length;
  const segment = (normalized || 'tool').slice(0, maxSegmentLength);

  return `${prefix}${segment}${suffix}`;
}

export function createAgentMcpToolSchemaFingerprint(
  inputSchema: unknown,
): string {
  const parsedSchema = parseBoundedToolSchema(inputSchema);
  return createHash('sha256').update(canonicalJson(parsedSchema)).digest('hex');
}

function parseBoundedToolSchema(
  inputSchema: unknown,
): z.infer<ReturnType<typeof z.json>> {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(inputSchema);
  } catch {
    throw new Error('외부 MCP tool schema를 안전하게 직렬화할 수 없습니다.');
  }

  if (
    serialized === undefined ||
    Buffer.byteLength(serialized, 'utf8') > TOOL_SCHEMA_MAX_BYTES
  ) {
    throw new Error('외부 MCP tool schema가 허용 크기를 초과했습니다.');
  }

  const parsed: unknown = JSON.parse(serialized);
  const stack: Array<{ value: unknown; depth: number }> = [
    { value: parsed, depth: 0 },
  ];
  let elements = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      break;
    }
    elements += 1;
    if (elements > TOOL_SCHEMA_MAX_ELEMENTS) {
      throw new Error(
        '외부 MCP tool schema element가 허용 한도를 초과했습니다.',
      );
    }
    if (current.depth > TOOL_SCHEMA_MAX_DEPTH) {
      throw new Error('외부 MCP tool schema depth가 허용 한도를 초과했습니다.');
    }

    if (Array.isArray(current.value)) {
      for (const item of current.value) {
        stack.push({ value: item, depth: current.depth + 1 });
      }
    } else if (current.value !== null && typeof current.value === 'object') {
      for (const item of Object.values(current.value)) {
        stack.push({ value: item, depth: current.depth + 1 });
      }
    }
  }

  return z.json().parse(parsed);
}

function canonicalJson(value: z.infer<ReturnType<typeof z.json>>): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}
