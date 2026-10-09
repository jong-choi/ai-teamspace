import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { RunnableLambda } from '@langchain/core/runnables';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import type { ZodTypeAny } from 'zod/v3';

import type { LLMGraphTransformerProps } from '#knowledge-graph/llm-graph-transformer.js';
import { LLMGraphTransformer } from '#knowledge-graph/llm-graph-transformer.js';

const GRAPH_EXTRACTION_TOOL_NAME = 'extract_graph';

export class ToolCallingGraphExtractionError extends Error {
  constructor(
    readonly reason:
      | 'no_tool_call'
      | 'unexpected_tool_calls'
      | 'invalid_arguments'
      | 'schema_mismatch',
    detail: string,
  ) {
    super(`Tool Calling 그래프 추출 실패: ${detail}`);
    this.name = 'ToolCallingGraphExtractionError';
  }
}

export type ToolCallingGraphTransformerOptions = Omit<
  LLMGraphTransformerProps,
  'llm' | 'structuredOutputAdapter'
> & {
  llm: BaseChatModel;
  /** 검증 실패 또는 도구 미호출 시 재시도 횟수. 기본값은 1회다. */
  maxToolCallRetries?: number;
};

/**
 * 네이티브 Structured Output이 없는 채팅 모델 전용 어댑터.
 * 모델의 Tool Calling으로 기존 그래프 추출 스키마를 반환받아 Zod로 검증한다.
 * LLMGraphTransformer의 프롬프트·노드/관계 변환 로직은 변경하지 않는다.
 */
export function createToolCallingGraphTransformer({
  llm,
  maxToolCallRetries = 1,
  ...transformerOptions
}: ToolCallingGraphTransformerOptions): LLMGraphTransformer {
  if (
    !Number.isInteger(maxToolCallRetries) ||
    maxToolCallRetries < 0 ||
    maxToolCallRetries > 3
  ) {
    throw new Error('도구 호출 재시도 횟수는 0~3의 정수여야 합니다.');
  }

  return new LLMGraphTransformer({
    ...transformerOptions,
    llm,
    structuredOutputAdapter: (schema: ZodTypeAny) => {
      if (typeof llm.bindTools !== 'function') {
        throw new Error(
          '이 채팅 모델은 Tool Calling(bindTools)을 지원하지 않습니다.',
        );
      }

      const toolModel = llm.bindTools([
        {
          type: 'function',
          function: {
            name: GRAPH_EXTRACTION_TOOL_NAME,
            description:
              'Extract a knowledge graph from the provided text. Always call this tool with nodes and relationships. Do not answer in plain text.',
            parameters: toJsonSchema(schema),
          },
        },
      ]);

      return RunnableLambda.from(async (input: BaseLanguageModelInput) => {
        let lastFailure = '도구가 호출되지 않았습니다.';
        let reason: ToolCallingGraphExtractionError['reason'] = 'no_tool_call';

        for (let attempt = 0; attempt <= maxToolCallRetries; attempt += 1) {
          const message = await toolModel.invoke(input);
          const calls = message.tool_calls ?? [];
          if (message.invalid_tool_calls?.length) {
            lastFailure = '도구 호출 인수를 파싱할 수 없습니다.';
            reason = 'invalid_arguments';
            continue;
          }

          const matchingCalls = calls.filter(
            (call) => call.name === GRAPH_EXTRACTION_TOOL_NAME,
          );
          if (calls.length !== 1 || matchingCalls.length !== 1) {
            lastFailure = 'extract_graph 도구를 정확히 한 번 호출해야 합니다.';
            reason =
              calls.length === 0 ? 'no_tool_call' : 'unexpected_tool_calls';
            continue;
          }

          const validation = schema.safeParse(matchingCalls[0].args);
          if (validation.success) {
            return validation.data;
          }
          lastFailure = '도구 호출 인수가 그래프 스키마를 통과하지 못했습니다.';
          reason = 'schema_mismatch';
        }

        throw new ToolCallingGraphExtractionError(reason, lastFailure);
      });
    },
  });
}
