import type { OpenAPIObject } from '@nestjs/swagger';

import { AgentMutationReceiptSchema } from '@/mcp/contracts/agent-mutation-receipt.dto';

import { z } from 'zod';

/**
 * REST endpoint가 직접 반환하지 않지만 client runtime 검증이 필요한 schema를 component로 등록한다.
 * Agent tool 결과의 변경 영수증이 대상이며, Orval이 이 component에서 client schema를 생성한다.
 */
const extraSchemas = [AgentMutationReceiptSchema] as const;

const DEFINITIONS_PREFIX = '#/definitions/';
const COMPONENTS_PREFIX = '#/components/schemas/';

export function addExtraSchemas(document: OpenAPIObject): void {
  const components = (document.components ??= {});
  const schemas = (components.schemas ??= {});

  for (const schema of extraSchemas) {
    const converted = z.toJSONSchema(schema, {
      target: 'openapi-3.0',
      io: 'output',
    });
    const definitions = converted.definitions ?? converted.$defs ?? {};

    for (const [name, definition] of Object.entries(definitions)) {
      if (name in schemas) {
        throw new Error(`OpenAPI component 이름이 중복됩니다: ${name}`);
      }
      schemas[name] = rewriteRefs(definition) as (typeof schemas)[string];
    }
  }
}

function rewriteRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteRefs);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      key === '$ref' &&
      typeof item === 'string' &&
      item.startsWith(DEFINITIONS_PREFIX)
        ? COMPONENTS_PREFIX + item.slice(DEFINITIONS_PREFIX.length)
        : rewriteRefs(item),
    ]),
  );
}
