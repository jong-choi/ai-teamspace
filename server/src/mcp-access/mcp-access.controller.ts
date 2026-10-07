import type { IncomingHttpHeaders } from 'node:http';

import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { McpAccessCompositeDto } from '@/mcp-access/dto/mcp-access.dto';
import {
  UpdateMcpOrganizationPolicyDto,
  type UpdateMcpOrganizationPolicyInput,
  UpdateMcpUserPolicyDto,
  type UpdateMcpUserPolicyInput,
} from '@/mcp-access/dto/update-mcp-policy.dto';
import { McpAccessService } from '@/mcp-access/mcp-access.service';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('mcp-access')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('organizations/:organizationId/mcp-access')
@UseGuards(TrustedOriginGuard)
export class McpAccessController {
  constructor(private readonly service: McpAccessService) {}

  @Get()
  @ApiOkResponse({ standardSchema: McpAccessCompositeDto.schema })
  getComposite(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
  ): Promise<McpAccessCompositeDto> {
    return this.service.getComposite(
      toOrganizationActorContext(session, headers),
      organizationId,
    );
  }

  @Patch('me')
  @ApiOkResponse({ standardSchema: McpAccessCompositeDto.schema })
  updateMyPolicy(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: UpdateMcpUserPolicyDto.schema })
    input: UpdateMcpUserPolicyInput,
  ): Promise<McpAccessCompositeDto> {
    return this.service.updateMyPolicy(
      toOrganizationActorContext(session, headers),
      organizationId,
      input,
    );
  }

  @Patch('organization-policy')
  @ApiOkResponse({ standardSchema: McpAccessCompositeDto.schema })
  updateOrganizationPolicy(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: UpdateMcpOrganizationPolicyDto.schema })
    input: UpdateMcpOrganizationPolicyInput,
  ): Promise<McpAccessCompositeDto> {
    return this.service.updateOrganizationPolicy(
      toOrganizationActorContext(session, headers),
      organizationId,
      input,
    );
  }
}
