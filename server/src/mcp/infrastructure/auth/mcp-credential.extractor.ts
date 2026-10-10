import {
  MCP_ACCESS_KEY_PREFIX,
  MCP_ACCESS_KEY_URL_PARAMETER,
} from '@/mcp-access-keys/domain/mcp-access-key-contract';

export type ExtractedMcpCredential =
  | { method: 'none' }
  | { method: 'oauth'; secret: string }
  | {
      method: 'api-key';
      secret: string;
      source: 'bearer' | 'x-api-key' | 'url';
    };

export class McpCredentialExtractionError extends Error {}

export function extractMcpCredential(request: Request): ExtractedMcpCredential {
  const authorization = request.headers.get('authorization');
  const xApiKey = request.headers.get('x-api-key');
  const urlTokens = new URL(request.url).searchParams.getAll(
    MCP_ACCESS_KEY_URL_PARAMETER,
  );

  if (urlTokens.length > 0 && (authorization || xApiKey)) {
    throw new McpCredentialExtractionError(
      '주소의 access key와 credential header를 동시에 사용할 수 없습니다.',
    );
  }

  if (authorization && xApiKey) {
    throw new McpCredentialExtractionError(
      'Authorization과 X-API-Key를 동시에 사용할 수 없습니다.',
    );
  }

  if (authorization) {
    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    if (!match?.[1]) {
      throw new McpCredentialExtractionError(
        'Authorization은 Bearer credential이어야 합니다.',
      );
    }

    const secret = match[1];
    return secret.startsWith(MCP_ACCESS_KEY_PREFIX)
      ? { method: 'api-key', secret, source: 'bearer' }
      : { method: 'oauth', secret };
  }

  if (xApiKey) {
    if (/\s|,/.test(xApiKey)) {
      throw new McpCredentialExtractionError(
        'X-API-Key credential 형식이 올바르지 않습니다.',
      );
    }
    return { method: 'api-key', secret: xApiKey, source: 'x-api-key' };
  }

  if (urlTokens.length > 0) {
    const [urlToken] = urlTokens;
    if (urlTokens.length > 1 || !urlToken || /\s|,/.test(urlToken)) {
      throw new McpCredentialExtractionError(
        '주소의 access key 형식이 올바르지 않습니다.',
      );
    }
    return { method: 'api-key', secret: urlToken, source: 'url' };
  }

  return { method: 'none' };
}

// access key가 실린 주소가 MCP SDK와 그 뒤의 log·오류 응답으로 흘러가지 않게 query에서 지운다.
export function withoutMcpUrlCredential(request: Request): Request {
  const url = new URL(request.url);
  if (!url.searchParams.has(MCP_ACCESS_KEY_URL_PARAMETER)) return request;
  url.searchParams.delete(MCP_ACCESS_KEY_URL_PARAMETER);
  return new Request(url, request);
}
