import {
  Body,
  Controller,
  Delete,
  Get,
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

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import {
  CreateOrganizationInvitationDto,
  type CreateOrganizationInvitationInput,
} from '@/organizations/dto/create-organization-invitation.dto';
import { OrganizationInvitationDto } from '@/organizations/dto/organization-invitation.dto';
import { OrganizationInvitationListDto } from '@/organizations/dto/organization-invitation-list.dto';
import {
  QueryOrganizationInvitationsDto,
  type QueryOrganizationInvitationsInput,
} from '@/organizations/dto/query-organization-invitations.dto';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationInvitationsService } from '@/organizations/organization-invitations.service';

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
    @Param('organizationId') organizationId: string,
    @Query({ schema: QueryOrganizationInvitationsDto.schema })
    query: QueryOrganizationInvitationsInput,
  ): Promise<OrganizationInvitationListDto> {
    return this.organizationInvitationsService.list(
      toOrganizationActorContext(session),
      organizationId,
      query,
    );
  }

  @Post(':organizationId/invitations')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: OrganizationInvitationDto.schema })
  create(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CreateOrganizationInvitationDto.schema })
    input: CreateOrganizationInvitationInput,
  ): Promise<OrganizationInvitationDto> {
    return this.organizationInvitationsService.create(
      toOrganizationActorContext(session),
      organizationId,
      input,
    );
  }

  @Delete(':organizationId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async cancel(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
  ): Promise<void> {
    await this.organizationInvitationsService.cancel(
      toOrganizationActorContext(session),
      organizationId,
      invitationId,
    );
  }

  @Post(':organizationId/invitations/:invitationId/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: OrganizationInvitationDto.schema })
  resend(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
  ): Promise<OrganizationInvitationDto> {
    return this.organizationInvitationsService.resend(
      toOrganizationActorContext(session),
      organizationId,
      invitationId,
    );
  }
}
