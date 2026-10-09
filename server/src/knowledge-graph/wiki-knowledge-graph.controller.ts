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
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import {
  RefreshKnowledgeGraphAcceptedDto,
  RefreshKnowledgeGraphDto,
  type RefreshKnowledgeGraphInput,
  WikiKnowledgeGraphStatusDto,
} from '@/knowledge-graph/dto/wiki-knowledge-graph.dto';
import { GraphIndexStatusService } from '@/knowledge-graph/graph-index-status.service';
import { WikiRefreshService } from '@/knowledge-graph/wiki-refresh.service';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('knowledge-graph')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 429, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 503, schema: problemDetailsSchema })
@Controller(
  'organizations/:organizationId/wiki/documents/:documentId/knowledge-graph',
)
@UseGuards(TrustedOriginGuard)
export class WikiKnowledgeGraphController {
  constructor(
    private readonly refreshService: WikiRefreshService,
    private readonly statusService: GraphIndexStatusService,
  ) {}

  @Post('refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    standardSchema: RefreshKnowledgeGraphAcceptedDto.schema,
  })
  refresh(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body({ schema: RefreshKnowledgeGraphDto.schema })
    input: RefreshKnowledgeGraphInput,
  ): Promise<RefreshKnowledgeGraphAcceptedDto> {
    // 빈 object만 허용하는 strict schema 검증이 목적이며 값은 사용하지 않는다.
    void input;
    return this.refreshService.refresh(
      organizationId,
      documentId,
      session.user.id,
    );
  }

  @Get('status')
  @ApiOkResponse({ standardSchema: WikiKnowledgeGraphStatusDto.schema })
  status(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<WikiKnowledgeGraphStatusDto> {
    return this.statusService.getWikiStatus(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
    );
  }
}
