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
  ParseIntPipe,
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
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';
import {
  CreateWikiDocumentDto,
  type CreateWikiDocumentInput,
} from '@/wiki/dto/create-wiki-document.dto';
import {
  UpdateWikiDocumentDto,
  type UpdateWikiDocumentInput,
} from '@/wiki/dto/update-wiki-document.dto';
import { WikiCollaborationSessionDto } from '@/wiki/dto/wiki-collaboration-session.dto';
import { WikiDocumentDto } from '@/wiki/dto/wiki-document.dto';
import {
  WikiDocumentHistoryDto,
  WikiDocumentRevisionDto,
} from '@/wiki/dto/wiki-document-history.dto';
import {
  QueryWikiSearchDto,
  type QueryWikiSearchInput,
  WikiSearchResultDto,
} from '@/wiki/dto/wiki-search.dto';
import { WikiTreeDto } from '@/wiki/dto/wiki-tree.dto';
import { WikiService } from '@/wiki/wiki.service';
import { WikiCollaborationService } from '@/wiki/wiki-collaboration.service';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('wiki')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('organizations/:organizationId/wiki')
@UseGuards(TrustedOriginGuard)
export class WikiController {
  constructor(
    private readonly wikiService: WikiService,
    private readonly collaborationService: WikiCollaborationService,
  ) {}

  @Get('tree')
  @ApiOkResponse({ standardSchema: WikiTreeDto.schema })
  getTree(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
  ): Promise<WikiTreeDto> {
    return this.wikiService.getTree(
      toOrganizationActorContext(session, headers),
      organizationId,
    );
  }

  @Get('search')
  @ApiOkResponse({ standardSchema: WikiSearchResultDto.schema })
  search(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: QueryWikiSearchDto.schema }) query: QueryWikiSearchInput,
  ): Promise<WikiSearchResultDto> {
    return this.wikiService.search(
      toOrganizationActorContext(session, headers),
      organizationId,
      query,
    );
  }

  @Post('documents')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: WikiDocumentDto.schema })
  createDocument(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CreateWikiDocumentDto.schema })
    input: CreateWikiDocumentInput,
  ): Promise<WikiDocumentDto> {
    return this.wikiService.createDocument(
      toOrganizationActorContext(session, headers),
      organizationId,
      input,
    );
  }

  @Get('documents/:documentId')
  @ApiOkResponse({ standardSchema: WikiDocumentDto.schema })
  getDocument(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<WikiDocumentDto> {
    return this.wikiService.getDocument(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
    );
  }

  @Patch('documents/:documentId')
  @ApiOkResponse({ standardSchema: WikiDocumentDto.schema })
  updateDocument(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body({ schema: UpdateWikiDocumentDto.schema })
    input: UpdateWikiDocumentInput,
  ): Promise<WikiDocumentDto> {
    return this.wikiService.updateDocument(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
      input,
    );
  }

  @Delete('documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async deleteDocument(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    await this.wikiService.deleteDocument(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
    );
  }

  @Post('documents/:documentId/collaboration-session')
  @ApiOkResponse({ standardSchema: WikiCollaborationSessionDto.schema })
  createCollaborationSession(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<WikiCollaborationSessionDto> {
    return this.collaborationService.createSession(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
    );
  }

  @Get('documents/:documentId/history')
  @ApiOkResponse({ standardSchema: WikiDocumentHistoryDto.schema })
  listDocumentHistory(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<WikiDocumentHistoryDto> {
    return this.wikiService.listDocumentHistory(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
    );
  }

  @Get('documents/:documentId/history/:revision')
  @ApiOkResponse({ standardSchema: WikiDocumentRevisionDto.schema })
  getDocumentRevision(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Param('revision', ParseIntPipe) revision: number,
  ): Promise<WikiDocumentRevisionDto> {
    return this.wikiService.getDocumentRevision(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
      revision,
    );
  }
}
