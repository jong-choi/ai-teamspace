import type { ServerResponse } from 'node:http';

import {
  Inject,
  Injectable,
  type NestMiddleware,
  Optional,
} from '@nestjs/common';
import { ApplicationConfig } from '@nestjs/core';

import {
  copyThreadIdIntoBody,
  createRouteMatcher,
  type Logger,
  type RouteMatcher,
} from '@repo/agent-runtime/agent-protocol';
import {
  applyNodeCors,
  type CorsSetting,
  type ResolvedProtocolRuntime,
  sendNodeError,
  sendNodePreflight,
  sendNodeResponse,
  stripBasePath,
} from '@repo/agent-runtime/server-kit';

import {
  AGENT_RUNTIME,
  AGENT_RUNTIME_CORS,
  AGENT_RUNTIME_LOGGER,
} from '#agent-runtime/nest/agent-runtime.tokens.js';
import {
  type AgentRuntimeRequest,
  readJsonBody,
} from '#agent-runtime/nest/read-json-body.js';
import { toProtocolRequest } from '#agent-runtime/nest/to-protocol-request.js';

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Skein route table만 점유하고 나머지 요청은 기존 Nest controller로 넘긴다. */
@Injectable()
export class AgentRuntimeMiddleware implements NestMiddleware {
  private readonly matchRoute: RouteMatcher;

  constructor(
    @Inject(AGENT_RUNTIME)
    private readonly resolved: ResolvedProtocolRuntime,
    @Inject(AGENT_RUNTIME_LOGGER)
    private readonly logger: Logger | null,
    @Inject(AGENT_RUNTIME_CORS)
    private readonly optionCors: boolean | CorsSetting | null,
    @Optional()
    @Inject(ApplicationConfig)
    private readonly appConfig?: ApplicationConfig,
  ) {
    this.matchRoute = createRouteMatcher(this.resolved.routes);
  }

  async use(
    request: AgentRuntimeRequest,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ): Promise<void> {
    const rawUrl = request.originalUrl ?? request.url ?? '/';
    const host = request.headers.host ?? 'localhost';

    let url: URL;
    try {
      url = new URL(rawUrl, `http://${host}`);
    } catch {
      next();
      return;
    }

    const pathname = stripBasePath(
      url.pathname,
      this.appConfig?.getGlobalPrefix() ?? '',
    );
    if (pathname === null) {
      next();
      return;
    }

    const cors: CorsSetting | false | undefined =
      this.optionCors ?? this.resolved.cors;
    const method = (request.method ?? 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      const requestedMethod = firstHeader(
        request.headers['access-control-request-method'],
      );
      if (
        cors &&
        requestedMethod &&
        this.matchRoute(requestedMethod, pathname)
      ) {
        sendNodePreflight(request.headers, response, cors);
        return;
      }
      next();
      return;
    }

    const match = this.matchRoute(method, pathname);
    if (!match) {
      next();
      return;
    }

    if (cors) applyNodeCors(request.headers, response, cors);

    const disconnected = new AbortController();
    response.once('close', () => {
      disconnected.abort(new Error('client disconnected'));
    });

    try {
      const body = await readJsonBody(
        request,
        match.binding.retainRawBody ?? false,
      );
      const protocolRequest = {
        ...toProtocolRequest(request, url, match.params, body),
        signal: disconnected.signal,
      };
      const invoke = this.resolved.runtime.handlers[match.binding.handler];
      const protocolResponse = await invoke(
        match.binding.foldThreadIdIntoBody
          ? copyThreadIdIntoBody(protocolRequest)
          : protocolRequest,
      );
      await sendNodeResponse(protocolResponse, response);
    } catch (error) {
      sendNodeError(
        error,
        response,
        this.logger ?? undefined,
        'agent runtime NestJS',
      );
    }
  }
}
