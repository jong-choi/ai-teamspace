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
  type ExploreQuery,
  ExploreQueryDto,
  GraphEdgeDto,
  GraphEdgeListDto,
  type GraphEdgeListQuery,
  GraphEdgeListQueryDto,
  GraphNodeDto,
  GraphNodeListDto,
  type GraphNodeListQuery,
  GraphNodeListQueryDto,
  GraphSnapshotDto,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import { KnowledgeGraphDetailService } from '@/knowledge-graph/knowledge-graph-detail.service';
import { KnowledgeGraphEdgeListService } from '@/knowledge-graph/knowledge-graph-edge-list.service';
import { KnowledgeGraphExploreService } from '@/knowledge-graph/knowledge-graph-explore.service';
import { KnowledgeGraphNodeListService } from '@/knowledge-graph/knowledge-graph-node-list.service';
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
@ApiProblemResponse({ status: 503, schema: problemDetailsSchema })
@Controller('organizations/:organizationId/knowledge-graph')
@UseGuards(TrustedOriginGuard)
export class KnowledgeGraphController {
  constructor(
    private readonly exploreService: KnowledgeGraphExploreService,
    private readonly nodeList: KnowledgeGraphNodeListService,
    private readonly edgeList: KnowledgeGraphEdgeListService,
    private readonly detail: KnowledgeGraphDetailService,
  ) {}

  @Get('explore')
  @ApiOkResponse({ standardSchema: GraphSnapshotDto.schema })
  explore(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: ExploreQueryDto.schema }) query: ExploreQuery,
  ): Promise<GraphSnapshotDto> {
    return this.exploreService.explore(
      toOrganizationActorContext(session, headers),
      organizationId,
      query,
    );
  }

  @Get('nodes')
  @ApiOkResponse({ standardSchema: GraphNodeListDto.schema })
  listNodes(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: GraphNodeListQueryDto.schema }) query: GraphNodeListQuery,
  ): Promise<GraphNodeListDto> {
    return this.nodeList.list(
      toOrganizationActorContext(session, headers),
      organizationId,
      query,
    );
  }

  @Get('edges')
  @ApiOkResponse({ standardSchema: GraphEdgeListDto.schema })
  listEdges(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: GraphEdgeListQueryDto.schema }) query: GraphEdgeListQuery,
  ): Promise<GraphEdgeListDto> {
    return this.edgeList.list(
      toOrganizationActorContext(session, headers),
      organizationId,
      query,
    );
  }

  @Get('nodes/:nodeId')
  @ApiOkResponse({ standardSchema: GraphNodeDto.schema })
  nodeDetail(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<GraphNodeDto> {
    return this.detail.node(
      toOrganizationActorContext(session, headers),
      organizationId,
      nodeId,
    );
  }

  @Get('edges/:edgeId')
  @ApiOkResponse({ standardSchema: GraphEdgeDto.schema })
  edgeDetail(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('edgeId') edgeId: string,
  ): Promise<GraphEdgeDto> {
    return this.detail.edge(
      toOrganizationActorContext(session, headers),
      organizationId,
      edgeId,
    );
  }
}
