import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { McpNodeAdapter } from '@/mcp/infrastructure/transport/model-context-protocol/mcp-node.adapter';

@ApiExcludeController()
@Controller()
export class McpController {
  constructor(private readonly nodeAdapter: McpNodeAdapter) {}

  @Post('mcp')
  async handle(
    @Req() request: IncomingMessage,
    @Res() response: ServerResponse,
  ): Promise<void> {
    await this.nodeAdapter.handle(request, response);
  }

  @Get('mcp')
  rejectGet(@Res() response: ServerResponse): void {
    this.methodNotAllowed(response);
  }

  @Delete('mcp')
  rejectDelete(@Res() response: ServerResponse): void {
    this.methodNotAllowed(response);
  }

  private methodNotAllowed(response: ServerResponse): void {
    response.statusCode = HttpStatus.METHOD_NOT_ALLOWED;
    response.setHeader('Allow', 'POST');
    response.end();
  }
}
