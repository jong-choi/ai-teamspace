import type { IncomingHttpHeaders } from 'node:http';

import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import {
  type SearchQuery,
  SearchQueryDto,
  SearchResponseDto,
} from '@/knowledge-graph/dto/graph-search.dto';
import { KnowledgeGraphSearchService } from '@/knowledge-graph/knowledge-graph-search.service';
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
@Controller('organizations/:organizationId/knowledge-graph')
@UseGuards(TrustedOriginGuard)
export class KnowledgeGraphSearchController {
  constructor(private readonly service: KnowledgeGraphSearchService) {}

  @Get('search')
  @ApiOkResponse({ standardSchema: SearchResponseDto.schema })
  search(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: SearchQueryDto.schema }) query: SearchQuery,
  ): Promise<SearchResponseDto> {
    return this.service.search(
      toOrganizationActorContext(session, headers),
      organizationId,
      query,
    );
  }
}
