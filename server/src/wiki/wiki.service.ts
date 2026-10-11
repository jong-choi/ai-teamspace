import { Inject, Injectable } from '@nestjs/common';

import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';
import {
  WikiDocumentNotEmptyError,
  WikiDocumentNotFoundError,
  WikiDocumentRevisionNotFoundError,
} from '@/wiki/domain/wiki.error';
import { WIKI_COLLABORATION_SCHEMA_VERSION } from '@/wiki/domain/wiki-collaboration-version';
import type { CreateWikiDocumentInput } from '@/wiki/dto/create-wiki-document.dto';
import type { UpdateWikiDocumentInput } from '@/wiki/dto/update-wiki-document.dto';
import {
  toWikiDocumentResponse,
  type WikiDocumentResponse,
} from '@/wiki/dto/wiki-document.dto';
import {
  toWikiDocumentRevisionResponse,
  toWikiDocumentRevisionSummaryResponse,
  type WikiDocumentHistoryResponse,
  type WikiDocumentRevisionResponse,
} from '@/wiki/dto/wiki-document-history.dto';
import type {
  QueryWikiSearchInput,
  WikiSearchResultResponse,
} from '@/wiki/dto/wiki-search.dto';
import { WikiSearchResultSchema } from '@/wiki/dto/wiki-search.dto';
import {
  toWikiTreeResponse,
  type WikiTreeResponse,
} from '@/wiki/dto/wiki-tree.dto';
import { WikiCollaborationInvalidationPublisher } from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';
import { WikiCollaborationStateProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-state.provider';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';
import { WikiCollaborationService } from '@/wiki/wiki-collaboration.service';

type WikiOrganizationAccess = Pick<OrganizationsService, 'getDetail'>;
type WikiContentEditing = Pick<
  WikiCollaborationService,
  'prepareContentEdit' | 'commitContentEdit'
>;

@Injectable()
export class WikiService {
  constructor(
    private readonly wikiRepository: WikiRepository,
    private readonly collaborationStateProvider: WikiCollaborationStateProvider,
    private readonly invalidationPublisher: WikiCollaborationInvalidationPublisher,
    @Inject(OrganizationsService)
    private readonly organizationsService: WikiOrganizationAccess,
    @Inject(WikiCollaborationService)
    private readonly contentEditing: WikiContentEditing,
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
      await this.wikiRepository.createDocument(
        organizationId,
        context.userId,
        input,
        collaboration,
        WIKI_COLLABORATION_SCHEMA_VERSION,
      ),
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
    // 본문 수정 위치를 먼저 확정해, 위치 오류일 때 metadata만 바뀌는 일이 없게 한다.
    const preparedContentEdit = input.contentEdit
      ? await this.contentEditing.prepareContentEdit(
          organizationId,
          documentId,
          input.contentEdit,
        )
      : null;

    const metadataRequested =
      input.parentDocumentId !== undefined ||
      input.title !== undefined ||
      input.position !== undefined;
    let updated = current;
    if (metadataRequested) {
      const result = await this.wikiRepository.updateDocumentMetadata(
        organizationId,
        documentId,
        context.userId,
        {
          parentDocumentId:
            input.parentDocumentId === undefined
              ? current.parentDocumentId
              : input.parentDocumentId,
          title: input.title ?? current.title,
          position: input.position ?? current.position,
        },
      );
      if (!result) {
        throw new WikiDocumentNotFoundError();
      }
      updated = result;
    }

    if (preparedContentEdit) {
      await this.contentEditing.commitContentEdit(
        preparedContentEdit,
        context.userId,
      );
      // 열려 있는 편집기가 저장된 본문을 바로 받도록 공동편집 서버에 알린다.
      await this.invalidationPublisher.publish({
        scope: 'document-content',
        organizationId,
        documentId,
      });
      updated = await this.requireDocument(organizationId, documentId);
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
