import type { IncomingHttpHeaders } from 'node:http';

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';

import type { Auth } from '#server/auth/auth.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import {
  CreateOrganizationInvitationDto,
  type CreateOrganizationInvitationInput,
} from '#server/organizations/dto/create-organization-invitation.dto.js';
import { OrganizationInvitationDto } from '#server/organizations/dto/organization-invitation.dto.js';
import type { OrganizationActorContext } from '#server/organizations/infrastructure/organization/organization.provider.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';

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
  constructor(private readonly organizationsService: OrganizationsService) {}

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
    return this.organizationsService.createInvitation(
      this.context(session, headers),
      organizationId,
      input,
    );
  }

  private context(
    session: UserSession<Auth>,
    requestHeaders: IncomingHttpHeaders,
  ): OrganizationActorContext {
    return {
      userId: session.user.id,
      activeOrganizationIdCandidate:
        session.session.activeOrganizationId ?? undefined,
      providerCredential: requestHeaders,
    };
  }
}
