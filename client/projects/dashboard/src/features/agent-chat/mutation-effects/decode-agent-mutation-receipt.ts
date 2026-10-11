import {
  AgentMutationReceipt,
  type AgentMutationReceiptOutput,
} from '@repo/client/api-client/schemas';
import { extractStructuredContent } from '@core/features/agent-chat/lib/agent-chat-turns';
import { getAgentToolSource } from '@core/features/agent-chat/lib/agent-tool-display';

import type { ToolCallWithResult } from '@langchain/langgraph-sdk';

/**
 * 성공한 AI Teamspace write 도구의 structured 결과에서 변경 영수증을 꺼낸다.
 * 외부 MCP 도구가 같은 모양을 흉내 내거나, 다른 조직 영수증이거나, 알 수 없는 version이면 무시한다.
 */
export function decodeAgentMutationReceipt(
  tool: ToolCallWithResult,
  organizationId: string,
): AgentMutationReceiptOutput | null {
  if (tool.state !== 'completed' || tool.result?.status === 'error') {
    return null;
  }
  if (getAgentToolSource(tool.call.name).kind !== 'workos') return null;

  const structured = extractStructuredContent(tool.result?.artifact);
  if (
    structured === null ||
    typeof structured !== 'object' ||
    !('mutation' in structured)
  ) {
    return null;
  }

  const parsed = AgentMutationReceipt.safeParse(structured.mutation);
  if (!parsed.success) return null;
  if (parsed.data.organizationId !== organizationId) return null;
  return parsed.data;
}
