import type { IncomingHttpHeaders } from 'node:http';

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { Auth } from '#server/auth/auth.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import {
  CreateOrganizationInvitationDto,
  type CreateOrganizationInvitationInput,
} from '#server/organizations/dto/create-organization-invitation.dto.js';
import { OrganizationInvitationDto } from '#server/organizations/dto/organization-invitation.dto.js';
import { OrganizationInvitationListDto } from '#server/organizations/dto/organization-invitation-list.dto.js';
import {
  QueryOrganizationInvitationsDto,
  type QueryOrganizationInvitationsInput,
} from '#server/organizations/dto/query-organization-invitations.dto.js';
import { toOrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import { OrganizationInvitationsService } from '#server/organizations/organization-invitations.service.js';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('organization-invitations')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 502, schema: problemDetailsSchema })
@Controller('organizations')
@UseGuards(TrustedOriginGuard)
export class OrganizationInvitationsController {
  constructor(
    private readonly organizationInvitationsService: OrganizationInvitationsService,
  ) {}

  @Get(':organizationId/invitations')
  @ApiOkResponse({ standardSchema: OrganizationInvitationListDto.schema })
  list(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: QueryOrganizationInvitationsDto.schema })
    query: QueryOrganizationInvitationsInput,
  ): Promise<OrganizationInvitationListDto> {
    return this.organizationInvitationsService.list(
      toOrganizationActorContext(session, headers),
      organizationId,
      query,
    );
  }

  @Post(':organizationId/invitations')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: OrganizationInvitationDto.schema })
  create(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CreateOrganizationInvitationDto.schema })
    input: CreateOrganizationInvitationInput,
  ): Promise<OrganizationInvitationDto> {
    return this.organizationInvitationsService.create(
      toOrganizationActorContext(session, headers),
      organizationId,
      input,
    );
  }

  @Delete(':organizationId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async cancel(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
  ): Promise<void> {
    await this.organizationInvitationsService.cancel(
      toOrganizationActorContext(session, headers),
      organizationId,
      invitationId,
    );
  }

  @Post(':organizationId/invitations/:invitationId/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: OrganizationInvitationDto.schema })
  resend(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
  ): Promise<OrganizationInvitationDto> {
    return this.organizationInvitationsService.resend(
      toOrganizationActorContext(session, headers),
      organizationId,
      invitationId,
    );
  }
}
