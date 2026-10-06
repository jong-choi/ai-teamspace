import type { AddressInfo } from 'node:net';

import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

export interface FixtureMcpState {
  actors: string[];
  reads: Array<{ actor: string; query: string }>;
  writes: Array<{ actor: string; value: string }>;
  waits: Array<{ actor: string; cancelled: boolean }>;
}

export interface StartedWorkOsMcpFixture {
  url: string;
  state: FixtureMcpState;
  close(): Promise<void>;
}

/**
 * WorkOS 기능을 흉내 내지 않고 MCP protocol/auth/tool discovery 동작만 검증하는 generic fixture다.
 * 모든 tool 이름과 payload는 test 전용이며 application service/domain을 import하지 않는다.
 */
export async function startWorkOsMcpFixture(): Promise<StartedWorkOsMcpFixture> {
  const state: FixtureMcpState = {
    actors: [],
    reads: [],
    writes: [],
    waits: [],
  };
  const handler = createMcpHandler(
    ({ requestInfo }) => {
      const actor = actorFromAuthorization(
        requestInfo?.headers.get('authorization') ?? undefined,
      );
      if (!actor) throw new Error('fixture bearer token required');
      state.actors.push(actor);
      return createFixtureServer(actor, state);
    },
    { legacy: 'reject' },
  );
  const app = createMcpExpressApp();
  app.use('/mcp', (request, response, next) => {
    const actor = actorFromAuthorization(request.header('authorization'));
    if (!actor) {
      response.status(401).json({ error: 'fixture credential required' });
      return;
    }
    next();
  });
  const nodeHandler = toNodeHandler(handler);
  app.all('/mcp', (request, response) =>
    nodeHandler(request, response, request.body),
  );

  const httpServer = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.once('error', reject);
  });
  const address = httpServer.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    state,
    close: async () => {
      await handler.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function createFixtureServer(actor: string, state: FixtureMcpState): McpServer {
  const server = new McpServer({
    name: 'workos-agent-fixture',
    version: '1.0.0',
  });

  server.registerTool(
    'fixture_read',
    {
      description: 'Read generic fixture data',
      inputSchema: z.object({ query: z.string() }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query }) => {
      state.reads.push({ actor, query });
      return {
        content: [{ type: 'text', text: `read:${actor}:${query}` }],
      };
    },
  );

  server.registerTool(
    'fixture_write',
    {
      description: 'Write generic fixture data',
      inputSchema: z.object({ value: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ value }) => {
      state.writes.push({ actor, value });
      return {
        content: [{ type: 'text', text: `wrote:${actor}:${value}` }],
      };
    },
  );

  server.registerTool(
    'fixture_fail',
    {
      description: 'Return a generic fixture failure',
      inputSchema: z.object({ code: z.string() }),
      annotations: { readOnlyHint: true },
    },
    async ({ code }) => {
      throw new Error(`fixture conflict:${code}`);
    },
  );

  server.registerTool(
    'fixture_wait',
    {
      description: 'Wait until completion or cancellation',
      inputSchema: z.object({
        milliseconds: z.number().int().min(1).max(10_000),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ milliseconds }, context) => {
      const waitState = { actor, cancelled: false };
      state.waits.push(waitState);
      const deadline = Date.now() + milliseconds;
      while (Date.now() < deadline && !context.mcpReq.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      waitState.cancelled = context.mcpReq.signal.aborted;
      return {
        content: [
          {
            type: 'text',
            text: waitState.cancelled
              ? `cancelled:${actor}`
              : `finished:${actor}`,
          },
        ],
      };
    },
  );

  // Actor별 tools/list inventory가 섞이지 않는지 확인하기 위한 test-only capability다.
  if (actor === 'user-a') {
    server.registerTool(
      'fixture_private',
      {
        description: 'Actor-specific fixture read tool',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
      },
      async () => ({ content: [{ type: 'text', text: `private:${actor}` }] }),
    );
  }

  return server;
}

function actorFromAuthorization(
  header: string | undefined,
): string | undefined {
  if (!header?.startsWith('Bearer fixture:')) return undefined;
  const actor = header.slice('Bearer fixture:'.length);
  return actor.length > 0 ? actor : undefined;
}
