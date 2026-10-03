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
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { Auth } from '#server/auth/auth.js';
import {
  ApplicationProblemDto,
  problemResponse,
} from '#server/common/http/application-problem.dto.js';
import { ActiveOrganizationDto } from '#server/organizations/dto/active-organization.dto.js';
import {
  CreateOrganizationDto,
  type CreateOrganizationInput,
} from '#server/organizations/dto/create-organization.dto.js';
import { OrganizationAccessDto } from '#server/organizations/dto/organization-access.dto.js';
import { OrganizationListDto } from '#server/organizations/dto/organization-list.dto.js';
import { OrganizationMemberDto } from '#server/organizations/dto/organization-member.dto.js';
import { OrganizationMemberListDto } from '#server/organizations/dto/organization-member-list.dto.js';
import {
  QueryOrganizationMembersDto,
  type QueryOrganizationMembersInput,
} from '#server/organizations/dto/query-organization-members.dto.js';
import {
  SetActiveOrganizationDto,
  type SetActiveOrganizationInput,
} from '#server/organizations/dto/set-active-organization.dto.js';
import {
  UpdateOrganizationMemberRoleDto,
  type UpdateOrganizationMemberRoleInput,
} from '#server/organizations/dto/update-organization-member-role.dto.js';
import type { OrganizationActorContext } from '#server/organizations/infrastructure/organization/organization.provider.js';
import { OrganizationOriginGuard } from '#server/organizations/organization-origin.guard.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

@ApiTags('organizations')
@ApiExtraModels(ApplicationProblemDto)
@ApiResponse({ status: 400, ...problemResponse })
@ApiResponse({ status: 401, ...problemResponse })
@ApiResponse({ status: 403, ...problemResponse })
@ApiResponse({ status: 404, ...problemResponse })
@ApiResponse({ status: 409, ...problemResponse })
@ApiResponse({ status: 500, ...problemResponse })
@ApiResponse({ status: 502, ...problemResponse })
@Controller('organizations')
@UseGuards(OrganizationOriginGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOkResponse({ standardSchema: OrganizationListDto.schema })
  list(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
  ): Promise<OrganizationListDto> {
    return this.organizationsService.list(this.context(session, headers));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: OrganizationAccessDto.schema })
  create(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Body({ schema: CreateOrganizationDto.schema })
    input: CreateOrganizationInput,
  ): Promise<OrganizationAccessDto> {
    return this.organizationsService.create(
      this.context(session, headers),
      input,
    );
  }

  @Get('active')
  @ApiOkResponse({ standardSchema: ActiveOrganizationDto.schema })
  getActive(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
  ): Promise<ActiveOrganizationDto> {
    return this.organizationsService.getActive(this.context(session, headers));
  }

  @Put('active')
  @ApiOkResponse({ standardSchema: ActiveOrganizationDto.schema })
  setActive(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Body({ schema: SetActiveOrganizationDto.schema })
    input: SetActiveOrganizationInput,
  ): Promise<ActiveOrganizationDto> {
    return this.organizationsService.setActive(
      this.context(session, headers),
      input,
    );
  }

  @Get(':organizationId')
  @ApiOkResponse({ standardSchema: OrganizationAccessDto.schema })
  getDetail(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationAccessDto> {
    return this.organizationsService.getDetail(
      this.context(session, headers),
      organizationId,
    );
  }

  @Get(':organizationId/members')
  @ApiOkResponse({ standardSchema: OrganizationMemberListDto.schema })
  listMembers(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: QueryOrganizationMembersDto.schema })
    query: QueryOrganizationMembersInput,
  ): Promise<OrganizationMemberListDto> {
    return this.organizationsService.listMembers(
      this.context(session, headers),
      organizationId,
      query,
    );
  }

  @Patch(':organizationId/members/:memberId/role')
  @ApiOkResponse({ standardSchema: OrganizationMemberDto.schema })
  changeMemberRole(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body({ schema: UpdateOrganizationMemberRoleDto.schema })
    input: UpdateOrganizationMemberRoleInput,
  ): Promise<OrganizationMemberDto> {
    return this.organizationsService.changeMemberRole(
      this.context(session, headers),
      organizationId,
      memberId,
      input,
    );
  }

  @Delete(':organizationId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async removeMember(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    await this.organizationsService.removeMember(
      this.context(session, headers),
      organizationId,
      memberId,
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
