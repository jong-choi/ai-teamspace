import type { IncomingHttpHeaders } from 'node:http';

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import type { Auth } from '#server/auth/auth.js';
import { ApiZodQuery } from '#server/common/http/api-zod-query.decorator.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { toOrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import {
  CreateProjectDto,
  type CreateProjectInput,
} from '#server/projects/dto/create-project.dto.js';
import {
  CreateProjectColumnDto,
  type CreateProjectColumnInput,
} from '#server/projects/dto/create-project-column.dto.js';
import {
  CreateTicketDto,
  type CreateTicketInput,
} from '#server/projects/dto/create-ticket.dto.js';
import {
  ProjectDetailDto,
  ProjectListDto,
} from '#server/projects/dto/project.dto.js';
import {
  ProjectColumnDto,
  ProjectColumnListDto,
} from '#server/projects/dto/project-column.dto.js';
import {
  QueryTicketsDto,
  type QueryTicketsInput,
  QueryTicketsSchema,
} from '#server/projects/dto/query-tickets.dto.js';
import {
  TicketDetailDto,
  TicketListDto,
} from '#server/projects/dto/ticket.dto.js';
import {
  UpdateProjectDto,
  type UpdateProjectInput,
} from '#server/projects/dto/update-project.dto.js';
import {
  UpdateProjectColumnDto,
  type UpdateProjectColumnInput,
} from '#server/projects/dto/update-project-column.dto.js';
import {
  UpdateTicketDto,
  type UpdateTicketInput,
} from '#server/projects/dto/update-ticket.dto.js';
import { ProjectsService } from '#server/projects/projects.service.js';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('projects')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('organizations/:organizationId/projects')
@UseGuards(TrustedOriginGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOkResponse({ standardSchema: ProjectListDto.schema })
  listProjects(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
  ): Promise<ProjectListDto> {
    return this.projectsService.listProjects(
      toOrganizationActorContext(session, headers),
      organizationId,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: ProjectDetailDto.schema })
  createProject(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CreateProjectDto.schema }) input: CreateProjectInput,
  ): Promise<ProjectDetailDto> {
    return this.projectsService.createProject(
      toOrganizationActorContext(session, headers),
      organizationId,
      input,
    );
  }

  @Get(':projectId')
  @ApiOkResponse({ standardSchema: ProjectDetailDto.schema })
  getProject(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectDetailDto> {
    return this.projectsService.getProject(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
    );
  }

  @Patch(':projectId')
  @ApiOkResponse({ standardSchema: ProjectDetailDto.schema })
  updateProject(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body({ schema: UpdateProjectDto.schema }) input: UpdateProjectInput,
  ): Promise<ProjectDetailDto> {
    return this.projectsService.updateProject(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      input,
    );
  }

  @Get(':projectId/columns')
  @ApiOkResponse({ standardSchema: ProjectColumnListDto.schema })
  listProjectColumns(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectColumnListDto> {
    return this.projectsService.listColumns(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
    );
  }

  @Post(':projectId/columns')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: ProjectColumnDto.schema })
  createProjectColumn(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body({ schema: CreateProjectColumnDto.schema })
    input: CreateProjectColumnInput,
  ): Promise<ProjectColumnDto> {
    return this.projectsService.createColumn(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      input,
    );
  }

  @Patch(':projectId/columns/:columnId')
  @ApiOkResponse({ standardSchema: ProjectColumnDto.schema })
  updateProjectColumn(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @Body({ schema: UpdateProjectColumnDto.schema })
    input: UpdateProjectColumnInput,
  ): Promise<ProjectColumnDto> {
    return this.projectsService.updateColumn(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      columnId,
      input,
    );
  }

  @Get(':projectId/tickets')
  @ApiZodQuery(QueryTicketsSchema)
  @ApiOkResponse({ standardSchema: TicketListDto.schema })
  listTickets(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query({ schema: QueryTicketsDto.schema }) query: QueryTicketsInput,
  ): Promise<TicketListDto> {
    return this.projectsService.listTickets(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      query,
    );
  }

  @Post(':projectId/tickets')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: TicketDetailDto.schema })
  createTicket(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body({ schema: CreateTicketDto.schema }) input: CreateTicketInput,
  ): Promise<TicketDetailDto> {
    return this.projectsService.createTicket(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      input,
    );
  }

  @Get(':projectId/tickets/:ticketId')
  @ApiOkResponse({ standardSchema: TicketDetailDto.schema })
  getTicket(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<TicketDetailDto> {
    return this.projectsService.getTicket(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
    );
  }

  @Patch(':projectId/tickets/:ticketId')
  @ApiOkResponse({ standardSchema: TicketDetailDto.schema })
  updateTicket(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body({ schema: UpdateTicketDto.schema }) input: UpdateTicketInput,
  ): Promise<TicketDetailDto> {
    return this.projectsService.updateTicket(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      input,
    );
  }
}
