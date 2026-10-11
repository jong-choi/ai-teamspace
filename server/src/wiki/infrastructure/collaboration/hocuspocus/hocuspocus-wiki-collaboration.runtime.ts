import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApplicationError } from '@/application.error';
import type { AllConfigType } from '@/config/config.type';
import { buildWikiCollaborationDocumentName } from '@/wiki/domain/wiki-collaboration-document-name';
import type { CollaborationConfig } from '@/wiki/infrastructure/collaboration/config/collaboration-config.type';
import { WikiCollaborationInvalidationSubscriber } from '@/wiki/infrastructure/collaboration/wiki-collaboration-invalidation.provider';
import {
  type WikiCollaborationConnectionContext,
  WikiCollaborationService,
} from '@/wiki/wiki-collaboration.service';

import { Redis as HocuspocusRedis } from '@hocuspocus/extension-redis';
import { Throttle } from '@hocuspocus/extension-throttle';
import { type LocalTransactionOrigin, Server } from '@hocuspocus/server';
import { Redis } from 'ioredis';
import * as Y from 'yjs';

const storeDebounceMilliseconds = 3_000;
const storeMaxDebounceMilliseconds = 10_000;
const checkpointIntervalMilliseconds = 5 * 60_000;
const maximumWebSocketPayloadBytes = 2 * 1024 * 1024;
const maximumAwarenessPayloadBytes = 32 * 1024;
const maximumConnectionsPerUser = 20;
const gracefulShutdownTimeoutMilliseconds = 10_000;
const protocolVersionParameter = 'protocolVersion';
const serverPersistenceErrorPayload = JSON.stringify({
  type: 'server-persistence-error',
});
// 이미 DB에 저장된 상태를 메모리 문서에 합치는 것이므로 다시 저장하지 않는다.
const persistedContentOrigin: LocalTransactionOrigin = {
  source: 'local',
  skipStoreHooks: true,
};

@Injectable()
export class HocuspocusWikiCollaborationRuntime {
  private readonly logger = new Logger(HocuspocusWikiCollaborationRuntime.name);
  private readonly connectionsByUserId = new Map<string, number>();
  private readonly socketContexts = new Map<
    string,
    WikiCollaborationConnectionContext
  >();
  private readonly lastCheckpointAt = new Map<string, number>();
  private readonly pendingPersistence = new Set<Promise<void>>();
  private readonly authorizationExpirationTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private ready = false;
  private draining = false;
  private server: Server<WikiCollaborationConnectionContext> | null = null;
  private invalidationCleanup: (() => Promise<void>) | null = null;
  private readonly config: CollaborationConfig;

  constructor(
    configService: ConfigService<AllConfigType>,
    private readonly collaborationService: WikiCollaborationService,
    private readonly invalidationSubscriber: WikiCollaborationInvalidationSubscriber,
  ) {
    this.config = configService.getOrThrow('collaboration', { infer: true });
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }
    this.draining = false;
    this.ready = false;
    await this.collaborationService.assertReady();

    const redisExtension = new HocuspocusRedis({
      prefix: 'wiki:collaboration:hocuspocus',
      createClient: () =>
        new Redis(this.config.redisUrl, {
          maxRetriesPerRequest: 3,
        }),
    });

    const server = new Server<WikiCollaborationConnectionContext>({
      port: this.config.port,
      stopOnSignals: false,
      quiet: true,
      debounce: storeDebounceMilliseconds,
      maxDebounce: storeMaxDebounceMilliseconds,
      unloadImmediately: false,
      maxUnauthenticatedQueueSize: maximumWebSocketPayloadBytes,
      maxUnauthenticatedQueueMessages: 128,
      maxPendingDocuments: 4,
      websocketOptions: { maxPayload: maximumWebSocketPayloadBytes },
      extensions: [
        new Throttle({
          throttle: 30,
          consideredSeconds: 60,
          banTime: 5,
          cleanupInterval: 90,
        }),
        redisExtension,
      ],
      onAuthenticate: async ({
        token,
        documentName,
        requestParameters,
        connectionConfig,
        socketId,
      }) => {
        if (this.draining) {
          throw new Error('위키 공동편집 서버가 종료 중입니다.');
        }
        const protocolVersion = Number(
          requestParameters.get(protocolVersionParameter) ?? Number.NaN,
        );
        try {
          const context =
            await this.collaborationService.authenticateConnection({
              documentName,
              token,
              protocolVersion,
            });
          this.reserveConnection(context, socketId);
          this.scheduleAuthorizationExpiration(context, socketId);
          connectionConfig.readOnly = !context.canWrite;
          return context;
        } catch (error) {
          if (error instanceof ApplicationError) {
            throw new WikiHocuspocusAuthenticationError(error.code);
          }
          throw error;
        }
      },
      onTokenSync: async ({
        token,
        documentName,
        requestParameters,
        connection,
        socketId,
      }) => {
        const protocolVersion = Number(
          requestParameters.get(protocolVersionParameter) ?? Number.NaN,
        );
        try {
          const context =
            await this.collaborationService.authenticateConnection({
              documentName,
              token,
              protocolVersion,
            });
          const previous = this.socketContexts.get(socketId);
          if (
            !previous ||
            previous.userId !== context.userId ||
            previous.organizationId !== context.organizationId ||
            previous.documentId !== context.documentId
          ) {
            throw new Error('위키 공동편집 인증 scope가 변경되었습니다.');
          }
          Object.assign(previous, context);
          connection.context = previous;
          connection.readOnly = !context.canWrite;
          this.scheduleAuthorizationExpiration(previous, socketId);
        } catch (error) {
          if (error instanceof ApplicationError) {
            throw new WikiHocuspocusAuthenticationError(error.code);
          }
          throw error;
        }
      },
      onLoadDocument: async ({ documentName }) =>
        this.collaborationService.loadDocument(documentName),
      onChange: async ({ documentName, context, connection }) => {
        if (!connection || !context.canWrite) {
          return;
        }
        await this.collaborationService.recordEditor(documentName, context);
      },
      beforeHandleAwareness: async ({ states, context }) => {
        if (!context) {
          return;
        }
        enforceAwarenessSize(states);
        const user = {
          id: context.userId,
          name: context.userName,
          color: collaborationColorForUser(context.userId),
        };
        for (const state of states.values()) {
          Reflect.set(state, 'user', user);
        }
      },
      onStoreDocument: async ({
        document,
        documentName,
        clientsCount,
        lastContext,
      }) => {
        const encodedState = snapshotDocument(document);
        const now = Date.now();
        const lastCheckpoint = this.lastCheckpointAt.get(documentName) ?? 0;
        const createCheckpoint =
          clientsCount === 0 ||
          now - lastCheckpoint >= checkpointIntervalMilliseconds;
        const persistence = this.collaborationService.persistDocument({
          documentName,
          encodedState,
          fallbackContext: lastContext,
          createCheckpoint,
        });
        this.pendingPersistence.add(persistence);
        try {
          await persistence;
          if (createCheckpoint) {
            this.lastCheckpointAt.set(documentName, now);
          }
        } catch (error) {
          document.broadcastStateless(serverPersistenceErrorPayload);
          this.closeDocument(documentName);
          throw error;
        } finally {
          this.pendingPersistence.delete(persistence);
        }
      },
      onDisconnect: async ({ socketId }) => {
        this.releaseConnection(socketId);
      },
      afterUnloadDocument: async ({ documentName }) => {
        this.lastCheckpointAt.delete(documentName);
      },
      onRequest: async ({ request, response }) => {
        if (request.url === '/health/live') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end('{"status":"ok"}');
          return Promise.reject();
        }
        if (request.url === '/health/ready') {
          response.writeHead(this.ready ? 200 : 503, {
            'content-type': 'application/json',
          });
          response.end(
            this.ready ? '{"status":"ready"}' : '{"status":"not-ready"}',
          );
          return Promise.reject();
        }
      },
    });

    this.server = server;
    this.invalidationCleanup = await this.invalidationSubscriber.subscribe(
      async (event) => {
        if (event.scope === 'document') {
          this.closeDocument(
            buildWikiCollaborationDocumentName({
              organizationId: event.organizationId,
              documentId: event.documentId,
            }),
          );
          return;
        }
        if (event.scope === 'document-content') {
          await this.mergePersistedDocument(
            buildWikiCollaborationDocumentName({
              organizationId: event.organizationId,
              documentId: event.documentId,
            }),
          );
          return;
        }
        this.closeOrganizationUser(event.organizationId, event.userId);
      },
    );
    await server.listen();
    this.ready = true;
    this.logger.log(
      `위키 공동편집 서버가 ${this.config.port} 포트에서 시작되었습니다.`,
    );
  }

  async stop(): Promise<void> {
    this.ready = false;
    this.draining = true;
    const server = this.server;
    if (!server) {
      return;
    }

    const deadline = Date.now() + gracefulShutdownTimeoutMilliseconds;
    server.hocuspocus.flushPendingStores();
    const initialDrainCompleted = await this.drainPendingPersistence(deadline);

    server.hocuspocus.closeConnections();
    server.hocuspocus.flushPendingStores();
    const disconnectDrainCompleted =
      await this.drainPendingPersistence(deadline);
    const destroyCompleted = await this.destroyWithinDeadline(server, deadline);

    const invalidationCleanup = this.invalidationCleanup;
    this.invalidationCleanup = null;
    if (invalidationCleanup) {
      await invalidationCleanup();
    }

    if (
      !initialDrainCompleted ||
      !disconnectDrainCompleted ||
      !destroyCompleted
    ) {
      this.logger.error(
        '위키 공동편집 서버 종료 중 persistence drain 제한 시간을 초과했습니다.',
      );
    }

    this.server = null;
    this.connectionsByUserId.clear();
    this.socketContexts.clear();
    this.lastCheckpointAt.clear();
    this.pendingPersistence.clear();
    for (const timer of this.authorizationExpirationTimers.values()) {
      clearTimeout(timer);
    }
    this.authorizationExpirationTimers.clear();
  }

  closeDocument(documentName: string): void {
    this.server?.hocuspocus.closeConnections(documentName);
  }

  /**
   * 공동편집 서버 밖에서 저장된 본문을 열려 있는 문서에 합쳐 접속 중인 편집기에 전달한다.
   * 열려 있지 않은 문서는 다음에 열 때 DB에서 읽으므로 아무것도 하지 않는다.
   */
  async mergePersistedDocument(documentName: string): Promise<void> {
    const hocuspocus = this.server?.hocuspocus;
    if (!hocuspocus) {
      return;
    }
    // 로드 중인 문서는 저장 전 상태를 읽었을 수 있으므로 로드가 끝난 뒤 합친다.
    const loading = hocuspocus.loadingDocuments.get(documentName);
    const document = loading
      ? await loading.catch(() => undefined)
      : hocuspocus.documents.get(documentName);
    if (!document) {
      return;
    }
    const persistedState =
      await this.collaborationService.loadDocument(documentName);
    Y.applyUpdate(document, persistedState, persistedContentOrigin);
  }

  closeOrganizationUser(organizationId: string, userId: string): void {
    const prefix = `wiki.${organizationId}.`;
    const server = this.server;
    if (!server) {
      return;
    }
    for (const [documentName, document] of server.hocuspocus.documents) {
      if (!documentName.startsWith(prefix)) {
        continue;
      }
      for (const connection of document.connections.keys()) {
        const context = this.socketContexts.get(connection.socketId);
        if (
          context?.organizationId === organizationId &&
          context.userId === userId
        ) {
          connection.close();
        }
      }
    }
  }

  private reserveConnection(
    context: WikiCollaborationConnectionContext,
    socketId: string,
  ): void {
    const current = this.connectionsByUserId.get(context.userId) ?? 0;
    if (current >= maximumConnectionsPerUser) {
      throw new Error('위키 공동편집 연결 수 제한을 초과했습니다.');
    }
    this.connectionsByUserId.set(context.userId, current + 1);
    this.socketContexts.set(socketId, context);
  }

  private releaseConnection(socketId: string): void {
    const expirationTimer = this.authorizationExpirationTimers.get(socketId);
    if (expirationTimer) {
      clearTimeout(expirationTimer);
      this.authorizationExpirationTimers.delete(socketId);
    }
    const context = this.socketContexts.get(socketId);
    if (!context) {
      return;
    }
    this.socketContexts.delete(socketId);
    const current = this.connectionsByUserId.get(context.userId) ?? 0;
    if (current <= 1) {
      this.connectionsByUserId.delete(context.userId);
      return;
    }
    this.connectionsByUserId.set(context.userId, current - 1);
  }

  private scheduleAuthorizationExpiration(
    context: WikiCollaborationConnectionContext,
    socketId: string,
  ): void {
    const currentTimer = this.authorizationExpirationTimers.get(socketId);
    if (currentTimer) {
      clearTimeout(currentTimer);
    }
    const delayMilliseconds = Math.max(
      0,
      context.authorizationExpiresAt.getTime() - Date.now(),
    );
    const timer = setTimeout(() => {
      this.authorizationExpirationTimers.delete(socketId);
      this.closeSocket(socketId);
    }, delayMilliseconds);
    this.authorizationExpirationTimers.set(socketId, timer);
  }

  private closeSocket(socketId: string): void {
    const server = this.server;
    if (!server) {
      this.releaseConnection(socketId);
      return;
    }
    for (const document of server.hocuspocus.documents.values()) {
      for (const connection of document.connections.keys()) {
        if (connection.socketId === socketId) {
          connection.close();
          return;
        }
      }
    }
    this.releaseConnection(socketId);
  }

  private async drainPendingPersistence(deadline: number): Promise<boolean> {
    await Promise.resolve();
    while (this.pendingPersistence.size > 0) {
      const remainingMilliseconds = deadline - Date.now();
      if (remainingMilliseconds <= 0) {
        return false;
      }
      await Promise.race([
        Promise.allSettled(this.pendingPersistence),
        delay(Math.min(remainingMilliseconds, 50)),
      ]);
    }
    return true;
  }

  private async destroyWithinDeadline(
    server: Server<WikiCollaborationConnectionContext>,
    deadline: number,
  ): Promise<boolean> {
    const destroyPromise = server.destroy();
    const remainingMilliseconds = deadline - Date.now();
    if (remainingMilliseconds <= 0) {
      void destroyPromise.catch((error: unknown) => {
        this.logger.error(
          '위키 공동편집 서버 지연 종료 중 오류가 발생했습니다.',
          error,
        );
      });
      return false;
    }

    const completed = await Promise.race([
      destroyPromise
        .then(() => true)
        .catch((error: unknown) => {
          this.logger.error('위키 공동편집 서버 종료에 실패했습니다.', error);
          return false;
        }),
      delay(remainingMilliseconds).then(() => false),
    ]);
    if (!completed) {
      void destroyPromise.catch((error: unknown) => {
        this.logger.error(
          '위키 공동편집 서버 지연 종료 중 오류가 발생했습니다.',
          error,
        );
      });
    }
    return completed;
  }
}

class WikiHocuspocusAuthenticationError extends Error {
  constructor(readonly reason: string) {
    super('위키 공동편집 인증에 실패했습니다.');
    this.name = 'WikiHocuspocusAuthenticationError';
  }
}

function snapshotDocument(document: Y.Doc): Uint8Array {
  const snapshot = new Y.Doc();
  Y.applyUpdate(snapshot, Y.encodeStateAsUpdate(document));
  return Y.encodeStateAsUpdate(snapshot);
}

function enforceAwarenessSize(
  states: Map<number, Record<string, unknown>>,
): void {
  const serialized = JSON.stringify([...states.entries()]);
  if (Buffer.byteLength(serialized, 'utf8') > maximumAwarenessPayloadBytes) {
    throw new Error('위키 공동편집 presence payload가 너무 큽니다.');
  }
}

function collaborationColorForUser(userId: string): string {
  let hash = 0;
  for (const character of userId) {
    hash = (hash * 31 + character.codePointAt(0)!) % 360;
  }
  return `hsl(${hash} 70% 45%)`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
