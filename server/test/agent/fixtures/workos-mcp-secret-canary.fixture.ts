import type { AddressInfo } from 'node:net';

import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

export const WORKOS_MCP_SECRET_CANARY =
  'access-token-CANARY-workos-agent-secret';

export async function startWorkOsMcpSecretCanaryFixture(): Promise<{
  url: string;
  close(): Promise<void>;
}> {
  const handler = createMcpHandler(
    ({ requestInfo }) => {
      const authorization = requestInfo?.headers.get('authorization');
      if (authorization !== `Bearer ${WORKOS_MCP_SECRET_CANARY}`) {
        throw new Error('fixture credential required');
      }
      return createFixtureServer();
    },
    { legacy: 'reject' },
  );
  const app = createMcpExpressApp();
  app.use('/mcp', (request, response, next) => {
    if (
      request.header('authorization') !== `Bearer ${WORKOS_MCP_SECRET_CANARY}`
    ) {
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
    close: async () => {
      await handler.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function createFixtureServer(): McpServer {
  const server = new McpServer({
    name: 'workos-agent-secret-canary',
    version: '1.0.0',
  });
  server.registerTool(
    'organizations_list',
    {
      description: 'Secret canary read fixture',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => ({
      content: [{ type: 'text', text: 'canary fixture read complete' }],
    }),
  );
  return server;
}
