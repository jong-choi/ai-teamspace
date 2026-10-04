import type { IncomingHttpHeaders } from 'node:http';

import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import type { Auth } from '#server/auth/auth.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { OrganizationInvitationDto } from '#server/organizations/dto/organization-invitation.dto.js';
import { OrganizationInvitationDetailDto } from '#server/organizations/dto/organization-invitation-detail.dto.js';
import { toOrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import { OrganizationInvitationsService } from '#server/organizations/organization-invitations.service.js';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('invitations')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 502, schema: problemDetailsSchema })
@Controller('invitations')
@UseGuards(TrustedOriginGuard)
export class InvitationsController {
  constructor(
    private readonly organizationInvitationsService: OrganizationInvitationsService,
  ) {}

  @Get(':invitationId')
  @ApiOkResponse({ standardSchema: OrganizationInvitationDetailDto.schema })
  getDetail(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('invitationId') invitationId: string,
  ): Promise<OrganizationInvitationDetailDto> {
    return this.organizationInvitationsService.get(
      toOrganizationActorContext(session, headers),
      invitationId,
    );
  }

  @Post(':invitationId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: OrganizationInvitationDto.schema })
  accept(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('invitationId') invitationId: string,
  ): Promise<OrganizationInvitationDto> {
    return this.organizationInvitationsService.accept(
      toOrganizationActorContext(session, headers),
      invitationId,
    );
  }

  @Post(':invitationId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: OrganizationInvitationDto.schema })
  reject(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('invitationId') invitationId: string,
  ): Promise<OrganizationInvitationDto> {
    return this.organizationInvitationsService.reject(
      toOrganizationActorContext(session, headers),
      invitationId,
    );
  }
}
