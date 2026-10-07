import { loadMcpTools } from '@langchain/mcp-adapters';
import type { Client } from '@modelcontextprotocol/client';

describe('external MCP elicitation v1 policy', () => {
  test('elicitation 비활성화 상태의 input-required 결과는 approval interrupt가 아니라 명확한 tool error로 끝난다', async () => {
    const client = {
      getProtocolEra: jest.fn().mockReturnValue('modern'),
      listTools: jest.fn().mockResolvedValue({
        tools: [
          {
            name: 'needs_input',
            description: '사용자 입력이 필요한 외부 tool',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      }),
      callTool: jest.fn().mockResolvedValue({
        resultType: 'input_required',
        requestState: 'opaque-server-state',
      }),
    } as unknown as Client;

    const [tool] = await loadMcpTools('external-test', client, {
      prefixToolNameWithServerName: false,
      elicitation: false,
    });

    await expect(tool.invoke({})).rejects.toThrow(
      'asked for input, which only a modern server with elicitation enabled can answer',
    );
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'needs_input',
      }),
      expect.not.objectContaining({
        allowInputRequired: true,
      }),
    );
  });
});
