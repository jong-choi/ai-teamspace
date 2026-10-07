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

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { OrganizationInvitationDto } from '@/organizations/dto/organization-invitation.dto';
import { OrganizationInvitationDetailDto } from '@/organizations/dto/organization-invitation-detail.dto';
import { OrganizationActiveSessionProvider } from '@/organizations/infrastructure/active-organization-session/organization-active-session.provider';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationInvitationsService } from '@/organizations/organization-invitations.service';

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
    private readonly activeSessionProvider: OrganizationActiveSessionProvider,
  ) {}

  @Get(':invitationId')
  @ApiOkResponse({ standardSchema: OrganizationInvitationDetailDto.schema })
  getDetail(
    @Session() session: UserSession<Auth>,
    @Param('invitationId') invitationId: string,
  ): Promise<OrganizationInvitationDetailDto> {
    return this.organizationInvitationsService.get(
      toOrganizationActorContext(session),
      invitationId,
    );
  }

  @Post(':invitationId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: OrganizationInvitationDto.schema })
  async accept(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('invitationId') invitationId: string,
  ): Promise<OrganizationInvitationDto> {
    const actor = toOrganizationActorContext(session);
    const detail = await this.organizationInvitationsService.get(
      actor,
      invitationId,
    );
    const invitation = await this.organizationInvitationsService.accept(
      actor,
      invitationId,
    );
    await this.activeSessionProvider.setActive(headers, detail.organization.id);
    return invitation;
  }

  @Post(':invitationId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: OrganizationInvitationDto.schema })
  reject(
    @Session() session: UserSession<Auth>,
    @Param('invitationId') invitationId: string,
  ): Promise<OrganizationInvitationDto> {
    return this.organizationInvitationsService.reject(
      toOrganizationActorContext(session),
      invitationId,
    );
  }
}
