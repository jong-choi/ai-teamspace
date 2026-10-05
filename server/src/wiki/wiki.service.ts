import { Inject, Injectable } from '@nestjs/common';

import type { OrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';
import {
  WikiDocumentNotEmptyError,
  WikiDocumentNotFoundError,
  WikiDocumentRevisionNotFoundError,
} from '#server/wiki/domain/wiki.error.js';
import { WIKI_COLLABORATION_SCHEMA_VERSION } from '#server/wiki/domain/wiki-collaboration-version.js';
import type { CreateWikiDocumentInput } from '#server/wiki/dto/create-wiki-document.dto.js';
import type { UpdateWikiDocumentInput } from '#server/wiki/dto/update-wiki-document.dto.js';
import {
  toWikiDocumentResponse,
  type WikiDocumentResponse,
} from '#server/wiki/dto/wiki-document.dto.js';
import {
  toWikiDocumentRevisionResponse,
  toWikiDocumentRevisionSummaryResponse,
  type WikiDocumentHistoryResponse,
  type WikiDocumentRevisionResponse,
} from '#server/wiki/dto/wiki-document-history.dto.js';
import type {
  QueryWikiSearchInput,
  WikiSearchResultResponse,
} from '#server/wiki/dto/wiki-search.dto.js';
import { WikiSearchResultSchema } from '#server/wiki/dto/wiki-search.dto.js';
import {
  toWikiTreeResponse,
  type WikiTreeResponse,
} from '#server/wiki/dto/wiki-tree.dto.js';
import { WikiCollaborationInvalidationPublisher } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider.js';
import { WikiCollaborationStateProvider } from '#server/wiki/infrastructure/collaboration/wiki-collaboration-state.provider.js';
import { WikiRepository } from '#server/wiki/infrastructure/persistence/wiki.repository.js';

type WikiOrganizationAccess = Pick<OrganizationsService, 'getDetail'>;

@Injectable()
export class WikiService {
  constructor(
    private readonly wikiRepository: WikiRepository,
    private readonly collaborationStateProvider: WikiCollaborationStateProvider,
    private readonly invalidationPublisher: WikiCollaborationInvalidationPublisher,
    @Inject(OrganizationsService)
    private readonly organizationsService: WikiOrganizationAccess,
  ) {}

  async getTree(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<WikiTreeResponse> {
    await this.assertOrganizationAccess(context, organizationId);
    return toWikiTreeResponse(
      await this.wikiRepository.getTreeForOrganization(organizationId),
    );
  }

  async createDocument(
    context: OrganizationActorContext,
    organizationId: string,
    input: CreateWikiDocumentInput,
  ): Promise<WikiDocumentResponse> {
    await this.assertOrganizationAccess(context, organizationId);
    const contentMarkdown = input.contentMarkdown ?? '';
    const collaboration =
      this.collaborationStateProvider.create(contentMarkdown);

    return toWikiDocumentResponse(
      await this.wikiRepository.createDocument({
        organizationId,
        parentDocumentId: input.parentDocumentId ?? null,
        title: input.title,
        position: input.position ?? 0,
        contentMarkdown: collaboration.contentMarkdown,
        collaborationState: collaboration.encodedState,
        collaborationSchemaVersion: WIKI_COLLABORATION_SCHEMA_VERSION,
        actorUserId: context.userId,
      }),
    );
  }

  async getDocument(
    context: OrganizationActorContext,
    organizationId: string,
    documentId: string,
  ): Promise<WikiDocumentResponse> {
    await this.assertOrganizationAccess(context, organizationId);
    return toWikiDocumentResponse(
      await this.requireDocument(organizationId, documentId),
    );
  }

  async updateDocument(
    context: OrganizationActorContext,
    organizationId: string,
    documentId: string,
    input: UpdateWikiDocumentInput,
  ): Promise<WikiDocumentResponse> {
    await this.assertOrganizationAccess(context, organizationId);
    const current = await this.requireDocument(organizationId, documentId);
    const updated = await this.wikiRepository.updateDocumentMetadata({
      organizationId,
      documentId,
      parentDocumentId:
        input.parentDocumentId === undefined
          ? current.parentDocumentId
          : input.parentDocumentId,
      title: input.title ?? current.title,
      position: input.position ?? current.position,
      actorUserId: context.userId,
    });
    if (!updated) {
      throw new WikiDocumentNotFoundError();
    }
    return toWikiDocumentResponse(updated);
  }

  async deleteDocument(
    context: OrganizationActorContext,
    organizationId: string,
    documentId: string,
  ): Promise<void> {
    await this.assertOrganizationAccess(context, organizationId);
    const result = await this.wikiRepository.deleteDocument(
      organizationId,
      documentId,
    );
    if (result === 'not_found') {
      throw new WikiDocumentNotFoundError();
    }
    if (result === 'not_empty') {
      throw new WikiDocumentNotEmptyError();
    }
    await this.invalidationPublisher.publish({
      scope: 'document',
      organizationId,
      documentId,
    });
  }

  async listDocumentHistory(
    context: OrganizationActorContext,
    organizationId: string,
    documentId: string,
  ): Promise<WikiDocumentHistoryResponse> {
    await this.assertOrganizationAccess(context, organizationId);
    await this.requireDocument(organizationId, documentId);
    const revisions = await this.wikiRepository.listDocumentRevisions(
      organizationId,
      documentId,
    );
    return {
      items: revisions.map(toWikiDocumentRevisionSummaryResponse),
    };
  }

  async getDocumentRevision(
    context: OrganizationActorContext,
    organizationId: string,
    documentId: string,
    revision: number,
  ): Promise<WikiDocumentRevisionResponse> {
    await this.assertOrganizationAccess(context, organizationId);
    await this.requireDocument(organizationId, documentId);
    const result = await this.wikiRepository.findDocumentRevision(
      organizationId,
      documentId,
      revision,
    );
    if (!result) {
      throw new WikiDocumentRevisionNotFoundError();
    }
    return toWikiDocumentRevisionResponse(result);
  }

  async search(
    context: OrganizationActorContext,
    organizationId: string,
    input: QueryWikiSearchInput,
  ): Promise<WikiSearchResultResponse> {
    await this.assertOrganizationAccess(context, organizationId);
    return WikiSearchResultSchema.parse({
      items: await this.wikiRepository.search(organizationId, input.q),
    });
  }

  private async assertOrganizationAccess(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<void> {
    await this.organizationsService.getDetail(context, organizationId);
  }

  private async requireDocument(organizationId: string, documentId: string) {
    const document = await this.wikiRepository.findDocumentById(
      organizationId,
      documentId,
    );
    if (!document) {
      throw new WikiDocumentNotFoundError();
    }
    return document;
  }
}
