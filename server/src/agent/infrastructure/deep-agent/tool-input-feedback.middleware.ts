import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { Validator } from '@langchain/core/utils/json_schema';
import { isInteropZodSchema } from '@langchain/core/utils/types';
import { createMiddleware } from 'langchain';
import { z } from 'zod';

const toolInputSchemaSchema = z.looseObject({
  properties: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .default({}),
  required: z.array(z.string()).default([]),
  additionalProperties: z.unknown().optional(),
  $defs: z.record(z.string(), z.unknown()).default({}),
});

const schemaNodeSchema = z.looseObject({
  $ref: z.string().optional(),
  type: z.string().optional(),
  enum: z.array(z.unknown()).optional(),
  anyOf: z.array(z.unknown()).optional(),
  format: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  maxLength: z.number().optional(),
});

const FALLBACK_EXPECTATION = '스키마에 맞는 값';

function describeNumberRange(
  unit: string,
  minimum: number | undefined,
  maximum: number | undefined,
): string {
  const bounded = maximum !== undefined && maximum < Number.MAX_SAFE_INTEGER;
  if (minimum !== undefined && bounded) return `${minimum}~${maximum} ${unit}`;
  if (minimum !== undefined) return `${minimum} 이상의 ${unit}`;
  if (bounded) return `${maximum} 이하의 ${unit}`;
  return unit;
}

function describeExpectedValue(
  rawNode: unknown,
  definitions: Record<string, unknown>,
): string {
  const parsed = schemaNodeSchema.safeParse(rawNode);
  if (!parsed.success) return FALLBACK_EXPECTATION;
  const node = parsed.data;

  if (node.$ref !== undefined) {
    const definition = definitions[node.$ref.split('/').at(-1) ?? ''];
    return definition === undefined
      ? FALLBACK_EXPECTATION
      : describeExpectedValue(definition, definitions);
  }
  if (node.enum !== undefined) return `${node.enum.join(', ')} 중 하나`;
  if (node.anyOf !== undefined) {
    return node.anyOf
      .map((branch) => describeExpectedValue(branch, definitions))
      .join(' 또는 ');
  }
  if (node.format === 'date-time') {
    return 'ISO 8601 시각(예: 2026-10-20T18:00:00+09:00)';
  }
  if (node.format === 'uuid') return 'UUID';

  switch (node.type) {
    case 'null':
      return 'null';
    case 'boolean':
      return 'true 또는 false';
    case 'integer':
      return describeNumberRange('정수', node.minimum, node.maximum);
    case 'number':
      return describeNumberRange('숫자', node.minimum, node.maximum);
    case 'string':
      return node.maxLength === undefined
        ? '비어 있지 않은 문자열'
        : `${node.maxLength}자 이하의 비어 있지 않은 문자열`;
    case 'array':
      return '배열';
    case 'object':
      return '객체';
    default:
      return FALLBACK_EXPECTATION;
  }
}

/**
 * 도구 인자가 JSON Schema와 어긋난 지점을 인자별 한 줄로 설명한다.
 * 모델이 다음 호출에서 어느 인자를 어떻게 고칠지 알 수 있게 하려는 것이다.
 */
export function describeToolInputProblems(
  inputSchema: unknown,
  args: Record<string, unknown>,
): string[] {
  const parsed = toolInputSchemaSchema.safeParse(inputSchema);
  if (!parsed.success) return [];
  const { properties, required, additionalProperties, $defs } = parsed.data;
  const allowsUnknownArguments =
    additionalProperties === true || typeof additionalProperties === 'object';
  const problems: string[] = [];

  for (const name of required) {
    if (!(name in args)) problems.push(`${name}: 필수 인자입니다.`);
  }

  for (const [name, value] of Object.entries(args)) {
    const property = properties[name];
    if (property === undefined) {
      if (!allowsUnknownArguments) {
        problems.push(`${name}: 이 도구에 없는 인자입니다.`);
      }
      continue;
    }
    if (new Validator({ ...property, $defs }).validate(value).valid) continue;

    const isEmpty = value === '' || value === null;
    problems.push(
      isEmpty && !required.includes(name)
        ? `${name}: 값이 없으면 인자를 생략합니다.`
        : `${name}: 허용 값은 ${describeExpectedValue(property, $defs)}입니다.`,
    );
  }

  return problems;
}

/**
 * 값 없이 빈 문자열이나 null로 채운 선택 인자를 뺀다.
 * 스키마가 그 값을 받는 인자(예: null로 담당자를 비우는 인자)는 그대로 둔다.
 */
export function dropEmptyOptionalArguments(
  inputSchema: unknown,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = toolInputSchemaSchema.safeParse(inputSchema);
  if (!parsed.success) return args;
  const { properties, required, $defs } = parsed.data;

  return Object.fromEntries(
    Object.entries(args).filter(([name, value]) => {
      const property = properties[name];
      if (property === undefined || required.includes(name)) return true;
      if (value !== '' && value !== null) return true;
      return new Validator({ ...property, $defs }).validate(value).valid;
    }),
  );
}

/**
 * JSON Schema 도구(MCP 도구)의 인자를 실행 전에 확인하고,
 * 어긋나면 원인을 적은 오류 결과를 모델에게 돌려준다.
 */
export const toolInputFeedbackMiddleware = createMiddleware({
  name: 'ToolInputFeedback',
  // 승인 요청과 실행이 같은 인자를 보도록 모델 응답 단계에서 빈 선택 인자를 정리한다.
  wrapModelCall: async (request, handler) => {
    const response = await handler(request);
    if (!AIMessage.isInstance(response) || !response.tool_calls?.length) {
      return response;
    }

    const schemas = new Map<string, unknown>();
    for (const tool of request.tools) {
      if ('schema' in tool && !isInteropZodSchema(tool.schema)) {
        schemas.set(String(tool.name), tool.schema);
      }
    }

    return new AIMessage({
      id: response.id,
      name: response.name,
      content: response.content,
      additional_kwargs: response.additional_kwargs,
      response_metadata: response.response_metadata,
      usage_metadata: response.usage_metadata,
      invalid_tool_calls: response.invalid_tool_calls,
      tool_calls: response.tool_calls.map((toolCall) =>
        schemas.has(toolCall.name)
          ? {
              ...toolCall,
              args: dropEmptyOptionalArguments(
                schemas.get(toolCall.name),
                toolCall.args,
              ),
            }
          : toolCall,
      ),
    });
  },
  wrapToolCall: async (request, handler) => {
    const { tool, toolCall } = request;
    if (
      tool === undefined ||
      !('schema' in tool) ||
      isInteropZodSchema(tool.schema)
    ) {
      return handler(request);
    }

    const problems = describeToolInputProblems(tool.schema, toolCall.args);
    if (problems.length === 0) return handler(request);

    return new ToolMessage({
      content: [
        '인자가 맞지 않아 실행하지 않았습니다.',
        ...problems.map((problem) => `- ${problem}`),
      ].join('\n'),
      tool_call_id: toolCall.id ?? '',
      name: toolCall.name,
      status: 'error',
    });
  },
});
