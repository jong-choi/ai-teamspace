import { rejectOversizedToolInput } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-tool-input-bound';

function toolCall(argumentsValue: unknown, method = 'tools/call'): Request {
  return new Request('https://workos.example/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      method,
      params: { name: 'wiki_search', arguments: argumentsValue },
    }),
  });
}

describe('MCP tool 입력 element 상한', () => {
  it('상한 이하의 tools/call은 SDK로 넘긴다', async () => {
    await expect(
      rejectOversizedToolInput(toolCall({ items: [1, 2, 3] }), 4),
    ).resolves.toBeUndefined();
  });

  it('중첩된 array item과 object property 합계가 상한을 넘으면 JSON-RPC invalid params로 거부한다', async () => {
    const response = await rejectOversizedToolInput(
      toolCall({ nested: { items: [1, 2, 3] } }),
      4,
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: 7,
      error: { code: -32602 },
    });
  });

  it('tools/call이 아니거나 JSON이 아닌 요청은 SDK 처리에 맡긴다', async () => {
    await expect(
      rejectOversizedToolInput(toolCall([1, 2, 3, 4, 5], 'tools/list'), 1),
    ).resolves.toBeUndefined();
    await expect(
      rejectOversizedToolInput(
        new Request('https://workos.example/mcp', {
          method: 'POST',
          body: '{"jsonrpc":',
        }),
        1,
      ),
    ).resolves.toBeUndefined();
  });
});
