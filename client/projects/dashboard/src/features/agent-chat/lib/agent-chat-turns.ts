import { stripAgentSystemContext } from '@core/features/agent-chat/lib/agent-client-context';
import { AGENT_HITL_REJECT_PREFIX } from '@core/features/agent-chat/lib/agent-hitl';
import {
  type AgentToolDisplayField,
  type AgentToolSource,
  formatAgentToolResult,
  getAgentToolSource,
  isAgentToolPermissionDenied,
  projectAgentToolDisplay,
} from '@core/features/agent-chat/lib/agent-tool-display';

import type { Message, ToolCallWithResult } from '@langchain/langgraph-sdk';
import type { SubagentStatus } from '@langchain/langgraph-sdk/react';

export type AgentToolCallState =
  'pending' | 'completed' | 'error' | 'rejected' | 'denied';

export type AgentSubagentSummary = {
  name: string;
  status: SubagentStatus;
  toolCount: number;
};

export type AgentToolCallItem = {
  kind: 'tool';
  key: string;
  id: string;
  name: string;
  label: string;
  source: AgentToolSource;
  state: AgentToolCallState;
  fields: AgentToolDisplayField[];
  resultSummary: string | null;
  resultDetails: string | null;
  structured: unknown;
  subagent: AgentSubagentSummary | null;
};

export type AgentAssistantItem =
  { kind: 'text'; key: string; text: string } | AgentToolCallItem;

export type AgentChatTurn =
  | { kind: 'user'; key: string; text: string }
  | {
      kind: 'assistant';
      key: string;
      reasoning: string | null;
      items: AgentAssistantItem[];
      createdAt: Date | null;
    };

export type AgentSubagentLookup = (
  toolCallId: string,
) => AgentSubagentSummary | undefined;

export function groupAgentChatTurns(input: {
  messages: readonly Message[];
  toolCalls: readonly ToolCallWithResult[];
  getSubagent?: AgentSubagentLookup;
}): AgentChatTurn[] {
  const toolCallsById = new Map(input.toolCalls.map((tool) => [tool.id, tool]));
  const turns: AgentChatTurn[] = [];
  let current: Extract<AgentChatTurn, { kind: 'assistant' }> | null = null;

  input.messages.forEach((message, index) => {
    if (message.type === 'human') {
      current = null;
      // 서버가 붙인 맥락 블록은 모델만 읽는다.
      const text = stripAgentSystemContext(extractMessageText(message.content));
      if (text) {
        turns.push({ kind: 'user', key: message.id ?? `user-${index}`, text });
      }
      return;
    }

    if (message.type !== 'ai') return;

    if (!current) {
      current = {
        kind: 'assistant',
        key: `assistant-${message.id ?? index}`,
        reasoning: null,
        items: [],
        createdAt: null,
      };
      turns.push(current);
    }

    const reasoning = extractReasoning(message);
    if (reasoning) {
      current.reasoning = current.reasoning
        ? `${current.reasoning}\n\n${reasoning}`
        : reasoning;
    }

    current.createdAt = extractCreatedAt(message) ?? current.createdAt;

    const text = extractMessageText(message.content);
    if (text) {
      current.items.push({
        kind: 'text',
        key: `${message.id ?? index}-text`,
        text,
      });
    }

    (message.tool_calls ?? []).forEach((call, callIndex) => {
      const id = call.id ?? `${message.id ?? index}-${callIndex}`;
      current?.items.push(
        projectToolCallItem({
          id,
          name: call.name,
          args: call.args,
          tool: toolCallsById.get(id),
          subagent: input.getSubagent?.(id) ?? null,
        }),
      );
    });
  });

  return turns;
}

export function hasAgentTurnContent(
  turn: Extract<AgentChatTurn, { kind: 'assistant' }>,
): boolean {
  return turn.items.length > 0 || turn.reasoning !== null;
}

export function buildAgentTurnCopyText(
  turn: Extract<AgentChatTurn, { kind: 'assistant' }>,
): string {
  return turn.items
    .map((item) =>
      item.kind === 'text'
        ? item.text
        : [item.label, item.resultSummary].filter(Boolean).join(': '),
    )
    .filter((value) => value.trim().length > 0)
    .join('\n\n');
}

function projectToolCallItem(input: {
  id: string;
  name: string;
  args: unknown;
  tool: ToolCallWithResult | undefined;
  subagent: AgentSubagentSummary | null;
}): AgentToolCallItem {
  const result = input.tool?.result;
  const structured = extractStructuredContent(result?.artifact);
  const resultText = result ? extractMessageText(result.content) : '';
  const display = projectAgentToolDisplay({
    name: input.name,
    args: input.args,
    result: resultText || null,
    structured,
  });

  return {
    kind: 'tool',
    key: `tool-${input.id}`,
    id: input.id,
    name: input.name,
    label: display.label,
    source: getAgentToolSource(input.name),
    state: resolveToolState(input.tool, resultText),
    fields: display.fields,
    resultSummary: display.resultSummary,
    resultDetails: formatAgentToolResult(structured ?? (resultText || null)),
    structured,
    subagent: input.subagent,
  };
}

function resolveToolState(
  tool: ToolCallWithResult | undefined,
  resultText: string,
): AgentToolCallState {
  if (!tool) return 'pending';
  if (tool.state !== 'error' && tool.result?.status !== 'error') {
    return tool.state;
  }
  if (resultText.startsWith(AGENT_HITL_REJECT_PREFIX)) return 'rejected';
  if (isAgentToolPermissionDenied(resultText)) return 'denied';
  return 'error';
}

export function extractStructuredContent(artifact: unknown): unknown {
  if (!Array.isArray(artifact)) return undefined;
  for (const entry of artifact) {
    if (
      isRecord(entry) &&
      entry['type'] === 'mcp_structured_content' &&
      'data' in entry
    ) {
      return entry['data'];
    }
  }
  return undefined;
}

export function extractMessageText(content: Message['content']): string {
  if (typeof content === 'string') return content.trim();

  return content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim();
}

function extractReasoning(message: Message): string | null {
  const fromKwargs = message.additional_kwargs?.['reasoning_content'];
  if (typeof fromKwargs === 'string' && fromKwargs.trim()) {
    return fromKwargs.trim();
  }

  if (typeof message.content === 'string') return null;

  // 일부 provider는 content block으로 추론을 보낸다. SDK 타입에 없는 block이라 런타임에서 확인한다.
  const blocks: unknown[] = message.content;
  const parts = blocks.flatMap((block) => {
    if (!isRecord(block)) return [];
    if (
      block['type'] === 'reasoning' &&
      typeof block['reasoning'] === 'string'
    ) {
      return [block['reasoning']];
    }
    if (block['type'] === 'thinking' && typeof block['thinking'] === 'string') {
      return [block['thinking']];
    }
    return [];
  });
  const joined = parts.join('\n').trim();
  return joined || null;
}

function extractCreatedAt(message: Message): Date | null {
  const candidates = [
    message.response_metadata?.['created_at'],
    message.response_metadata?.['createdAt'],
    message.additional_kwargs?.['created_at'],
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' && typeof candidate !== 'number') {
      continue;
    }
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
