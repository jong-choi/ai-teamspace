import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { McpOAuthConnectionListDto } from '@/mcp-oauth-connections/dto/mcp-oauth-connection.dto';
import { McpOAuthConnectionsService } from '@/mcp-oauth-connections/mcp-oauth-connections.service';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('mcp')
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('mcp/oauth-connections')
@UseGuards(TrustedOriginGuard)
export class McpOAuthConnectionsController {
  constructor(private readonly service: McpOAuthConnectionsService) {}

  @Get()
  @ApiOkResponse({ standardSchema: McpOAuthConnectionListDto.schema })
  list(
    @Session() session: UserSession<Auth>,
  ): Promise<McpOAuthConnectionListDto> {
    return this.service.list(session.user.id);
  }

  @Delete(':consentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async revoke(
    @Session() session: UserSession<Auth>,
    @Param('consentId') consentId: string,
  ): Promise<void> {
    await this.service.revoke(session.user.id, consentId);
  }
}
