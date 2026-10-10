import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  type AIMessage,
  type BaseMessageLike,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import type { ZodTypeAny } from 'zod/v3';

import type { LLMGraphTransformerProps } from '#knowledge-graph/llm-graph-transformer.js';
import { LLMGraphTransformer } from '#knowledge-graph/llm-graph-transformer.js';

const GRAPH_EXTRACTION_TOOL_NAME = 'extract_graph';
const DEFAULT_MAX_TOOL_CALL_RETRIES = 4;
const MAX_TOOL_CALL_RETRIES = 4;
const MAX_REPORTED_ISSUES = 20;

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
  /** 검증 실패 또는 도구 미호출 시 재시도 횟수. 기본값은 4회(총 5번 시도)다. */
  maxToolCallRetries?: number;
};

/**
 * 네이티브 Structured Output이 없는 채팅 모델 전용 어댑터.
 * 모델의 Tool Calling으로 기존 그래프 추출 스키마를 반환받아 Zod로 검증한다.
 * 실패한 시도는 모델의 답과 실패 이유를 대화에 붙여 다시 요청한다. 같은 입력을
 * 그대로 다시 보내면 같은 오답이 돌아오기 때문이다.
 * LLMGraphTransformer의 프롬프트·노드/관계 변환 로직은 변경하지 않는다.
 */
export function createToolCallingGraphTransformer({
  llm,
  maxToolCallRetries = DEFAULT_MAX_TOOL_CALL_RETRIES,
  ...transformerOptions
}: ToolCallingGraphTransformerOptions): LLMGraphTransformer {
  if (
    !Number.isInteger(maxToolCallRetries) ||
    maxToolCallRetries < 0 ||
    maxToolCallRetries > MAX_TOOL_CALL_RETRIES
  ) {
    throw new Error(
      `도구 호출 재시도 횟수는 0~${MAX_TOOL_CALL_RETRIES}의 정수여야 합니다.`,
    );
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
        const messages = toMessages(input);

        for (let attempt = 0; attempt <= maxToolCallRetries; attempt += 1) {
          const message = await toolModel.invoke(messages);
          const calls = message.tool_calls ?? [];
          if (message.invalid_tool_calls?.length) {
            lastFailure = '도구 호출 인수를 파싱할 수 없습니다.';
            reason = 'invalid_arguments';
            messages.push(
              new HumanMessage(
                `Your ${GRAPH_EXTRACTION_TOOL_NAME} call was rejected: its arguments were not valid JSON. Call ${GRAPH_EXTRACTION_TOOL_NAME} again with a valid JSON object.`,
              ),
            );
            continue;
          }

          const matchingCalls = calls.filter(
            (call) => call.name === GRAPH_EXTRACTION_TOOL_NAME,
          );
          if (calls.length !== 1 || matchingCalls.length !== 1) {
            lastFailure = 'extract_graph 도구를 정확히 한 번 호출해야 합니다.';
            reason =
              calls.length === 0 ? 'no_tool_call' : 'unexpected_tool_calls';
            messages.push(
              ...rejection(
                message,
                `Rejected: call ${GRAPH_EXTRACTION_TOOL_NAME} exactly once and do not answer in plain text.`,
              ),
            );
            continue;
          }

          const validation = schema.safeParse(matchingCalls[0].args);
          if (validation.success) {
            return validation.data;
          }
          lastFailure = '도구 호출 인수가 그래프 스키마를 통과하지 못했습니다.';
          reason = 'schema_mismatch';
          messages.push(
            ...rejection(
              message,
              [
                'Rejected: the arguments do not match the tool schema.',
                ...validation.error.issues
                  .slice(0, MAX_REPORTED_ISSUES)
                  .map(
                    (issue) =>
                      `- ${issue.path.join('.') || '(root)'}: ${issue.message}`,
                  ),
                `Call ${GRAPH_EXTRACTION_TOOL_NAME} again using exactly the field names and allowed values from the tool schema.`,
              ].join('\n'),
            ),
          );
        }

        throw new ToolCallingGraphExtractionError(reason, lastFailure);
      });
    },
  });
}

function toMessages(input: BaseLanguageModelInput): BaseMessageLike[] {
  if (typeof input === 'string') return [new HumanMessage(input)];
  if (Array.isArray(input)) return [...input];
  return input.toChatMessages();
}

/**
 * 거절한 시도를 다음 요청에 붙일 메시지로 만든다.
 * 도구 호출마다 결과 메시지가 짝을 이뤄야 하므로 호출이 있으면 tool 메시지로,
 * 없으면 사용자 메시지로 이유를 돌려준다.
 */
function rejection(message: AIMessage, feedback: string): BaseMessageLike[] {
  const calls = message.tool_calls ?? [];
  if (calls.length === 0 || calls.some((call) => !call.id)) {
    return [new HumanMessage(feedback)];
  }
  return [
    message,
    ...calls.map(
      (call) =>
        new ToolMessage({
          content: feedback,
          tool_call_id: call.id ?? '',
          name: call.name,
          status: 'error',
        }),
    ),
  ];
}
