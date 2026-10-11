import { useAgentMutationEffects } from '@core/features/agent-chat/mutation-effects/use-agent-mutation-effects';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ToolCallWithResult } from '@langchain/langgraph-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockApply = jest.fn<() => Promise<void>>();
jest.mock(
  '@core/features/agent-chat/mutation-effects/agent-mutation-effect-registry',
  () => ({ applyAgentMutationEffect: () => mockApply() }),
);

function ticketTool(
  id: string,
  state: ToolCallWithResult['state'],
): ToolCallWithResult {
  return {
    id,
    call: { id, name: 'project_ticket_create', args: {} },
    aiMessage: { type: 'ai', content: '' },
    index: 0,
    state,
    result:
      state === 'pending'
        ? undefined
        : {
            type: 'tool',
            tool_call_id: id,
            content: '{}',
            artifact: [
              {
                type: 'mcp_structured_content',
                data: {
                  result: {},
                  mutation: {
                    version: 1,
                    source: 'teamspace',
                    organizationId: 'org-a',
                    resourceId: `ticket-${id}`,
                    kind: 'project_ticket',
                    operation: 'created',
                    projectId: 'project-1',
                    updatedAt: '2026-10-08T10:00:00.000Z',
                  },
                },
              },
            ],
          },
  };
}

function setup(initial: ToolCallWithResult[], hydrated = true) {
  const queryClient = new QueryClient();
  return renderHook(
    ({
      toolCalls,
      ready,
    }: {
      toolCalls: ToolCallWithResult[];
      ready: boolean;
    }) =>
      useAgentMutationEffects({
        hydrated: ready,
        organizationId: 'org-a',
        threadId: 'thread-1',
        toolCalls,
      }),
    {
      initialProps: { toolCalls: initial, ready: hydrated },
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  );
}

describe('Agent 변경 영수증 반영 hook', () => {
  beforeEach(() => {
    mockApply.mockReset();
    mockApply.mockResolvedValue(undefined);
  });

  it('hydration 시점에 이미 끝난 도구는 다시 반영하지 않는다', async () => {
    const view = await setup([ticketTool('old', 'completed')]);
    await view.rerender({
      toolCalls: [ticketTool('old', 'completed')],
      ready: true,
    });
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('새로 완료된 도구는 한 번만 반영한다', async () => {
    const view = await setup([ticketTool('new', 'pending')]);
    await view.rerender({
      toolCalls: [ticketTool('new', 'completed')],
      ready: true,
    });
    await view.rerender({
      toolCalls: [ticketTool('new', 'completed')],
      ready: true,
    });
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
  });

  it('반영에 실패하면 자동 재시도하지 않고 다시 시도로만 처리한다', async () => {
    mockApply.mockRejectedValueOnce(new Error('network'));
    const view = await setup([]);
    await view.rerender({
      toolCalls: [ticketTool('new', 'completed')],
      ready: true,
    });
    await waitFor(() => expect(view.result.current.failures).toHaveLength(1));
    expect(mockApply).toHaveBeenCalledTimes(1);

    await act(async () => {
      await view.result.current.retry();
    });
    expect(mockApply).toHaveBeenCalledTimes(2);
    expect(view.result.current.failures).toHaveLength(0);
  });
});
