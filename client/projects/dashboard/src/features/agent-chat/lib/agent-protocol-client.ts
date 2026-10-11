import {
  getApiBaseUrl,
  getApiCredentials,
  getApiFetch,
  getApiHeaders,
} from '@repo/client/api-client/runtime';
import { Client } from '@core/features/agent-chat/lib/langgraph-sdk-runtime';

export const agentAssistantId = 'teamspace';
export const agentGraphId = 'teamspace';
export const agentMessagesKey = 'messages';

export function createAgentProtocolClient(): Client {
  return new Client({
    apiUrl: getApiBaseUrl(),
    apiKey: null,
    callerOptions: {
      fetch: createAgentFetch(),
    },
  });
}

export function createAgentFetch(): typeof fetch {
  return async (input, init) => {
    const sourceRequest = input instanceof Request ? input : null;
    const url = resolveAgentRequestUrl(input);
    const headers = await getApiHeaders(
      init?.headers ?? sourceRequest?.headers,
    );

    return getApiFetch()(url, {
      ...requestInitFrom(sourceRequest),
      ...init,
      credentials:
        init?.credentials ?? sourceRequest?.credentials ?? getApiCredentials(),
      headers,
    });
  };
}

function resolveAgentRequestUrl(input: RequestInfo | URL): string {
  const value =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.toString()
        : input;
  if (/^https?:\/\//u.test(value)) return value;

  return new URL(value.replace(/^\//u, ''), `${getApiBaseUrl()}/`).toString();
}

function requestInitFrom(request: Request | null): RequestInit {
  if (!request) return {};

  return {
    method: request.method,
    body: request.body,
    cache: request.cache,
    credentials: request.credentials,
    integrity: request.integrity,
    keepalive: request.keepalive,
    mode: request.mode,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    signal: request.signal,
  };
}
