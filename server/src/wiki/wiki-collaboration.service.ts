import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';
import {
  WikiCollaborationAccessDeniedError,
  WikiCollaborationPersistenceError,
  WikiCollaborationProtocolVersionError,
  WikiCollaborationStateCorruptedError,
  WikiCollaborationStateTooLargeError,
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
  type WikiCollaborationSessionResponse,
  WikiCollaborationSessionSchema,
} from '@/wiki/dto/wiki-collaboration-session.dto';
import { WikiCollaborationAttributionProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-attribution.provider';
import { WikiCollaborationAuthorizationProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-authorization.provider';
import {
  WIKI_COLLABORATION_ENVIRONMENT,
  type WikiCollaborationEnvironment,
} from '@/wiki/infrastructure/collaboration/wiki-collaboration-configuration.provider';
import { WikiCollaborationStateProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-state.provider';
import { WikiCollaborationTokenProvider } from '@/wiki/infrastructure/collaboration/wiki-collaboration-token.provider';
import {
  type PersistWikiCollaborationSnapshotInput,
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

type WikiCollaborationOrganizationAccess = Pick<
  OrganizationsService,
  'getDetail'
>;

@Injectable()
export class WikiCollaborationService {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizationsService: WikiCollaborationOrganizationAccess,
    @Inject(WIKI_COLLABORATION_ENVIRONMENT)
    private readonly environment: WikiCollaborationEnvironment,
    private readonly repository: WikiRepository,
    private readonly tokenProvider: WikiCollaborationTokenProvider,
    private readonly authorizationProvider: WikiCollaborationAuthorizationProvider,
    private readonly stateProvider: WikiCollaborationStateProvider,
    private readonly attributionProvider: WikiCollaborationAttributionProvider,
  ) {}

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
      webSocketUrl: this.environment.COLLABORATION_PUBLIC_URL,
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

  async persistDocument(input: {
    documentName: string;
    encodedState: Uint8Array;
    fallbackContext: WikiCollaborationConnectionContext;
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
      attribution.lastEditorUserId ?? input.fallbackContext.userId;
    const collaboratorUserIds =
      attribution.collaboratorUserIds.length > 0
        ? attribution.collaboratorUserIds
        : [lastEditorUserId];

    const result = await this.persistCollaborationSnapshotWithRetry({
      organizationId: scope.organizationId,
      documentId: scope.documentId,
      encodedState: snapshot.encodedState,
      contentMarkdown: snapshot.contentMarkdown,
      lastEditorUserId,
      collaboratorUserIds,
      schemaVersion: WIKI_COLLABORATION_SCHEMA_VERSION,
      createCheckpoint: input.createCheckpoint,
    });
    if (result.checkpointCreated && attribution.maxSequence !== null) {
      await this.attributionProvider.clearThrough(
        input.documentName,
        attribution.maxSequence,
      );
    }
  }

  private async persistCollaborationSnapshotWithRetry(
    input: PersistWikiCollaborationSnapshotInput,
  ): Promise<PersistWikiCollaborationSnapshotResult> {
    let lastError: unknown;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.repository.persistCollaborationSnapshot(input);
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
