import { Inject, Injectable } from '@nestjs/common';

import type { OrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';
import {
  WikiDocumentNotFoundError,
  WikiFolderNotEmptyError,
  WikiFolderNotFoundError,
  WikiInvalidFolderMoveError,
} from '#server/wiki/domain/wiki.error.js';
import type { CreateWikiDocumentInput } from '#server/wiki/dto/create-wiki-document.dto.js';
import type { CreateWikiFolderInput } from '#server/wiki/dto/create-wiki-folder.dto.js';
import type { UpdateWikiDocumentInput } from '#server/wiki/dto/update-wiki-document.dto.js';
import type { UpdateWikiFolderInput } from '#server/wiki/dto/update-wiki-folder.dto.js';
import {
  toWikiDocumentResponse,
  type WikiDocumentResponse,
} from '#server/wiki/dto/wiki-document.dto.js';
import {
  toWikiFolderResponse,
  type WikiFolderResponse,
} from '#server/wiki/dto/wiki-folder.dto.js';
import {
  toWikiTreeResponse,
  type WikiTreeResponse,
} from '#server/wiki/dto/wiki-tree.dto.js';
import { WikiRepository } from '#server/wiki/infrastructure/persistence/wiki.repository.js';

type WikiOrganizationAccess = Pick<OrganizationsService, 'getDetail'>;

@Injectable()
export class WikiService {
  constructor(
    private readonly wikiRepository: WikiRepository,
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

  async createFolder(
    context: OrganizationActorContext,
    organizationId: string,
    input: CreateWikiFolderInput,
  ): Promise<WikiFolderResponse> {
    await this.assertOrganizationAccess(context, organizationId);
    const parentFolderId = input.parentFolderId ?? null;
    await this.assertFolderExists(organizationId, parentFolderId);

    return toWikiFolderResponse(
      await this.wikiRepository.createFolder({
        organizationId,
        parentFolderId,
        name: input.name,
        position: input.position ?? 0,
        createdByUserId: context.userId,
      }),
    );
  }

  async updateFolder(
    context: OrganizationActorContext,
    organizationId: string,
    folderId: string,
    input: UpdateWikiFolderInput,
  ): Promise<WikiFolderResponse> {
    await this.assertOrganizationAccess(context, organizationId);
    const current = await this.requireFolder(organizationId, folderId);
    const parentFolderId =
      input.parentFolderId === undefined
        ? current.parentFolderId
        : input.parentFolderId;

    await this.assertFolderMoveAllowed(
      organizationId,
      folderId,
      parentFolderId,
    );

    const updated = await this.wikiRepository.updateFolder({
      organizationId,
      folderId,
      parentFolderId,
      name: input.name ?? current.name,
      position: input.position ?? current.position,
    });
    if (!updated) {
      throw new WikiFolderNotFoundError();
    }
    return toWikiFolderResponse(updated);
  }

  async deleteFolder(
    context: OrganizationActorContext,
    organizationId: string,
    folderId: string,
  ): Promise<void> {
    await this.assertOrganizationAccess(context, organizationId);
    const result = await this.wikiRepository.deleteFolder(
      organizationId,
      folderId,
    );

    if (result === 'not_found') {
      throw new WikiFolderNotFoundError();
    }
    if (result === 'not_empty') {
      throw new WikiFolderNotEmptyError();
    }
  }

  async createDocument(
    context: OrganizationActorContext,
    organizationId: string,
    input: CreateWikiDocumentInput,
  ): Promise<WikiDocumentResponse> {
    await this.assertOrganizationAccess(context, organizationId);
    const folderId = input.folderId ?? null;
    await this.assertFolderExists(organizationId, folderId);

    return toWikiDocumentResponse(
      await this.wikiRepository.createDocument({
        organizationId,
        folderId,
        title: input.title,
        contentMarkdown: input.contentMarkdown ?? '',
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
    const folderId =
      input.folderId === undefined ? current.folderId : input.folderId;
    await this.assertFolderExists(organizationId, folderId);

    const updated = await this.wikiRepository.updateDocument({
      organizationId,
      documentId,
      folderId,
      title: input.title ?? current.title,
      ...(input.contentMarkdown === undefined
        ? {}
        : { contentMarkdown: input.contentMarkdown }),
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
    if (
      !(await this.wikiRepository.deleteDocument(organizationId, documentId))
    ) {
      throw new WikiDocumentNotFoundError();
    }
  }

  private async assertOrganizationAccess(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<void> {
    await this.organizationsService.getDetail(context, organizationId);
  }

  private async requireFolder(organizationId: string, folderId: string) {
    const folder = await this.wikiRepository.findFolderById(
      organizationId,
      folderId,
    );
    if (!folder) {
      throw new WikiFolderNotFoundError();
    }
    return folder;
  }

  private async assertFolderExists(
    organizationId: string,
    folderId: string | null,
  ): Promise<void> {
    if (folderId === null) {
      return;
    }
    await this.requireFolder(organizationId, folderId);
  }

  private async assertFolderMoveAllowed(
    organizationId: string,
    folderId: string,
    targetParentFolderId: string | null,
  ): Promise<void> {
    let currentFolderId = targetParentFolderId;
    const visited = new Set<string>();

    while (currentFolderId !== null) {
      if (currentFolderId === folderId || visited.has(currentFolderId)) {
        throw new WikiInvalidFolderMoveError();
      }
      visited.add(currentFolderId);
      const folder = await this.requireFolder(organizationId, currentFolderId);
      currentFolderId = folder.parentFolderId;
    }
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
