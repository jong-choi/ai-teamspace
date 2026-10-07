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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { ActiveOrganizationDto } from '@/organizations/dto/active-organization.dto';
import {
  CreateOrganizationDto,
  type CreateOrganizationInput,
} from '@/organizations/dto/create-organization.dto';
import { OrganizationAccessDto } from '@/organizations/dto/organization-access.dto';
import { OrganizationListDto } from '@/organizations/dto/organization-list.dto';
import { OrganizationMemberDto } from '@/organizations/dto/organization-member.dto';
import { OrganizationMemberListDto } from '@/organizations/dto/organization-member-list.dto';
import {
  QueryOrganizationMembersDto,
  type QueryOrganizationMembersInput,
} from '@/organizations/dto/query-organization-members.dto';
import {
  SetActiveOrganizationDto,
  type SetActiveOrganizationInput,
} from '@/organizations/dto/set-active-organization.dto';
import {
  UpdateOrganizationMemberRoleDto,
  type UpdateOrganizationMemberRoleInput,
} from '@/organizations/dto/update-organization-member-role.dto';
import { OrganizationActiveSessionProvider } from '@/organizations/infrastructure/active-organization-session/organization-active-session.provider';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('organizations')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 502, schema: problemDetailsSchema })
@Controller('organizations')
@UseGuards(TrustedOriginGuard)
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly activeSessionProvider: OrganizationActiveSessionProvider,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: OrganizationListDto.schema })
  list(@Session() session: UserSession<Auth>): Promise<OrganizationListDto> {
    return this.organizationsService.list(toOrganizationActorContext(session));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: OrganizationAccessDto.schema })
  create(
    @Session() session: UserSession<Auth>,
    @Body({ schema: CreateOrganizationDto.schema })
    input: CreateOrganizationInput,
  ): Promise<OrganizationAccessDto> {
    return this.organizationsService.create(
      toOrganizationActorContext(session),
      input,
    );
  }

  @Get('active')
  @ApiOkResponse({ standardSchema: ActiveOrganizationDto.schema })
  getActive(
    @Session() session: UserSession<Auth>,
  ): Promise<ActiveOrganizationDto> {
    return this.organizationsService.getActive(
      toOrganizationActorContext(session),
    );
  }

  @Put('active')
  @ApiOkResponse({ standardSchema: ActiveOrganizationDto.schema })
  async setActive(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Body({ schema: SetActiveOrganizationDto.schema })
    input: SetActiveOrganizationInput,
  ): Promise<ActiveOrganizationDto> {
    const result = await this.organizationsService.setActive(
      toOrganizationActorContext(session),
      input,
    );
    await this.activeSessionProvider.setActive(headers, input.organizationId);
    return result;
  }

  @Get(':organizationId')
  @ApiOkResponse({ standardSchema: OrganizationAccessDto.schema })
  getDetail(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationAccessDto> {
    return this.organizationsService.getDetail(
      toOrganizationActorContext(session),
      organizationId,
    );
  }

  @Get(':organizationId/members')
  @ApiOkResponse({ standardSchema: OrganizationMemberListDto.schema })
  listMembers(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Query({ schema: QueryOrganizationMembersDto.schema })
    query: QueryOrganizationMembersInput,
  ): Promise<OrganizationMemberListDto> {
    return this.organizationsService.listMembers(
      toOrganizationActorContext(session),
      organizationId,
      query,
    );
  }

  @Patch(':organizationId/members/:memberId/role')
  @ApiOkResponse({ standardSchema: OrganizationMemberDto.schema })
  changeMemberRole(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body({ schema: UpdateOrganizationMemberRoleDto.schema })
    input: UpdateOrganizationMemberRoleInput,
  ): Promise<OrganizationMemberDto> {
    return this.organizationsService.changeMemberRole(
      toOrganizationActorContext(session),
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
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
  ): Promise<void> {
    await this.organizationsService.removeMember(
      toOrganizationActorContext(session),
      organizationId,
      memberId,
    );
  }
}
