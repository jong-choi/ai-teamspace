import type { IncomingMessage } from 'node:http';
import { MIMEType } from 'node:util';

const JSON_MEDIA_TYPE = 'application/json';

/**
 * 전역 JSON body parser의 `type` matcher를 만든다.
 *
 * `rawBodyPaths`의 요청은 parser가 body stream을 소비하지 않는다. 해당 endpoint가
 * 직접 body를 읽어 자체 크기 제한과 오류 형식을 적용한다.
 */
export function createJsonBodyTypeMatcher(
  rawBodyPaths: readonly string[],
): (request: IncomingMessage) => boolean {
  const rawPaths = new Set(rawBodyPaths);

  return (request) =>
    !rawPaths.has(requestPathname(request)) &&
    isJsonMediaType(request.headers['content-type']);
}

function requestPathname(request: IncomingMessage): string {
  // Express mount 경로가 `url`을 잘라도 원래 요청 경로로 판단한다.
  const url =
    'originalUrl' in request && typeof request.originalUrl === 'string'
      ? request.originalUrl
      : request.url;
  return new URL(url ?? '/', 'http://localhost').pathname;
}

function isJsonMediaType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  try {
    return new MIMEType(contentType).essence === JSON_MEDIA_TYPE;
  } catch (error) {
    // 문법이 잘못된 Content-Type은 body-parser 기본 동작처럼 JSON 요청으로 보지 않는다.
    if (isInvalidMimeSyntax(error)) return false;
    throw error;
  }
}

function isInvalidMimeSyntax(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ERR_INVALID_MIME_SYNTAX'
  );
}
