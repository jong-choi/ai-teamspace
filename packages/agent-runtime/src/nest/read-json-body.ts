import type { IncomingMessage } from 'node:http';

import { SkeinHttpError } from '@repo/agent-runtime/core';

export type AgentRuntimeRequest = IncomingMessage & {
  originalUrl?: string;
  body?: unknown;
};

/** Nest 전역 body parser가 꺼진 환경에서도 Agent Protocol JSON body를 직접 읽는다. */
export async function readJsonBody(
  request: AgentRuntimeRequest,
  retainRawBody = false,
): Promise<unknown> {
  if (retainRawBody) return readRawBody(request);
  if (request.body !== undefined) return request.body;

  const contentType = request.headers['content-type'];
  const singleContentType = Array.isArray(contentType)
    ? contentType[0]
    : contentType;
  if (!singleContentType?.includes('application/json')) return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw SkeinHttpError.badRequest('Request body is not valid JSON.');
  }
}

/** 서명 검증이 필요한 route에는 재직렬화가 아닌 원본 body를 전달한다. */
async function readRawBody(request: AgentRuntimeRequest): Promise<string> {
  if (request.body !== undefined) {
    throw SkeinHttpError.badRequest(
      'This route needs the unparsed request body, but a body parser has already consumed it. ' +
        'Bootstrap NestJS with `{ bodyParser: false }`, or exclude the channel routes from it.',
      { code: 'raw_body_unavailable' },
    );
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
