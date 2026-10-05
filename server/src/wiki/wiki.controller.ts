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

import type { Auth } from '#server/auth/auth.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { toOrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import {
  CreateWikiDocumentDto,
  type CreateWikiDocumentInput,
} from '#server/wiki/dto/create-wiki-document.dto.js';
import {
  CreateWikiFolderDto,
  type CreateWikiFolderInput,
} from '#server/wiki/dto/create-wiki-folder.dto.js';
import {
  SaveWikiDocumentContentDto,
  type SaveWikiDocumentContentInput,
  WikiDocumentSaveResultDto,
} from '#server/wiki/dto/save-wiki-document-content.dto.js';
import {
  UpdateWikiDocumentDto,
  type UpdateWikiDocumentInput,
} from '#server/wiki/dto/update-wiki-document.dto.js';
import {
  UpdateWikiFolderDto,
  type UpdateWikiFolderInput,
} from '#server/wiki/dto/update-wiki-folder.dto.js';
import { WikiDocumentDto } from '#server/wiki/dto/wiki-document.dto.js';
import {
  WikiDocumentHistoryDto,
  WikiDocumentRevisionDto,
} from '#server/wiki/dto/wiki-document-history.dto.js';
import { WikiEditLockStateDto } from '#server/wiki/dto/wiki-edit-lock.dto.js';
import { WikiFolderDto } from '#server/wiki/dto/wiki-folder.dto.js';
import {
  QueryWikiSearchDto,
  type QueryWikiSearchInput,
  WikiSearchResultDto,
} from '#server/wiki/dto/wiki-search.dto.js';
import { WikiTreeDto } from '#server/wiki/dto/wiki-tree.dto.js';
import { WikiService } from '#server/wiki/wiki.service.js';

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
  constructor(private readonly wikiService: WikiService) {}

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

  @Post('folders')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: WikiFolderDto.schema })
  createFolder(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CreateWikiFolderDto.schema }) input: CreateWikiFolderInput,
  ): Promise<WikiFolderDto> {
    return this.wikiService.createFolder(
      toOrganizationActorContext(session, headers),
      organizationId,
      input,
    );
  }

  @Patch('folders/:folderId')
  @ApiOkResponse({ standardSchema: WikiFolderDto.schema })
  updateFolder(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('folderId', new ParseUUIDPipe()) folderId: string,
    @Body({ schema: UpdateWikiFolderDto.schema }) input: UpdateWikiFolderInput,
  ): Promise<WikiFolderDto> {
    return this.wikiService.updateFolder(
      toOrganizationActorContext(session, headers),
      organizationId,
      folderId,
      input,
    );
  }

  @Delete('folders/:folderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async deleteFolder(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('folderId', new ParseUUIDPipe()) folderId: string,
  ): Promise<void> {
    await this.wikiService.deleteFolder(
      toOrganizationActorContext(session, headers),
      organizationId,
      folderId,
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
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
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
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
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
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ): Promise<void> {
    await this.wikiService.deleteDocument(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
    );
  }

  @Post('documents/:documentId/edit-lock')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: WikiEditLockStateDto.schema })
  acquireEditLock(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ): Promise<WikiEditLockStateDto> {
    return this.wikiService.acquireEditLock(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
    );
  }

  @Put('documents/:documentId/edit-lock')
  @ApiOkResponse({ standardSchema: WikiEditLockStateDto.schema })
  renewEditLock(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ): Promise<WikiEditLockStateDto> {
    return this.wikiService.renewEditLock(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
    );
  }

  @Delete('documents/:documentId/edit-lock')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: WikiEditLockStateDto.schema })
  releaseEditLock(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ): Promise<WikiEditLockStateDto> {
    return this.wikiService.releaseEditLock(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
    );
  }

  @Put('documents/:documentId/content')
  @ApiOkResponse({ standardSchema: WikiDocumentSaveResultDto.schema })
  saveDocumentContent(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body({ schema: SaveWikiDocumentContentDto.schema })
    input: SaveWikiDocumentContentInput,
  ): Promise<WikiDocumentSaveResultDto> {
    return this.wikiService.saveDocumentContent(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
      input,
    );
  }

  @Get('documents/:documentId/history')
  @ApiOkResponse({ standardSchema: WikiDocumentHistoryDto.schema })
  listDocumentHistory(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
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
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('revision', new ParseIntPipe()) revision: number,
  ): Promise<WikiDocumentRevisionDto> {
    return this.wikiService.getDocumentRevision(
      toOrganizationActorContext(session, headers),
      organizationId,
      documentId,
      revision,
    );
  }
}
