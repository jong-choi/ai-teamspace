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
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { ApiZodQuery } from '@/common/http/api-zod-query.decorator';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { GraphOperationsStatusDto } from '@/knowledge-graph/dto/graph-operations.dto';
import {
  GraphRebuildAcceptedDto,
  GraphRebuildCancelAcceptedDto,
  GraphRebuildCancelDto,
  type GraphRebuildCreate,
  GraphRebuildCreateDto,
  GraphRebuildListDto,
  type GraphRebuildListQuery,
  GraphRebuildListQueryDto,
  GraphRebuildListQuerySchema,
  GraphRebuildProgressDto,
} from '@/knowledge-graph/dto/graph-rebuild.dto';
import { GraphRebuildService } from '@/knowledge-graph/graph-rebuild.service';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('knowledge-graph')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 429, schema: problemDetailsSchema })
@Controller('organizations/:organizationId/knowledge-graph')
@UseGuards(TrustedOriginGuard)
export class KnowledgeGraphOperationsController {
  constructor(private readonly service: GraphRebuildService) {}

  @Post('rebuilds')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    standardSchema: GraphRebuildAcceptedDto.schema,
  })
  request(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: GraphRebuildCreateDto.schema }) input: GraphRebuildCreate,
  ): Promise<GraphRebuildAcceptedDto> {
    return this.service.request(
      toOrganizationActorContext(session, headers),
      organizationId,
      input,
    );
  }

  @Get('rebuilds')
  @ApiZodQuery(GraphRebuildListQuerySchema)
  @ApiOkResponse({ standardSchema: GraphRebuildListDto.schema })
  list(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: GraphRebuildListQueryDto.schema })
    query: GraphRebuildListQuery,
  ): Promise<GraphRebuildListDto> {
    return this.service.list(
      toOrganizationActorContext(session, headers),
      organizationId,
      query,
    );
  }

  @Get('rebuilds/:requestId')
  @ApiOkResponse({ standardSchema: GraphRebuildProgressDto.schema })
  get(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ): Promise<GraphRebuildProgressDto> {
    return this.service.get(
      toOrganizationActorContext(session, headers),
      organizationId,
      requestId,
    );
  }

  @Post('rebuilds/:requestId/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    standardSchema: GraphRebuildCancelAcceptedDto.schema,
  })
  cancel(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body({ schema: GraphRebuildCancelDto.schema }) input: object,
  ): Promise<GraphRebuildCancelAcceptedDto> {
    void input;
    return this.service.cancel(
      toOrganizationActorContext(session, headers),
      organizationId,
      requestId,
    );
  }

  @Get('operations/status')
  @ApiOkResponse({ standardSchema: GraphOperationsStatusDto.schema })
  status(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
  ): Promise<GraphOperationsStatusDto> {
    return this.service.status(
      toOrganizationActorContext(session, headers),
      organizationId,
    );
  }
}
