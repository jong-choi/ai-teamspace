import { Injectable, Logger } from '@nestjs/common';

import {
  WikiCollaborationCutoverRepository,
  type WikiCutoverSnapshot,
} from '@/wiki/cutover/wiki-collaboration-cutover.repository';
import { WIKI_COLLABORATION_SCHEMA_VERSION } from '@/wiki/domain/wiki-collaboration-version';
import { WikiCollaborationStateProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-state.provider';

@Injectable()
export class WikiCollaborationCutoverService {
  private readonly logger = new Logger(WikiCollaborationCutoverService.name);

  constructor(
    private readonly repository: WikiCollaborationCutoverRepository,
    private readonly stateProvider: WikiCollaborationStateProvider,
  ) {}

  async run(): Promise<void> {
    const snapshot = await this.repository.loadSnapshot();
    const legacyDocuments = new Map(
      snapshot.documents.map((document) => [document.id, document]),
    );
    const entriesByOrganization = new Map<
      string,
      (typeof snapshot.entries)[number][]
    >();

    for (const entry of snapshot.entries) {
      const entries = entriesByOrganization.get(entry.organizationId) ?? [];
      entries.push(entry);
      entriesByOrganization.set(entry.organizationId, entries);
    }

    for (const [organizationId, entries] of entriesByOrganization) {
      const documents = entries.map((entry) => {
        const legacyDocument = legacyDocuments.get(entry.id);
        if (entry.kind === 'document' && !legacyDocument) {
          throw new Error(`legacy 위키 문서 행이 없습니다: ${entry.id}`);
        }
        if (
          entry.kind === 'folder' &&
          legacyDocument &&
          legacyDocument.collaborationState === null
        ) {
          throw new Error(
            `legacy 위키 폴더에 예상하지 못한 문서 행이 존재합니다: ${entry.id}`,
          );
        }
        if (
          entry.kind === 'folder' &&
          legacyDocument?.contentMarkdown !== undefined &&
          legacyDocument.contentMarkdown !== ''
        ) {
          throw new Error(
            `변환된 위키 폴더 문서의 본문이 비어 있지 않습니다: ${entry.id}`,
          );
        }

        const contentMarkdown = legacyDocument?.contentMarkdown ?? '';
        const collaboration = legacyDocument?.collaborationState
          ? this.stateProvider.decode(legacyDocument.collaborationState)
          : this.stateProvider.create(contentMarkdown);
        if (collaboration.contentMarkdown !== contentMarkdown) {
          throw new Error(
            `legacy projection과 Yjs 상태가 다릅니다: ${entry.id}`,
          );
        }

        return {
          entry,
          contentMarkdown,
          revision: legacyDocument?.revision ?? 1,
          updatedByUserId:
            legacyDocument?.updatedByUserId ?? entry.createdByUserId,
          collaborationState: collaboration.encodedState,
          collaborationSchemaVersion: WIKI_COLLABORATION_SCHEMA_VERSION,
        };
      });
      await this.repository.convertOrganization(organizationId, documents);
      this.logger.log(
        `위키 공동편집 cutover 변환 완료: organization=${organizationId}, documents=${documents.length}`,
      );
    }

    await this.verify(snapshot, entriesByOrganization);
  }

  private async verify(
    snapshot: WikiCutoverSnapshot,
    entriesByOrganization: ReadonlyMap<string, readonly { id: string }[]>,
  ): Promise<void> {
    const finalSnapshot = await this.repository.loadFinalSnapshot();
    if (finalSnapshot.documents.length !== snapshot.entries.length) {
      throw new Error(
        `위키 cutover 문서 수가 다릅니다: legacy=${snapshot.entries.length}, final=${finalSnapshot.documents.length}`,
      );
    }

    const collectionOrganizations = new Set(
      finalSnapshot.collectionOrganizationIds,
    );
    if (collectionOrganizations.size !== entriesByOrganization.size) {
      throw new Error(
        '위키 cutover collection 수가 organization 수와 다릅니다.',
      );
    }
    for (const organizationId of entriesByOrganization.keys()) {
      if (!collectionOrganizations.has(organizationId)) {
        throw new Error(
          `위키 cutover collection이 없습니다: ${organizationId}`,
        );
      }
    }

    const documentsById = new Map(
      finalSnapshot.documents.map((document) => [document.id, document]),
    );
    const legacyEntriesById = new Map(
      snapshot.entries.map((entry) => [entry.id, entry]),
    );
    const legacyDocumentsById = new Map(
      snapshot.documents.map((document) => [document.id, document]),
    );
    const siblingTitles = new Set<string>();
    for (const document of finalSnapshot.documents) {
      if (
        document.collectionId === null ||
        document.organizationId === null ||
        document.title === null ||
        document.position === null ||
        document.collaborationState === null ||
        document.collaborationSchemaVersion === null ||
        document.createdByUserId === null ||
        document.createdAt === null ||
        document.updatedAt === null
      ) {
        throw new Error(
          `위키 cutover 필수 필드가 비어 있습니다: ${document.id}`,
        );
      }
      if (
        document.collaborationSchemaVersion !==
        WIKI_COLLABORATION_SCHEMA_VERSION
      ) {
        throw new Error(
          `위키 cutover schema version이 다릅니다: ${document.id}`,
        );
      }
      const collaboration = this.stateProvider.decode(
        document.collaborationState,
      );
      if (collaboration.contentMarkdown !== document.contentMarkdown) {
        throw new Error(
          `위키 cutover projection invariant가 깨졌습니다: ${document.id}`,
        );
      }

      const legacyEntry = legacyEntriesById.get(document.id);
      if (!legacyEntry) {
        throw new Error(`위키 cutover 원본 entry가 없습니다: ${document.id}`);
      }
      if (
        document.organizationId !== legacyEntry.organizationId ||
        document.parentDocumentId !== legacyEntry.parentFolderId ||
        document.title !== legacyEntry.name ||
        document.position !== legacyEntry.position ||
        document.createdByUserId !== legacyEntry.createdByUserId ||
        document.createdAt.getTime() !== legacyEntry.createdAt.getTime() ||
        document.updatedAt.getTime() !== legacyEntry.updatedAt.getTime()
      ) {
        throw new Error(
          `위키 cutover hierarchy metadata가 원본과 다릅니다: ${document.id}`,
        );
      }
      const legacyDocument = legacyDocumentsById.get(document.id);
      if (legacyEntry.kind === 'folder') {
        if (
          document.contentMarkdown !== '' ||
          document.revision !== 1 ||
          document.updatedByUserId !== legacyEntry.createdByUserId
        ) {
          throw new Error(
            `former folder 변환 결과가 올바르지 않습니다: ${document.id}`,
          );
        }
      } else if (
        !legacyDocument ||
        document.contentMarkdown !== legacyDocument.contentMarkdown ||
        document.revision !== legacyDocument.revision ||
        document.updatedByUserId !== legacyDocument.updatedByUserId
      ) {
        throw new Error(
          `기존 위키 문서의 content/revision/actor가 보존되지 않았습니다: ${document.id}`,
        );
      }

      if (document.parentDocumentId !== null) {
        const parent = documentsById.get(document.parentDocumentId);
        if (
          !parent ||
          parent.collectionId !== document.collectionId ||
          parent.organizationId !== document.organizationId
        ) {
          throw new Error(
            `위키 cutover parent scope가 올바르지 않습니다: ${document.id}`,
          );
        }
      }

      const siblingKey = `${document.collectionId}\u0000${document.parentDocumentId ?? ''}\u0000${document.title}`;
      if (siblingTitles.has(siblingKey)) {
        throw new Error(
          `위키 cutover sibling title 중복이 있습니다: ${document.id}`,
        );
      }
      siblingTitles.add(siblingKey);
      assertNoCycle(document.id, documentsById);
    }

    const folderCount = snapshot.entries.filter(
      (entry) => entry.kind === 'folder',
    ).length;
    const expectedRevisionCount = snapshot.revisions.length + folderCount;
    if (finalSnapshot.revisions.length !== expectedRevisionCount) {
      throw new Error(
        `위키 cutover history 수가 다릅니다: expected=${expectedRevisionCount}, final=${finalSnapshot.revisions.length}`,
      );
    }

    const revisionsByKey = new Map<
      string,
      (typeof finalSnapshot.revisions)[number]
    >();
    for (const revision of finalSnapshot.revisions) {
      const document = documentsById.get(revision.documentId);
      if (!document || document.organizationId !== revision.organizationId) {
        throw new Error(
          `위키 cutover history document scope가 올바르지 않습니다: ${revision.documentId}/${revision.revision}`,
        );
      }
      const key = revisionKey(revision.documentId, revision.revision);
      if (revisionsByKey.has(key)) {
        throw new Error(`위키 cutover history 중복이 있습니다: ${key}`);
      }
      revisionsByKey.set(key, revision);
    }

    for (const legacyRevision of snapshot.revisions) {
      const finalRevision = revisionsByKey.get(
        revisionKey(legacyRevision.documentId, legacyRevision.revision),
      );
      if (
        !finalRevision ||
        finalRevision.organizationId !== legacyRevision.organizationId ||
        finalRevision.editorUserId !== legacyRevision.editorUserId ||
        finalRevision.contentMarkdown !== legacyRevision.contentMarkdown
      ) {
        throw new Error(
          `기존 위키 history가 보존되지 않았습니다: ${legacyRevision.documentId}/${legacyRevision.revision}`,
        );
      }
    }

    const collaboratorsByRevision = new Map<
      string,
      Array<{ userId: string; ordinal: number }>
    >();
    for (const collaborator of finalSnapshot.revisionCollaborators) {
      const key = revisionKey(collaborator.documentId, collaborator.revision);
      if (!revisionsByKey.has(key)) {
        throw new Error(
          `위키 cutover history collaborator가 orphan입니다: ${key}`,
        );
      }
      const collaborators = collaboratorsByRevision.get(key) ?? [];
      if (
        collaborators.some(({ ordinal }) => ordinal === collaborator.ordinal)
      ) {
        throw new Error(
          `위키 cutover history collaborator ordinal이 중복입니다: ${key}`,
        );
      }
      collaborators.push({
        userId: collaborator.userId,
        ordinal: collaborator.ordinal,
      });
      collaboratorsByRevision.set(key, collaborators);
    }

    for (const revision of finalSnapshot.revisions) {
      const key = revisionKey(revision.documentId, revision.revision);
      const collaborators = (collaboratorsByRevision.get(key) ?? []).sort(
        (left, right) => left.ordinal - right.ordinal,
      );
      if (
        collaborators.length === 0 ||
        collaborators.some(
          (collaborator, index) => collaborator.ordinal !== index,
        ) ||
        !collaborators.some(
          (collaborator) => collaborator.userId === revision.editorUserId,
        )
      ) {
        throw new Error(
          `위키 cutover history collaborator 무결성이 깨졌습니다: ${key}`,
        );
      }
    }

    for (const document of finalSnapshot.documents) {
      const currentRevision = revisionsByKey.get(
        revisionKey(document.id, document.revision),
      );
      if (
        !currentRevision ||
        currentRevision.contentMarkdown !== document.contentMarkdown ||
        currentRevision.editorUserId !== document.updatedByUserId
      ) {
        throw new Error(
          `위키 cutover 현재 revision과 history가 다릅니다: ${document.id}/${document.revision}`,
        );
      }
    }

    this.logger.log(
      `위키 공동편집 cutover 검증 완료: organizations=${entriesByOrganization.size}, documents=${finalSnapshot.documents.length}, revisions=${finalSnapshot.revisions.length}`,
    );
  }
}

function revisionKey(documentId: string, revision: number): string {
  return `${documentId}\u0000${revision}`;
}

function assertNoCycle(
  documentId: string,
  documentsById: ReadonlyMap<
    string,
    { id: string; parentDocumentId: string | null }
  >,
): void {
  const visited = new Set<string>();
  let currentId: string | null = documentId;
  while (currentId !== null) {
    if (visited.has(currentId)) {
      throw new Error(`위키 cutover hierarchy cycle이 있습니다: ${documentId}`);
    }
    visited.add(currentId);
    currentId = documentsById.get(currentId)?.parentDocumentId ?? null;
  }
}
