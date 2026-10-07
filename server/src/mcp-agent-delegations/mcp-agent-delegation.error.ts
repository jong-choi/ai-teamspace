import { ApplicationError } from '@/application.error';

export class McpAgentDelegationRequiredError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_AGENT_DELEGATION_REQUIRED',
      'forbidden',
      'Work OS Agent MCP 권한 위임이 필요합니다.',
      options,
    );
  }
}

export class McpAgentDelegationFlowInvalidError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_AGENT_DELEGATION_FLOW_INVALID',
      'bad_request',
      'MCP Agent OAuth 흐름이 유효하지 않거나 만료되었습니다.',
      options,
    );
  }
}

export class McpAgentDelegationCredentialInvalidError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_AGENT_DELEGATION_CREDENTIAL_INVALID',
      'forbidden',
      'MCP Agent OAuth credential을 사용할 수 없습니다.',
      options,
    );
  }
}

export class McpAgentDelegationRevocationError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_AGENT_DELEGATION_REVOCATION_FAILED',
      'external_provider',
      'MCP Agent OAuth credential 원격 폐기를 완료하지 못했습니다.',
      options,
    );
  }
}

export class McpAgentDelegationRefreshConflictError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_AGENT_DELEGATION_REFRESH_CONFLICT',
      'conflict',
      'MCP Agent OAuth credential 갱신이 이미 진행 중입니다.',
      options,
    );
  }
}
