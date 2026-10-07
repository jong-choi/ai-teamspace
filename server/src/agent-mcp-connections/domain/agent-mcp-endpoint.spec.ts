import { AgentMcpEndpointSchema } from '@/agent-mcp-connections/domain/agent-mcp-endpoint';

describe('외부 MCP endpoint 계약', () => {
  test('HTTPS endpoint를 canonical URL로 정규화한다', () => {
    expect(
      AgentMcpEndpointSchema.parse(' HTTPS://Example.COM:443/custom/mcp?mode=1 '),
    ).toBe('https://example.com/custom/mcp?mode=1');
  });

  test.each([
    'http://example.com/mcp',
    'https://user:password@example.com/mcp',
    'https://example.com/mcp#fragment',
    'https://example.com/mcp?access_token=secret',
    'https://example.com/mcp?api-key=secret',
  ])('안전하지 않은 endpoint %s 를 거부한다', (endpoint) => {
    expect(() => AgentMcpEndpointSchema.parse(endpoint)).toThrow();
  });

  test('endpoint path를 임의로 /mcp로 변경하지 않는다', () => {
    expect(
      AgentMcpEndpointSchema.parse('https://example.com/custom/protocol'),
    ).toBe('https://example.com/custom/protocol');
  });
});
