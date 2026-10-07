import { ApplicationError } from '@/application.error';
import type { McpAccessDenialReason } from '@/mcp-access/domain/mcp-access-decision';

export class McpToolAccessDeniedError extends ApplicationError {
  constructor(
    readonly reason: McpAccessDenialReason,
    options?: ErrorOptions,
  ) {
    super(
      'MCP_TOOL_ACCESS_DENIED',
      'forbidden',
      '현재 MCP credential 또는 정책으로 이 작업을 수행할 수 없습니다.',
      options,
    );
  }
}

export class McpToolNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_TOOL_NOT_FOUND',
      'not_found',
      '등록되지 않은 MCP tool입니다.',
      options,
    );
  }
}
