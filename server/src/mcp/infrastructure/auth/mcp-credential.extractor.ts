import { MCP_ACCESS_KEY_PREFIX } from '@/mcp-access-keys/domain/mcp-access-key-contract';

export type ExtractedMcpCredential =
  | { method: 'none' }
  | { method: 'oauth'; secret: string }
  | { method: 'api-key'; secret: string; source: 'bearer' | 'x-api-key' };

export class McpCredentialExtractionError extends Error {}

export function extractMcpCredential(request: Request): ExtractedMcpCredential {
  const authorization = request.headers.get('authorization');
  const xApiKey = request.headers.get('x-api-key');

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

  return { method: 'none' };
}
