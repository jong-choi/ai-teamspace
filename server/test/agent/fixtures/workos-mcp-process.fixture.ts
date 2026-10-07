import type { AddressInfo } from 'node:net';

import { wikiDocumentUpdateTool } from '@/mcp/tools/wiki/wiki-tool-definitions';

import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';

export interface ProcessMcpWrite {
  actor: string;
  organizationId: string;
  documentId: string;
  title: string | undefined;
}

export async function startWorkOsMcpProcessFixture(): Promise<{
  url: string;
  writes: ProcessMcpWrite[];
  writeAttempts: ProcessMcpWrite[];
  setWriteAllowed(allowed: boolean): void;
  close(): Promise<void>;
}> {
  const writes: ProcessMcpWrite[] = [];
  const writeAttempts: ProcessMcpWrite[] = [];
  let writeAllowed = true;
  const handler = createMcpHandler(
    ({ requestInfo }) => {
      const actor = actorFromAuthorization(
        requestInfo?.headers.get('authorization') ?? undefined,
      );
      if (!actor) throw new Error('fixture bearer token required');
      return createFixtureServer(actor, writes, writeAttempts, writeAllowed);
    },
    { legacy: 'reject' },
  );
  const app = createMcpExpressApp();
  app.use('/mcp', (request, response, next) => {
    if (!actorFromAuthorization(request.header('authorization'))) {
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
    writes,
    writeAttempts,
    setWriteAllowed: (allowed) => {
      writeAllowed = allowed;
    },
    close: async () => {
      await handler.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function createFixtureServer(
  actor: string,
  writes: ProcessMcpWrite[],
  writeAttempts: ProcessMcpWrite[],
  writeAllowed: boolean,
): McpServer {
  const server = new McpServer({
    name: 'workos-agent-process-fixture',
    version: '1.0.0',
  });
  server.registerTool(
    wikiDocumentUpdateTool.name,
    {
      title: wikiDocumentUpdateTool.title,
      description: wikiDocumentUpdateTool.description,
      inputSchema: wikiDocumentUpdateTool.inputSchema,
      annotations: wikiDocumentUpdateTool.annotations,
    },
    async ({ organizationId, documentId, title }) => {
      const attempt = { actor, organizationId, documentId, title };
      writeAttempts.push(attempt);
      if (!writeAllowed) {
        throw new Error('MCP_POLICY_REVOKED');
      }
      writes.push(attempt);
      return {
        content: [{ type: 'text', text: 'process fixture write complete' }],
      };
    },
  );
  return server;
}

function actorFromAuthorization(
  header: string | undefined,
): string | undefined {
  if (!header?.startsWith('Bearer fixture:')) return undefined;
  const actor = header.slice('Bearer fixture:'.length);
  return actor.length > 0 ? actor : undefined;
}
