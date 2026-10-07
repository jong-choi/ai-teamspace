import type { IncomingMessage, ServerResponse } from 'node:http';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import { McpHttpHandler } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-http.handler';

import { toNodeHandler } from '@modelcontextprotocol/node';

@Injectable()
export class McpNodeAdapter {
  private readonly nodeHandler: ReturnType<typeof toNodeHandler>;

  constructor(
    httpHandler: McpHttpHandler,
    configService: ConfigService<AllConfigType>,
  ) {
    const config = configService.getOrThrow('mcp', { infer: true });

    this.nodeHandler = toNodeHandler(
      {
        fetch: (request) => httpHandler.fetch(request),
      },
      {
        maxRequestBodySize: config.protocol.maxRequestBodyBytes,
      },
    );
  }

  handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    return this.nodeHandler(request, response);
  }
}
