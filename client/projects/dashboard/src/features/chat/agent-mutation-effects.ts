import type { ChatMessageMutationReceiptOutput } from '@repo/client/api-client/schemas';
import { refreshConversationMetadata } from '@core/features/chat/chat-cache';

import type { QueryClient } from '@tanstack/react-query';

// 메시지 본문은 realtime 경로가 원본이다. 영수증으로는 대화 목록과 대화 정보만 갱신한다.
export async function applyChatMessageAgentMutation(
  queryClient: QueryClient,
  receipt: ChatMessageMutationReceiptOutput,
): Promise<void> {
  await refreshConversationMetadata(queryClient, receipt.conversationId);
}
