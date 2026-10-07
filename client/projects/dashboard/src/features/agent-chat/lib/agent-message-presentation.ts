import type { Message } from '@langchain/langgraph-sdk';

const emptyMessageFallback = '표시할 수 있는 텍스트가 없습니다.';

export function projectAgentMessageText(content: Message['content']): string {
  if (typeof content === 'string') {
    return content || emptyMessageFallback;
  }

  const parts = content.map((block) => {
    const runtimeBlock = block as unknown as Record<string, unknown>;

    if (
      runtimeBlock['type'] === 'text' &&
      typeof runtimeBlock['text'] === 'string'
    ) {
      return runtimeBlock['text'];
    }
    if (runtimeBlock['type'] === 'image_url') {
      return '[이미지 콘텐츠]';
    }
    return '[지원되지 않는 콘텐츠]';
  });

  return parts.join('\n').trim() || emptyMessageFallback;
}
