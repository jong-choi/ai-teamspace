import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AgentMcpConnectionsService } from '@/agent-mcp-connections/application/agent-mcp-connections.service';
import {
  AgentMcpConnectionDto,
  AgentMcpConnectionListDto,
} from '@/agent-mcp-connections/dto/agent-mcp-connection.dto';
import {
  AgentMcpConnectionTestDto,
  AgentMcpToolCatalogDto,
} from '@/agent-mcp-connections/dto/agent-mcp-discovery.dto';
import { AgentMcpOauthAuthorizationDto } from '@/agent-mcp-connections/dto/agent-mcp-oauth.dto';
import {
  CreateAgentMcpConnectionDto,
  type CreateAgentMcpConnectionInput,
} from '@/agent-mcp-connections/dto/create-agent-mcp-connection.dto';
import {
  DeleteAgentMcpConnectionQueryDto,
  type DeleteAgentMcpConnectionQueryInput,
  DeleteAgentMcpConnectionQuerySchema,
} from '@/agent-mcp-connections/dto/delete-agent-mcp-connection.dto';
import {
  UpdateAgentMcpConnectionDto,
  type UpdateAgentMcpConnectionInput,
} from '@/agent-mcp-connections/dto/update-agent-mcp-connection.dto';
import {
  UpdateAgentMcpToolPolicyDto,
  type UpdateAgentMcpToolPolicyInput,
} from '@/agent-mcp-connections/dto/update-agent-mcp-tool-policy.dto';
import type { Auth } from '@/auth/auth';
import { ApiZodQuery } from '@/common/http/api-zod-query.decorator';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('agent-mcp-connections')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('agent/mcp-connections')
@UseGuards(TrustedOriginGuard)
export class AgentMcpConnectionsController {
  constructor(private readonly service: AgentMcpConnectionsService) {}

  @Get()
  @ApiOkResponse({ standardSchema: AgentMcpConnectionListDto.schema })
  list(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
  ): Promise<AgentMcpConnectionListDto> {
    return this.service.list(toOrganizationActorContext(session, headers));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: AgentMcpConnectionDto.schema })
  create(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Body({ schema: CreateAgentMcpConnectionDto.schema })
    input: CreateAgentMcpConnectionInput,
  ): Promise<AgentMcpConnectionDto> {
    return this.service.create(
      toOrganizationActorContext(session, headers),
      input,
    );
  }

  @Post(':connectionId/oauth/start')
  @ApiOkResponse({ standardSchema: AgentMcpOauthAuthorizationDto.schema })
  startOauth(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ): Promise<AgentMcpOauthAuthorizationDto> {
    return this.service.startOauth(
      toOrganizationActorContext(session, headers),
      connectionId,
    );
  }

  @Get('oauth/callback')
  @ApiOkResponse({ standardSchema: AgentMcpConnectionDto.schema })
  finishOauth(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Req() request: IncomingMessage,
  ): Promise<AgentMcpConnectionDto> {
    const callbackParams = new URL(
      request.url ?? '/agent/mcp-connections/oauth/callback',
      'http://localhost',
    ).searchParams;
    return this.service.finishOauth(
      toOrganizationActorContext(session, headers),
      callbackParams,
    );
  }

  @Get(':connectionId')
  @ApiOkResponse({ standardSchema: AgentMcpConnectionDto.schema })
  get(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ): Promise<AgentMcpConnectionDto> {
    return this.service.get(
      toOrganizationActorContext(session, headers),
      connectionId,
    );
  }

  @Post(':connectionId/test')
  @ApiOkResponse({ standardSchema: AgentMcpConnectionTestDto.schema })
  testConnection(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ): Promise<AgentMcpConnectionTestDto> {
    return this.service.testConnection(
      toOrganizationActorContext(session, headers),
      connectionId,
    );
  }

  @Get(':connectionId/tools')
  @ApiOkResponse({ standardSchema: AgentMcpToolCatalogDto.schema })
  discoverTools(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ): Promise<AgentMcpToolCatalogDto> {
    return this.service.discoverTools(
      toOrganizationActorContext(session, headers),
      connectionId,
    );
  }

  @Patch(':connectionId')
  @ApiOkResponse({ standardSchema: AgentMcpConnectionDto.schema })
  update(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body({ schema: UpdateAgentMcpConnectionDto.schema })
    input: UpdateAgentMcpConnectionInput,
  ): Promise<AgentMcpConnectionDto> {
    return this.service.update(
      toOrganizationActorContext(session, headers),
      connectionId,
      input,
    );
  }

  @Patch(':connectionId/tool-policy')
  @ApiOkResponse({ standardSchema: AgentMcpConnectionDto.schema })
  updateToolPolicy(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body({ schema: UpdateAgentMcpToolPolicyDto.schema })
    input: UpdateAgentMcpToolPolicyInput,
  ): Promise<AgentMcpConnectionDto> {
    return this.service.updateToolPolicy(
      toOrganizationActorContext(session, headers),
      connectionId,
      input,
    );
  }

  @Delete(':connectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiZodQuery(DeleteAgentMcpConnectionQuerySchema)
  @ApiNoContentResponse()
  remove(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Query({ schema: DeleteAgentMcpConnectionQueryDto.schema })
    query: DeleteAgentMcpConnectionQueryInput,
  ): Promise<void> {
    return this.service.remove(
      toOrganizationActorContext(session, headers),
      connectionId,
      query.expectedRevision,
    );
  }
}
