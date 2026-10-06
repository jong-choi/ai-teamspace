import { AgentConfiguration } from '@/agent/config/agent-configuration';
import { parseAgentEnvironment } from '@/agent/config/agent-environment';
import { LangChainWorkOsMcpAdapter } from '@/agent/infrastructure/mcp/langchain/langchain-workos-mcp.adapter';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import type { McpCredentialProvider } from '@/agent/infrastructure/mcp/mcp-credential.provider';

import { startWorkOsMcpFixture } from '@test/agent/fixtures/workos-mcp.fixture';
import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';

const credentials: McpCredentialProvider = {
  getCredential: ({ userId }) => ({
    token: async () => `fixture:${userId}`,
  }),
};

function createAdapter(input: {
  url: string;
  credentialProvider?: McpCredentialProvider;
  timeoutMs?: number;
}): LangChainWorkOsMcpAdapter {
  const configuration = new AgentConfiguration(
    parseAgentEnvironment({
      AGENT_DATABASE_URL: 'postgresql://localhost/agent-test',
      AGENT_REDIS_URL: 'redis://localhost:6379',
      AGENT_REDIS_PREFIX: 'agent-test',
      AGENT_MODEL: 'test:model',
      WORKOS_MCP_URL: input.url,
      AGENT_MCP_TOOL_TIMEOUT_MS: String(input.timeoutMs ?? 2_000),
      AGENT_RUN_QUEUE_NAME: 'agent-test-runs',
    }),
  );
  return new LangChainWorkOsMcpAdapter(
    input.credentialProvider ?? credentials,
    configuration,
    new McpToolApprovalPolicy(),
  );
}

describe('LangChain WorkOS MCP 어댑터', () => {
  test('tools/list schema와 annotation을 실제 MCP에서 읽고 actor별 inventory를 격리한다', async () => {
    const fixture = await startWorkOsMcpFixture();
    try {
      const adapter = createAdapter({ url: fixture.url });
      const sessionA = await adapter.open({
        userId: 'user-a',
        permissions: [],
      });
      const sessionB = await adapter.open({
        userId: 'user-b',
        permissions: [],
      });

      try {
        expect(sessionA.tools.map((tool) => tool.name)).toEqual(
          expect.arrayContaining([
            'fixture_read',
            'fixture_write',
            'fixture_fail',
            'fixture_wait',
            'fixture_private',
          ]),
        );
        expect(sessionB.tools.map((tool) => tool.name)).not.toContain(
          'fixture_private',
        );
        expect(sessionA.readOnlyTools.map((tool) => tool.name)).toContain(
          'fixture_read',
        );
        expect(sessionA.readOnlyTools.map((tool) => tool.name)).not.toContain(
          'fixture_write',
        );
        expect(sessionA.interruptOn).toEqual({ fixture_write: true });

        const read = sessionA.tools.find(
          (tool) => tool.name === 'fixture_read',
        );
        expect(read?.schema).toMatchObject({
          type: 'object',
          properties: { query: expect.any(Object) },
        });
        await expect(read?.invoke({ query: 'alpha' })).resolves.toBe(
          'read:user-a:alpha',
        );
        expect(fixture.state.reads).toContainEqual({
          actor: 'user-a',
          query: 'alpha',
        });
      } finally {
        await Promise.all([
          sessionA.close(),
          sessionA.close(),
          sessionB.close(),
        ]);
      }
    } finally {
      await fixture.close();
    }
  });

  test('MCP tool error를 전달하되 credential을 노출하지 않는다', async () => {
    const fixture = await startWorkOsMcpFixture();
    try {
      const session = await createAdapter({ url: fixture.url }).open({
        userId: 'user-a',
        permissions: [],
      });
      try {
        const fail = session.tools.find((tool) => tool.name === 'fixture_fail');
        if (!fail) throw new Error('fixture_fail tool이 없습니다.');

        let failure: unknown;
        try {
          await fail.invoke({ code: 'conflict-a' });
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeInstanceOf(Error);
        const message = String(failure);
        expect(message).toContain('fixture conflict:conflict-a');
        expect(message).not.toContain('fixture:user-a');
      } finally {
        await session.close();
      }
    } finally {
      await fixture.close();
    }
  });

  test('빈 delegation token은 MCP 요청 전에 fail-closed로 거부한다', async () => {
    const fixture = await startWorkOsMcpFixture();
    const emptyCredentials: McpCredentialProvider = {
      getCredential: () => ({ token: async () => '' }),
    };

    try {
      await expect(
        createAdapter({
          url: fixture.url,
          credentialProvider: emptyCredentials,
        }).open({ userId: 'user-a', permissions: [] }),
      ).rejects.toThrow('credential token이 비어 있습니다');
      expect(fixture.state.actors).toHaveLength(0);
    } finally {
      await fixture.close();
    }
  });

  test('401 응답에서 actor credential을 갱신하고 tools/list를 재시도한다', async () => {
    const fixture = await startWorkOsMcpFixture();
    let token = 'stale-token';
    let refreshCount = 0;
    const refreshingCredentials: McpCredentialProvider = {
      getCredential: () => ({
        token: async () => token,
        onUnauthorized: async () => {
          refreshCount += 1;
          token = 'fixture:user-a';
        },
      }),
    };

    try {
      const session = await createAdapter({
        url: fixture.url,
        credentialProvider: refreshingCredentials,
      }).open({ userId: 'user-a', permissions: [] });
      try {
        expect(refreshCount).toBe(1);
        expect(session.tools.map((tool) => tool.name)).toContain(
          'fixture_read',
        );
        expect(fixture.state.actors).toContain('user-a');
      } finally {
        await session.close();
      }
    } finally {
      await fixture.close();
    }
  });

  test('AbortSignal을 MCP HTTP 요청과 server-side signal까지 전파한다', async () => {
    const fixture = await startWorkOsMcpFixture();
    try {
      const session = await createAdapter({
        url: fixture.url,
        timeoutMs: 10_000,
      }).open({ userId: 'user-a', permissions: [] });
      try {
        const wait = session.tools.find((tool) => tool.name === 'fixture_wait');
        if (!wait) throw new Error('fixture_wait tool이 없습니다.');

        const controller = new AbortController();
        const invocation = wait.invoke(
          { milliseconds: 5_000 },
          { signal: controller.signal },
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        controller.abort();
        await expect(invocation).rejects.toThrow();

        await waitForCondition(
          () => fixture.state.waits.some((entry) => entry.cancelled),
          'AbortSignal이 MCP server-side signal까지 전달되지 않았습니다.',
          { timeoutMs: 2_000 },
        );
        expect(fixture.state.waits).toContainEqual({
          actor: 'user-a',
          cancelled: true,
        });
      } finally {
        await session.close();
      }
    } finally {
      await fixture.close();
    }
  });
});
