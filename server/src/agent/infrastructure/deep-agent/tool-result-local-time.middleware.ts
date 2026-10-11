import { formatLocalInstant } from '@/agent/domain/agent-system-context';

import { ToolMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';

const UTC_INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/**
 * 글 안의 UTC 시각을 사용자 time zone의 시각과 요일로 바꾼다.
 * 모델이 시간대 변환과 요일 계산을 직접 하다 틀리는 것을 막는다.
 */
export function localizeInstants(text: string, timeZone: string): string {
  return text.replace(UTC_INSTANT, (instant) => {
    const date = new Date(instant);
    if (Number.isNaN(date.getTime())) return instant;
    const local = formatLocalInstant(date, timeZone);
    return `${local.instant} (${local.weekday})`;
  });
}

/** 도구 결과의 UTC 시각을 사용자 time zone 기준으로 바꿔 모델에게 준다. */
export function createToolResultLocalTimeMiddleware(timeZone: string) {
  return createMiddleware({
    name: 'ToolResultLocalTime',
    wrapToolCall: async (request, handler) => {
      const result = await handler(request);
      if (!ToolMessage.isInstance(result)) return result;

      return new ToolMessage({
        id: result.id,
        name: result.name,
        content:
          typeof result.content === 'string'
            ? localizeInstants(result.content, timeZone)
            : result.content.map((block) =>
                block.type === 'text' && typeof block.text === 'string'
                  ? { ...block, text: localizeInstants(block.text, timeZone) }
                  : block,
              ),
        tool_call_id: result.tool_call_id,
        status: result.status,
        artifact: result.artifact,
        additional_kwargs: result.additional_kwargs,
        response_metadata: result.response_metadata,
      });
    },
  });
}
