import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import type { OrganizationsService } from '@/organizations/organizations.service';
import {
  WikiCollaborationAccessDeniedError,
  WikiCollaborationProtocolVersionError,
  WikiCollaborationStateCorruptedError,
  WikiCollaborationStateTooLargeError,
  WikiDocumentHistoryCorruptedError,
} from '@/wiki/domain/wiki.error';
import {
  WIKI_COLLABORATION_PROTOCOL_VERSION,
  WIKI_COLLABORATION_SCHEMA_VERSION,
} from '@/wiki/domain/wiki-collaboration-version';
import type { WikiDocument } from '@/wiki/domain/wiki-document';
import type { CollaborationConfig } from '@/wiki/infrastructure/collaboration/config/collaboration-config.type';
import { WikiCollaborationAttributionProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-attribution.provider';
import { WikiCollaborationAuthorizationProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-authorization.provider';
import { WikiCollaborationTokenProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-token.provider';
import { YjsCollaborationStateAdapter } from '@/wiki/infrastructure/collaboration/yjs/yjs-collaboration-state.adapter';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';
import {
  WIKI_COLLABORATION_MAX_STATE_BYTES,
  WikiCollaborationService,
} from '@/wiki/wiki-collaboration.service';

import { jest } from '@jest/globals';

class FakeWikiRepository extends WikiRepository {
  checkCollaborationReady =
    jest.fn<WikiRepository['checkCollaborationReady']>();
  getTreeForOrganization = jest.fn<WikiRepository['getTreeForOrganization']>();
  findDocumentById = jest.fn<WikiRepository['findDocumentById']>();
  loadCollaborationState = jest.fn<WikiRepository['loadCollaborationState']>();
  createDocument = jest.fn<WikiRepository['createDocument']>();
  updateDocumentMetadata = jest.fn<WikiRepository['updateDocumentMetadata']>();
  deleteDocument = jest.fn<WikiRepository['deleteDocument']>();
  persistCollaborationSnapshot =
    jest.fn<WikiRepository['persistCollaborationSnapshot']>();
  listDocumentRevisions = jest.fn<WikiRepository['listDocumentRevisions']>();
  findDocumentRevision = jest.fn<WikiRepository['findDocumentRevision']>();
  search = jest.fn<WikiRepository['search']>();
}

class FakeWikiCollaborationTokenProvider extends WikiCollaborationTokenProvider {
  issue = jest.fn<WikiCollaborationTokenProvider['issue']>();
  verify = jest.fn<WikiCollaborationTokenProvider['verify']>();
}

class FakeWikiCollaborationAuthorizationProvider extends WikiCollaborationAuthorizationProvider {
  authorize = jest.fn<WikiCollaborationAuthorizationProvider['authorize']>();
}

class FakeWikiCollaborationAttributionProvider extends WikiCollaborationAttributionProvider {
  checkReady = jest.fn<WikiCollaborationAttributionProvider['checkReady']>();
  record = jest.fn<WikiCollaborationAttributionProvider['record']>();
  snapshot = jest.fn<WikiCollaborationAttributionProvider['snapshot']>();
  clearThrough =
    jest.fn<WikiCollaborationAttributionProvider['clearThrough']>();
  close = jest.fn<WikiCollaborationAttributionProvider['close']>();
}

const organizationId = 'organization-a';
const documentId = '11111111-1111-4111-8111-111111111111';
const userId = 'user-a';
const documentName = `wiki.${organizationId}.${documentId}`;
const collaborationConfig: CollaborationConfig = {
  port: 3002,
  publicUrl: 'ws://localhost:3002',
  jwtSecret: 'test-collaboration-secret-that-is-at-least-32-characters-long',
  redisUrl: 'redis://localhost:6382',
};
const configService = new ConfigService<AllConfigType>({
  collaboration: collaborationConfig,
});

function document(): WikiDocument {
  return {
    id: documentId,
    collectionId: '22222222-2222-4222-8222-222222222222',
    organizationId,
    parentDocumentId: null,
    title: '문서',
    position: 0,
    contentMarkdown: '# 문서',
    revision: 1,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: new Date('2026-10-05T00:00:00.000Z'),
    updatedAt: new Date('2026-10-05T00:00:00.000Z'),
  };
}

describe('위키 공동편집 서비스', () => {
  let organizationsService: Pick<OrganizationsService, 'getDetail'>;
  let repository: FakeWikiRepository;
  let tokenProvider: FakeWikiCollaborationTokenProvider;
  let authorizationProvider: FakeWikiCollaborationAuthorizationProvider;
  let attributionProvider: FakeWikiCollaborationAttributionProvider;
  let stateProvider: YjsCollaborationStateAdapter;
  let service: WikiCollaborationService;

  beforeEach(() => {
    organizationsService = {
      getDetail: jest
        .fn<OrganizationsService['getDetail']>()
        .mockResolvedValue({
          organization: {
            id: organizationId,
            name: '조직 A',
            slug: organizationId,
            logo: null,
            createdAt: '2026-10-05T00:00:00.000Z',
          },
          role: 'member',
        }),
    };
    repository = new FakeWikiRepository();
    tokenProvider = new FakeWikiCollaborationTokenProvider();
    authorizationProvider = new FakeWikiCollaborationAuthorizationProvider();
    attributionProvider = new FakeWikiCollaborationAttributionProvider();
    stateProvider = new YjsCollaborationStateAdapter();
    service = new WikiCollaborationService(
      organizationsService,
      configService,
      repository,
      tokenProvider,
      authorizationProvider,
      stateProvider,
      attributionProvider,
    );
  });

  it('공동편집 시작 전 DB와 Redis readiness를 모두 확인한다', async () => {
    repository.checkCollaborationReady.mockResolvedValue();
    attributionProvider.checkReady.mockResolvedValue();

    await service.assertReady();

    expect(repository.checkCollaborationReady).toHaveBeenCalledTimes(1);
    expect(attributionProvider.checkReady).toHaveBeenCalledTimes(1);
  });

  it('readiness dependency가 준비되지 않으면 공동편집 시작을 거부한다', async () => {
    repository.checkCollaborationReady.mockRejectedValue(
      new Error('database unavailable'),
    );
    attributionProvider.checkReady.mockResolvedValue();

    await expect(service.assertReady()).rejects.toThrow('database unavailable');
  });

  it('collaboration session은 문서 scope와 protocol version이 들어간 단기 token을 반환한다', async () => {
    repository.findDocumentById.mockResolvedValue(document());
    tokenProvider.issue.mockResolvedValue({
      token: 'signed-token',
      expiresAt: new Date('2026-10-05T00:05:00.000Z'),
    });

    const result = await service.createSession(
      {
        userId,
        activeOrganizationIdCandidate: organizationId,
      },
      organizationId,
      documentId,
    );

    expect(tokenProvider.issue).toHaveBeenCalledWith({
      userId,
      organizationId,
      documentId,
      tokenId: expect.any(String),
    });
    expect(result).toMatchObject({
      token: 'signed-token',
      documentName,
      protocolVersion: WIKI_COLLABORATION_PROTOCOL_VERSION,
    });
  });

  it('지원하지 않는 protocol version은 token 검증 전에 거부한다', async () => {
    await expect(
      service.authenticateConnection({
        documentName,
        token: 'token',
        protocolVersion: WIKI_COLLABORATION_PROTOCOL_VERSION + 1,
      }),
    ).rejects.toBeInstanceOf(WikiCollaborationProtocolVersionError);
    expect(tokenProvider.verify).not.toHaveBeenCalled();
  });

  it('token scope가 document name과 다르면 현재 권한 조회 전에 거부한다', async () => {
    tokenProvider.verify.mockResolvedValue({
      userId,
      organizationId: 'organization-b',
      documentId,
      tokenId: '33333333-3333-4333-8333-333333333333',
      expiresAt: new Date('2026-10-05T00:05:00.000Z'),
    });

    await expect(
      service.authenticateConnection({
        documentName,
        token: 'token',
        protocolVersion: WIKI_COLLABORATION_PROTOCOL_VERSION,
      }),
    ).rejects.toBeInstanceOf(WikiCollaborationAccessDeniedError);
    expect(authorizationProvider.authorize).not.toHaveBeenCalled();
  });

  it('token이 유효해도 현재 organization membership이 사라졌으면 연결을 거부한다', async () => {
    tokenProvider.verify.mockResolvedValue({
      userId,
      organizationId,
      documentId,
      tokenId: '33333333-3333-4333-8333-333333333333',
      expiresAt: new Date('2026-10-05T00:05:00.000Z'),
    });
    authorizationProvider.authorize.mockResolvedValue(null);

    await expect(
      service.authenticateConnection({
        documentName,
        token: 'token',
        protocolVersion: WIKI_COLLABORATION_PROTOCOL_VERSION,
      }),
    ).rejects.toBeInstanceOf(WikiCollaborationAccessDeniedError);
  });

  it('읽기 권한만 있으면 연결 context를 read-only로 만들 수 있게 canWrite=false를 반환한다', async () => {
    tokenProvider.verify.mockResolvedValue({
      userId,
      organizationId,
      documentId,
      tokenId: '33333333-3333-4333-8333-333333333333',
      expiresAt: new Date('2026-10-05T00:05:00.000Z'),
    });
    authorizationProvider.authorize.mockResolvedValue({
      userId,
      userName: '사용자',
      canRead: true,
      canWrite: false,
    });
    repository.findDocumentById.mockResolvedValue(document());

    await expect(
      service.authenticateConnection({
        documentName,
        token: 'token',
        protocolVersion: WIKI_COLLABORATION_PROTOCOL_VERSION,
      }),
    ).resolves.toMatchObject({
      canWrite: false,
      organizationId,
      documentId,
      authorizationExpiresAt: new Date('2026-10-05T00:05:00.000Z'),
    });
  });

  it('persisted Yjs state와 Markdown projection이 다르면 fallback 없이 오류를 반환한다', async () => {
    const state = stateProvider.create('# Yjs');
    repository.loadCollaborationState.mockResolvedValue({
      id: documentId,
      organizationId,
      contentMarkdown: '# 다른 projection',
      collaborationState: new Uint8Array(state.encodedState),
      collaborationSchemaVersion: 1,
      collaborationPersistedAt: new Date(),
    });

    await expect(service.loadDocument(documentName)).rejects.toBeInstanceOf(
      WikiCollaborationStateCorruptedError,
    );
  });

  it('비정상적으로 큰 Yjs state는 영속화 전에 거부한다', async () => {
    await expect(
      service.persistDocument({
        documentName,
        encodedState: new Uint8Array(WIKI_COLLABORATION_MAX_STATE_BYTES + 1),
        fallbackContext: {
          userId,
          userName: '사용자',
          organizationId,
          documentId,
          canWrite: true,
          authorizationExpiresAt: new Date('2026-10-05T00:05:00.000Z'),
        },
        createCheckpoint: false,
      }),
    ).rejects.toBeInstanceOf(WikiCollaborationStateTooLargeError);
    expect(repository.persistCollaborationSnapshot).not.toHaveBeenCalled();
  });

  it('일시적인 저장 실패는 merge-safe repository 호출을 제한적으로 재시도한다', async () => {
    const state = stateProvider.create('# 재시도');
    attributionProvider.snapshot.mockResolvedValue({
      lastEditorUserId: userId,
      collaboratorUserIds: [userId],
      maxSequence: null,
    });
    repository.persistCollaborationSnapshot
      .mockRejectedValueOnce(new Error('temporary database failure'))
      .mockResolvedValue({
        changed: true,
        checkpointCreated: false,
        revision: 1,
        contentMarkdown: '# 재시도',
        encodedState: state.encodedState,
      });

    await service.persistDocument({
      documentName,
      encodedState: state.encodedState,
      fallbackContext: {
        userId,
        userName: '사용자',
        organizationId,
        documentId,
        canWrite: true,
        authorizationExpiresAt: new Date('2026-10-05T00:05:00.000Z'),
      },
      createCheckpoint: false,
    });

    expect(repository.persistCollaborationSnapshot).toHaveBeenCalledTimes(2);
    expect(repository.persistCollaborationSnapshot).toHaveBeenLastCalledWith(
      organizationId,
      documentId,
      expect.objectContaining({ contentMarkdown: '# 재시도' }),
      userId,
      [userId],
      WIKI_COLLABORATION_SCHEMA_VERSION,
      false,
    );
  });

  it('history 무결성 오류는 재시도하지 않고 즉시 전달한다', async () => {
    const state = stateProvider.create('# history 오류');
    attributionProvider.snapshot.mockResolvedValue({
      lastEditorUserId: userId,
      collaboratorUserIds: [userId],
      maxSequence: null,
    });
    repository.persistCollaborationSnapshot.mockRejectedValue(
      new WikiDocumentHistoryCorruptedError(),
    );

    await expect(
      service.persistDocument({
        documentName,
        encodedState: state.encodedState,
        fallbackContext: {
          userId,
          userName: '사용자',
          organizationId,
          documentId,
          canWrite: true,
          authorizationExpiresAt: new Date('2026-10-05T00:05:00.000Z'),
        },
        createCheckpoint: true,
      }),
    ).rejects.toBeInstanceOf(WikiDocumentHistoryCorruptedError);
    expect(repository.persistCollaborationSnapshot).toHaveBeenCalledTimes(1);
  });

  it('checkpoint 성공 시 snapshot 이전 attribution만 clear한다', async () => {
    const state = stateProvider.create('# checkpoint');
    attributionProvider.snapshot.mockResolvedValue({
      lastEditorUserId: userId,
      collaboratorUserIds: [userId, 'user-b'],
      maxSequence: 42,
    });
    repository.persistCollaborationSnapshot.mockResolvedValue({
      changed: true,
      checkpointCreated: true,
      revision: 2,
      contentMarkdown: '# checkpoint',
      encodedState: state.encodedState,
    });

    await service.persistDocument({
      documentName,
      encodedState: state.encodedState,
      fallbackContext: {
        userId,
        userName: '사용자',
        organizationId,
        documentId,
        canWrite: true,
        authorizationExpiresAt: new Date('2026-10-05T00:05:00.000Z'),
      },
      createCheckpoint: true,
    });

    expect(attributionProvider.clearThrough).toHaveBeenCalledWith(
      documentName,
      42,
    );
  });
});
