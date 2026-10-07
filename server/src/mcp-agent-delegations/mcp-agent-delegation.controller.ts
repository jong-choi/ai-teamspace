import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import {
  McpAgentDelegationStatusDto,
  StartMcpAgentDelegationDto,
  StartMcpAgentDelegationResponseDto,
  type StartMcpAgentDelegationInput,
} from '@/mcp-agent-delegations/dto/mcp-agent-delegation.dto';
import { McpAgentDelegationFlowInvalidError } from '@/mcp-agent-delegations/mcp-agent-delegation.error';
import { McpAgentDelegationService } from '@/mcp-agent-delegations/mcp-agent-delegation.service';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('mcp')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('mcp/agent-delegation')
export class McpAgentDelegationController {
  constructor(private readonly service: McpAgentDelegationService) {}

  @Get()
  @UseGuards(TrustedOriginGuard)
  @ApiOkResponse({ standardSchema: McpAgentDelegationStatusDto.schema })
  status(
    @Session() session: UserSession<Auth>,
  ): Promise<McpAgentDelegationStatusDto> {
    return this.service.status(actorFromSession(session));
  }

  @Post('start')
  @UseGuards(TrustedOriginGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    standardSchema: StartMcpAgentDelegationResponseDto.schema,
  })
  start(
    @Session() session: UserSession<Auth>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body({ schema: StartMcpAgentDelegationDto.schema })
    input: StartMcpAgentDelegationInput,
  ): Promise<StartMcpAgentDelegationResponseDto> {
    const actor = actorFromSession(session);
    if (!actor) {
      return this.service.start(
        {
          userId: session.user.id,
          organizationId: '__missing__',
        },
        input.returnTo,
        completionUrl(headers, input.returnTo),
      );
    }

    return this.service.start(
      actor,
      input.returnTo,
      completionUrl(headers, input.returnTo),
    );
  }

  @Delete()
  @UseGuards(TrustedOriginGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async revoke(@Session() session: UserSession<Auth>): Promise<void> {
    await this.service.revoke(actorFromSession(session));
  }

  @Get('callback')
  async callback(
    @Req() request: IncomingMessage,
    @Res() response: ServerResponse,
  ): Promise<void> {
    const requestUrl = new URL(
      request.url ?? '/mcp/agent-delegation/callback',
      'http://localhost',
    );
    const result = await this.service.finish(requestUrl.searchParams);
    response.statusCode = HttpStatus.FOUND;
    response.setHeader('Location', result.completionUrl);
    response.end();
  }
}

function actorFromSession(session: UserSession<Auth>) {
  const organizationId = session.session.activeOrganizationId;
  return organizationId
    ? {
        userId: session.user.id,
        organizationId,
      }
    : null;
}

function completionUrl(
  headers: Record<string, string | string[] | undefined>,
  returnTo: string,
): string {
  const source = firstHeader(headers.origin) ??
    firstHeader(headers.referer) ??
    firstHeader(headers['expo-origin']);
  if (!source) {
    throw new McpAgentDelegationFlowInvalidError();
  }

  const target = new URL('/settings/mcp/consent', source);
  target.searchParams.set('returnTo', returnTo);
  return target.toString();
}

function firstHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
