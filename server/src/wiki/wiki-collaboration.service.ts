import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';
import {
  WikiCollaborationAccessDeniedError,
  WikiCollaborationPersistenceError,
  WikiCollaborationProtocolVersionError,
  WikiCollaborationStateCorruptedError,
  WikiCollaborationStateTooLargeError,
  WikiDocumentContentEditAmbiguousError,
  WikiDocumentContentEditNotFoundError,
  WikiDocumentHistoryCorruptedError,
  WikiDocumentNotFoundError,
} from '@/wiki/domain/wiki.error';
import {
  buildWikiCollaborationDocumentName,
  parseWikiCollaborationDocumentName,
} from '@/wiki/domain/wiki-collaboration-document-name';
import {
  WIKI_COLLABORATION_PROTOCOL_VERSION,
  WIKI_COLLABORATION_SCHEMA_VERSION,
} from '@/wiki/domain/wiki-collaboration-version';
import {
  createWikiContentEditPatch,
  locateWikiContentEdit,
  type WikiContentEdit,
} from '@/wiki/domain/wiki-content-edit';
import {
  type WikiCollaborationSessionResponse,
  WikiCollaborationSessionSchema,
} from '@/wiki/dto/wiki-collaboration-session.dto';
import { WikiCollaborationAttributionProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-attribution.provider';
import { WikiCollaborationAuthorizationProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-authorization.provider';
import { WikiCollaborationStateProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-state.provider';
import { WikiCollaborationTokenProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-token.provider';
import {
  type PersistWikiCollaborationSnapshotResult,
  WikiRepository,
} from '@/wiki/infrastructure/persistence/wiki.repository';

export const WIKI_COLLABORATION_MAX_STATE_BYTES = 8 * 1024 * 1024;

const persistenceRetryDelaysMilliseconds = [50, 150] as const;

export type WikiCollaborationConnectionContext = {
  userId: string;
  userName: string;
  organizationId: string;
  documentId: string;
  canWrite: boolean;
  authorizationExpiresAt: Date;
};

export type PreparedWikiContentEdit = {
  documentName: string;
  encodedState: Uint8Array;
};

type WikiCollaborationOrganizationAccess = Pick<
  OrganizationsService,
  'getDetail'
>;

@Injectable()
export class WikiCollaborationService {
  private readonly collaborationPublicUrl: string;

  constructor(
    @Inject(OrganizationsService)
    private readonly organizationsService: WikiCollaborationOrganizationAccess,
    configService: ConfigService<AllConfigType>,
    private readonly repository: WikiRepository,
    private readonly tokenProvider: WikiCollaborationTokenProvider,
    private readonly authorizationProvider: WikiCollaborationAuthorizationProvider,
    private readonly stateProvider: WikiCollaborationStateProvider,
    private readonly attributionProvider: WikiCollaborationAttributionProvider,
  ) {
    this.collaborationPublicUrl = configService.getOrThrow(
      'collaboration.publicUrl',
      { infer: true },
    );
  }

  async assertReady(): Promise<void> {
    await Promise.all([
      this.repository.checkCollaborationReady(),
      this.attributionProvider.checkReady(),
    ]);
  }

  async createSession(
    context: OrganizationActorContext,
    organizationId: string,
    documentId: string,
  ): Promise<WikiCollaborationSessionResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const document = await this.repository.findDocumentById(
      organizationId,
      documentId,
    );
    if (!document) {
      throw new WikiDocumentNotFoundError();
    }

    const issued = await this.tokenProvider.issue({
      userId: context.userId,
      organizationId,
      documentId,
      tokenId: randomUUID(),
    });
    return WikiCollaborationSessionSchema.parse({
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
      webSocketUrl: this.collaborationPublicUrl,
      documentName: buildWikiCollaborationDocumentName({
        organizationId,
        documentId,
      }),
      protocolVersion: WIKI_COLLABORATION_PROTOCOL_VERSION,
    });
  }

  async authenticateConnection(input: {
    documentName: string;
    token: string;
    protocolVersion: number;
  }): Promise<WikiCollaborationConnectionContext> {
    if (input.protocolVersion !== WIKI_COLLABORATION_PROTOCOL_VERSION) {
      throw new WikiCollaborationProtocolVersionError();
    }
    const scope = parseWikiCollaborationDocumentName(input.documentName);
    const token = await this.tokenProvider.verify(input.token);
    if (
      token.organizationId !== scope.organizationId ||
      token.documentId !== scope.documentId
    ) {
      throw new WikiCollaborationAccessDeniedError();
    }

    const authorization = await this.authorizationProvider.authorize(
      token.userId,
      scope.organizationId,
    );
    if (!authorization?.canRead) {
      throw new WikiCollaborationAccessDeniedError();
    }
    const document = await this.repository.findDocumentById(
      scope.organizationId,
      scope.documentId,
    );
    if (!document) {
      throw new WikiDocumentNotFoundError();
    }

    return {
      userId: authorization.userId,
      userName: authorization.userName,
      organizationId: scope.organizationId,
      documentId: scope.documentId,
      canWrite: authorization.canWrite,
      authorizationExpiresAt: token.expiresAt,
    };
  }

  async loadDocument(documentName: string): Promise<Uint8Array> {
    const scope = parseWikiCollaborationDocumentName(documentName);
    const state = await this.repository.loadCollaborationState(
      scope.organizationId,
      scope.documentId,
    );
    if (!state) {
      throw new WikiDocumentNotFoundError();
    }
    if (
      state.collaborationState.byteLength > WIKI_COLLABORATION_MAX_STATE_BYTES
    ) {
      throw new WikiCollaborationStateTooLargeError();
    }
    const decoded = this.stateProvider.decode(state.collaborationState);
    if (decoded.contentMarkdown !== state.contentMarkdown) {
      throw new WikiCollaborationStateCorruptedError();
    }
    return state.collaborationState;
  }

  async recordEditor(
    documentName: string,
    context: WikiCollaborationConnectionContext,
  ): Promise<void> {
    await this.attributionProvider.record(documentName, context.userId);
  }

  /**
   * 저장된 공동편집 상태에서 수정 위치를 찾아 본문 수정을 적용한 상태를 만든다.
   * 아직 저장하지 않으므로 위치를 정하지 못하면 아무것도 바뀌지 않는다.
   */
  async prepareContentEdit(
    organizationId: string,
    documentId: string,
    edit: WikiContentEdit,
  ): Promise<PreparedWikiContentEdit> {
    const documentName = buildWikiCollaborationDocumentName({
      organizationId,
      documentId,
    });
    const currentState = await this.loadDocument(documentName);
    const current = this.stateProvider.decode(currentState);
    const location = locateWikiContentEdit(current.contentMarkdown, edit);
    if (location.kind === 'not_found') {
      throw new WikiDocumentContentEditNotFoundError();
    }
    if (location.kind === 'ambiguous') {
      throw new WikiDocumentContentEditAmbiguousError({
        startLine: edit.startLine,
        startLines: location.startLines,
        repeatedOnStartLine: location.repeatedOnStartLine,
      });
    }

    const edited = this.stateProvider.applyTextPatch(
      currentState,
      createWikiContentEditPatch(location.index, edit),
    );
    return { documentName, encodedState: edited.encodedState };
  }

  /**
   * 준비한 본문 수정을 공동편집자 한 명의 편집으로 기록하고 checkpoint와 함께 저장한다.
   */
  async commitContentEdit(
    prepared: PreparedWikiContentEdit,
    actorUserId: string,
  ): Promise<void> {
    await this.attributionProvider.record(prepared.documentName, actorUserId);
    await this.persistEncodedState({
      documentName: prepared.documentName,
      encodedState: prepared.encodedState,
      fallbackUserId: actorUserId,
      createCheckpoint: true,
    });
  }

  async persistDocument(input: {
    documentName: string;
    encodedState: Uint8Array;
    fallbackContext: WikiCollaborationConnectionContext;
    createCheckpoint: boolean;
  }): Promise<void> {
    await this.persistEncodedState({
      documentName: input.documentName,
      encodedState: input.encodedState,
      fallbackUserId: input.fallbackContext.userId,
      createCheckpoint: input.createCheckpoint,
    });
  }

  private async persistEncodedState(input: {
    documentName: string;
    encodedState: Uint8Array;
    fallbackUserId: string;
    createCheckpoint: boolean;
  }): Promise<void> {
    if (input.encodedState.byteLength > WIKI_COLLABORATION_MAX_STATE_BYTES) {
      throw new WikiCollaborationStateTooLargeError();
    }
    const scope = parseWikiCollaborationDocumentName(input.documentName);
    const snapshot = this.stateProvider.decode(input.encodedState);
    const attribution = await this.attributionProvider.snapshot(
      input.documentName,
    );
    const lastEditorUserId =
      attribution.lastEditorUserId ?? input.fallbackUserId;
    const collaboratorUserIds =
      attribution.collaboratorUserIds.length > 0
        ? attribution.collaboratorUserIds
        : [lastEditorUserId];

    const result = await this.persistCollaborationSnapshotWithRetry(
      scope.organizationId,
      scope.documentId,
      snapshot,
      lastEditorUserId,
      collaboratorUserIds,
      WIKI_COLLABORATION_SCHEMA_VERSION,
      input.createCheckpoint,
    );
    if (result.checkpointCreated && attribution.maxSequence !== null) {
      await this.attributionProvider.clearThrough(
        input.documentName,
        attribution.maxSequence,
      );
    }
  }

  private async persistCollaborationSnapshotWithRetry(
    ...input: Parameters<WikiRepository['persistCollaborationSnapshot']>
  ): Promise<PersistWikiCollaborationSnapshotResult> {
    let lastError: unknown;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.repository.persistCollaborationSnapshot(...input);
      } catch (error) {
        if (
          error instanceof WikiCollaborationStateCorruptedError ||
          error instanceof WikiDocumentHistoryCorruptedError ||
          error instanceof WikiDocumentNotFoundError ||
          error instanceof WikiCollaborationStateTooLargeError
        ) {
          throw error;
        }
        lastError = error;
        const delayMilliseconds = persistenceRetryDelaysMilliseconds[attempt];
        if (delayMilliseconds === undefined) {
          break;
        }
        await delay(delayMilliseconds);
      }
    }
    throw new WikiCollaborationPersistenceError({ cause: lastError });
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
