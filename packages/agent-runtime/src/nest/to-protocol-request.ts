import type { IncomingHttpHeaders } from 'node:http';

import type { ProtocolRequest } from '@repo/agent-runtime/agent-protocol';

export interface NodeProtocolRequest {
  method?: string;
  url?: string;
  originalUrl?: string;
  headers: IncomingHttpHeaders;
  body?: unknown;
}

function toSingleValueHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string | undefined> {
  const flattened: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(headers)) {
    flattened[name] = Array.isArray(value) ? value[0] : value;
  }
  return flattened;
}

function toQuery(url: URL): ProtocolRequest['query'] {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    query[key] = all.length > 1 ? all : (all[0] as string);
  }
  return query;
}

/** Nest/Node 요청을 transport-neutral Agent Protocol 요청으로 변환한다. */
export function toProtocolRequest(
  request: NodeProtocolRequest,
  url: URL,
  params: Record<string, string>,
  body: unknown,
): ProtocolRequest {
  return {
    method: request.method ?? 'GET',
    url: url.href,
    params,
    query: toQuery(url),
    body,
    headers: toSingleValueHeaders(request.headers),
  };
}
