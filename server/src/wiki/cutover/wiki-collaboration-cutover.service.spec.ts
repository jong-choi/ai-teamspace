import {
  WikiCollaborationCutoverRepository,
  type WikiCutoverDocumentInput,
  type WikiCutoverFinalSnapshot,
  type WikiCutoverSnapshot,
} from '@/wiki/cutover/wiki-collaboration-cutover.repository';
import { WikiCollaborationCutoverService } from '@/wiki/cutover/wiki-collaboration-cutover.service';
import { WIKI_COLLABORATION_SCHEMA_VERSION } from '@/wiki/domain/wiki-collaboration-version';
import { YjsCollaborationStateAdapter } from '@/wiki/infrastructure/collaboration/yjs/yjs-collaboration-state.adapter';

import { jest } from '@jest/globals';

const organizationId = 'organization-a';
const collectionId = '11111111-1111-4111-8111-111111111111';
const folderId = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';
const creatorUserId = 'creator-user';
const editorUserId = 'editor-user';
const createdAt = new Date('2026-10-01T00:00:00.000Z');
const updatedAt = new Date('2026-10-02T00:00:00.000Z');

class FakeCutoverRepository extends WikiCollaborationCutoverRepository {
  snapshot: WikiCutoverSnapshot = { entries: [], documents: [], revisions: [] };
  finalSnapshot: WikiCutoverFinalSnapshot = {
    collectionOrganizationIds: [],
    documents: [],
    revisions: [],
    revisionCollaborators: [],
  };
  loadSnapshot = jest.fn(async () => this.snapshot);
  convertOrganization = jest.fn(
    async (
      convertedOrganizationId: string,
      documents: readonly WikiCutoverDocumentInput[],
    ) => {
      const formerFolderRevisions = documents
        .filter((document) => document.entry.kind === 'folder')
        .map((document) => ({
          documentId: document.entry.id,
          organizationId: convertedOrganizationId,
          revision: document.revision,
          editorUserId: document.updatedByUserId,
          contentMarkdown: document.contentMarkdown,
        }));
      const revisions = [...this.snapshot.revisions, ...formerFolderRevisions];
      this.finalSnapshot = {
        collectionOrganizationIds: [convertedOrganizationId],
        documents: documents.map((document) => ({
          id: document.entry.id,
          collectionId,
          organizationId: convertedOrganizationId,
          parentDocumentId: document.entry.parentFolderId,
          title: document.entry.name,
          position: document.entry.position,
          contentMarkdown: document.contentMarkdown,
          collaborationState: document.collaborationState,
          collaborationSchemaVersion: document.collaborationSchemaVersion,
          revision: document.revision,
          createdByUserId: document.entry.createdByUserId,
          updatedByUserId: document.updatedByUserId,
          createdAt: document.entry.createdAt,
          updatedAt: document.entry.updatedAt,
        })),
        revisions,
        revisionCollaborators: revisions.map((revision) => ({
          documentId: revision.documentId,
          revision: revision.revision,
          userId: revision.editorUserId,
          ordinal: 0,
        })),
      };
    },
  );
  loadFinalSnapshot = jest.fn(async () => this.finalSnapshot);
}

function legacyEntries(): WikiCutoverSnapshot['entries'] {
  return [
    {
      id: folderId,
      organizationId,
      parentFolderId: null,
      kind: 'folder',
      name: '설계',
      position: 0,
      createdByUserId: creatorUserId,
      createdAt,
      updatedAt,
    },
    {
      id: documentId,
      organizationId,
      parentFolderId: folderId,
      kind: 'document',
      name: 'API',
      position: 0,
      createdByUserId: creatorUserId,
      createdAt,
      updatedAt,
    },
  ];
}

describe('위키 공동편집 cutover 서비스', () => {
  let repository: FakeCutoverRepository;
  let stateProvider: YjsCollaborationStateAdapter;
  let service: WikiCollaborationCutoverService;

  beforeEach(() => {
    repository = new FakeCutoverRepository();
    stateProvider = new YjsCollaborationStateAdapter();
    service = new WikiCollaborationCutoverService(repository, stateProvider);
  });

  it('기존 문서와 former folder를 동일 ID의 Yjs 문서로 변환한다', async () => {
    repository.snapshot = {
      entries: legacyEntries(),
      documents: [
        {
          id: documentId,
          collectionId: null,
          organizationId: null,
          parentDocumentId: null,
          title: null,
          position: null,
          contentMarkdown: '# API',
          collaborationState: null,
          collaborationSchemaVersion: null,
          revision: 7,
          createdByUserId: null,
          updatedByUserId: editorUserId,
          createdAt: null,
          updatedAt: null,
        },
      ],
      revisions: [
        {
          documentId,
          organizationId,
          revision: 7,
          editorUserId,
          contentMarkdown: '# API',
        },
      ],
    };

    await service.run();

    const conversion = repository.convertOrganization.mock.calls[0];
    expect(conversion?.[0]).toBe(organizationId);
    const converted = conversion?.[1];
    expect(converted).toHaveLength(2);
    const formerFolder = converted?.find(
      (document) => document.entry.id === folderId,
    );
    const existingDocument = converted?.find(
      (document) => document.entry.id === documentId,
    );
    expect(formerFolder).toMatchObject({
      contentMarkdown: '',
      revision: 1,
      updatedByUserId: creatorUserId,
      collaborationSchemaVersion: WIKI_COLLABORATION_SCHEMA_VERSION,
    });
    expect(existingDocument).toMatchObject({
      contentMarkdown: '# API',
      revision: 7,
      updatedByUserId: editorUserId,
      collaborationSchemaVersion: WIKI_COLLABORATION_SCHEMA_VERSION,
    });
    if (!formerFolder || !existingDocument) {
      throw new Error('cutover 변환 문서가 없습니다.');
    }
    expect(
      stateProvider.decode(formerFolder.collaborationState).contentMarkdown,
    ).toBe('');
    expect(
      stateProvider.decode(existingDocument.collaborationState).contentMarkdown,
    ).toBe('# API');
  });

  it('이미 초기화된 Yjs state와 projection이 다르면 cutover를 중단한다', async () => {
    repository.snapshot = {
      entries: [legacyEntries()[1]!],
      documents: [
        {
          id: documentId,
          collectionId,
          organizationId,
          parentDocumentId: folderId,
          title: 'API',
          position: 0,
          contentMarkdown: '# DB projection',
          collaborationState: stateProvider.create('# 다른 Yjs').encodedState,
          collaborationSchemaVersion: WIKI_COLLABORATION_SCHEMA_VERSION,
          revision: 7,
          createdByUserId: creatorUserId,
          updatedByUserId: editorUserId,
          createdAt,
          updatedAt,
        },
      ],
      revisions: [],
    };

    await expect(service.run()).rejects.toThrow(
      'legacy projection과 Yjs 상태가 다릅니다',
    );
    expect(repository.convertOrganization).not.toHaveBeenCalled();
  });

  it('최종 snapshot에 hierarchy cycle이 있으면 전수 검증을 실패시킨다', async () => {
    const state = stateProvider.create('');
    repository.snapshot = {
      entries: legacyEntries().map((entry) =>
        entry.id === folderId
          ? { ...entry, parentFolderId: documentId }
          : entry,
      ),
      documents: [
        {
          id: documentId,
          collectionId: null,
          organizationId: null,
          parentDocumentId: null,
          title: null,
          position: null,
          contentMarkdown: '',
          collaborationState: null,
          collaborationSchemaVersion: null,
          revision: 1,
          createdByUserId: null,
          updatedByUserId: editorUserId,
          createdAt: null,
          updatedAt: null,
        },
      ],
      revisions: [
        {
          documentId,
          organizationId,
          revision: 1,
          editorUserId,
          contentMarkdown: '',
        },
      ],
    };
    repository.convertOrganization.mockImplementation(async () => {
      repository.finalSnapshot = {
        collectionOrganizationIds: [organizationId],
        documents: [
          {
            id: folderId,
            collectionId,
            organizationId,
            parentDocumentId: documentId,
            title: '설계',
            position: 0,
            contentMarkdown: '',
            collaborationState: state.encodedState,
            collaborationSchemaVersion: WIKI_COLLABORATION_SCHEMA_VERSION,
            revision: 1,
            createdByUserId: creatorUserId,
            updatedByUserId: creatorUserId,
            createdAt,
            updatedAt,
          },
          {
            id: documentId,
            collectionId,
            organizationId,
            parentDocumentId: folderId,
            title: 'API',
            position: 0,
            contentMarkdown: '',
            collaborationState: state.encodedState,
            collaborationSchemaVersion: WIKI_COLLABORATION_SCHEMA_VERSION,
            revision: 1,
            createdByUserId: creatorUserId,
            updatedByUserId: editorUserId,
            createdAt,
            updatedAt,
          },
        ],
        revisions: [
          {
            documentId: folderId,
            organizationId,
            revision: 1,
            editorUserId: creatorUserId,
            contentMarkdown: '',
          },
          {
            documentId,
            organizationId,
            revision: 1,
            editorUserId,
            contentMarkdown: '',
          },
        ],
        revisionCollaborators: [
          {
            documentId: folderId,
            revision: 1,
            userId: creatorUserId,
            ordinal: 0,
          },
          {
            documentId,
            revision: 1,
            userId: editorUserId,
            ordinal: 0,
          },
        ],
      };
    });

    await expect(service.run()).rejects.toThrow(
      '위키 cutover hierarchy cycle이 있습니다',
    );
  });
});
