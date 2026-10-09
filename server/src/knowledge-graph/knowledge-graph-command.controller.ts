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
  ParseUUIDPipe,
  Patch,
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
import { ApiZodQuery } from '@/common/http/api-zod-query.decorator';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import {
  CreateCuratedEdgeCommandDto,
  type CreateCuratedEdgeCommandInput,
  CreateCuratedNodeCommandDto,
  type CreateCuratedNodeCommandInput,
  CuratedEndpointOptionsDto,
  type CuratedEndpointOptionsQuery,
  CuratedEndpointOptionsQueryDto,
  CuratedEndpointOptionsQuerySchema,
  CuratedGraphEdgeCommandResultDto,
  CuratedGraphNodeCommandResultDto,
  type DeleteCuratedEdgeCommandQuery,
  DeleteCuratedEdgeCommandQueryDto,
  DeleteCuratedEdgeCommandQuerySchema,
  type DeleteCuratedNodeCommandQuery,
  DeleteCuratedNodeCommandQueryDto,
  DeleteCuratedNodeCommandQuerySchema,
  UpdateCuratedEdgeCommandDto,
  type UpdateCuratedEdgeCommandInput,
  UpdateCuratedNodeCommandDto,
  type UpdateCuratedNodeCommandInput,
} from '@/knowledge-graph/dto/curated-graph-command.dto';
import {
  CreateSemanticCorrectionCommandDto,
  type CreateSemanticCorrectionCommandInput,
  QuerySemanticCorrectionsDto,
  type QuerySemanticCorrectionsInput,
  QuerySemanticCorrectionsSchema,
  SemanticCorrectionCommandResultDto,
  SemanticCorrectionsDto,
  UpdateSemanticCorrectionCommandDto,
  type UpdateSemanticCorrectionCommandInput,
} from '@/knowledge-graph/dto/semantic-correction-command.dto';
import { GraphCommandService } from '@/knowledge-graph/graph-command.service';
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
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('organizations/:organizationId/knowledge-graph')
@UseGuards(TrustedOriginGuard)
export class KnowledgeGraphCommandController {
  constructor(private readonly service: GraphCommandService) {}

  @Post('curated/nodes')
  @ApiCreatedResponse({
    standardSchema: CuratedGraphNodeCommandResultDto.schema,
  })
  createCuratedNode(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CreateCuratedNodeCommandDto.schema })
    input: CreateCuratedNodeCommandInput,
  ): Promise<CuratedGraphNodeCommandResultDto> {
    return this.service.createCuratedNode(
      organizationId,
      session.user.id,
      input,
    );
  }

  @Patch('curated/nodes/:nodeId')
  @ApiOkResponse({ standardSchema: CuratedGraphNodeCommandResultDto.schema })
  updateCuratedNode(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @Body({ schema: UpdateCuratedNodeCommandDto.schema })
    input: UpdateCuratedNodeCommandInput,
  ): Promise<CuratedGraphNodeCommandResultDto> {
    return this.service.updateCuratedNode(
      organizationId,
      nodeId,
      session.user.id,
      input,
    );
  }

  @Delete('curated/nodes/:nodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiZodQuery(DeleteCuratedNodeCommandQuerySchema)
  deleteCuratedNode(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @Query({ schema: DeleteCuratedNodeCommandQueryDto.schema })
    query: DeleteCuratedNodeCommandQuery,
  ): Promise<void> {
    return this.service.deleteCuratedNode(
      organizationId,
      nodeId,
      session.user.id,
      query.expectedRevision,
    );
  }

  @Post('curated/edges')
  @ApiCreatedResponse({
    standardSchema: CuratedGraphEdgeCommandResultDto.schema,
  })
  createCuratedEdge(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CreateCuratedEdgeCommandDto.schema })
    input: CreateCuratedEdgeCommandInput,
  ): Promise<CuratedGraphEdgeCommandResultDto> {
    return this.service.createCuratedEdge(
      organizationId,
      session.user.id,
      input,
    );
  }

  @Patch('curated/edges/:edgeId')
  @ApiOkResponse({ standardSchema: CuratedGraphEdgeCommandResultDto.schema })
  updateCuratedEdge(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Param('edgeId', ParseUUIDPipe) edgeId: string,
    @Body({ schema: UpdateCuratedEdgeCommandDto.schema })
    input: UpdateCuratedEdgeCommandInput,
  ): Promise<CuratedGraphEdgeCommandResultDto> {
    return this.service.updateCuratedEdge(
      organizationId,
      edgeId,
      session.user.id,
      input,
    );
  }

  @Delete('curated/edges/:edgeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiZodQuery(DeleteCuratedEdgeCommandQuerySchema)
  deleteCuratedEdge(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Param('edgeId', ParseUUIDPipe) edgeId: string,
    @Query({ schema: DeleteCuratedEdgeCommandQueryDto.schema })
    query: DeleteCuratedEdgeCommandQuery,
  ): Promise<void> {
    return this.service.deleteCuratedEdge(
      organizationId,
      edgeId,
      session.user.id,
      query.expectedRevision,
    );
  }

  @Get('curated/endpoint-options')
  @ApiZodQuery(CuratedEndpointOptionsQuerySchema)
  @ApiOkResponse({ standardSchema: CuratedEndpointOptionsDto.schema })
  endpointOptions(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: CuratedEndpointOptionsQueryDto.schema })
    query: CuratedEndpointOptionsQuery,
  ): Promise<CuratedEndpointOptionsDto> {
    return this.service.endpointOptions(
      toOrganizationActorContext(session, headers),
      organizationId,
      query,
    );
  }

  @Post('corrections')
  @ApiCreatedResponse({
    standardSchema: SemanticCorrectionCommandResultDto.schema,
  })
  createCorrection(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CreateSemanticCorrectionCommandDto.schema })
    input: CreateSemanticCorrectionCommandInput,
  ): Promise<SemanticCorrectionCommandResultDto> {
    return this.service.createCorrection(
      toOrganizationActorContext(session, headers),
      organizationId,
      session.user.id,
      input,
    );
  }

  @Get('corrections')
  @ApiZodQuery(QuerySemanticCorrectionsSchema)
  @ApiOkResponse({ standardSchema: SemanticCorrectionsDto.schema })
  listCorrections(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: QuerySemanticCorrectionsDto.schema })
    query: QuerySemanticCorrectionsInput,
  ): Promise<SemanticCorrectionsDto> {
    return this.service.listCorrections(
      toOrganizationActorContext(session, headers),
      organizationId,
      query,
    );
  }

  @Patch('corrections/:correctionId')
  @ApiOkResponse({ standardSchema: SemanticCorrectionCommandResultDto.schema })
  updateCorrection(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Param('correctionId', ParseUUIDPipe) correctionId: string,
    @Body({ schema: UpdateSemanticCorrectionCommandDto.schema })
    input: UpdateSemanticCorrectionCommandInput,
  ): Promise<SemanticCorrectionCommandResultDto> {
    return this.service.updateCorrection(
      organizationId,
      correctionId,
      session.user.id,
      input,
    );
  }

  @Delete('corrections/:correctionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  deleteCorrection(
    @Session() session: UserSession<Auth>,
    @Param('organizationId') organizationId: string,
    @Param('correctionId', ParseUUIDPipe) correctionId: string,
  ): Promise<void> {
    return this.service.deleteCorrection(
      organizationId,
      correctionId,
      session.user.id,
    );
  }
}
