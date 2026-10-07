import { ApplicationError } from '@/application.error';

export class AgentMcpConnectionNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'AGENT_MCP_CONNECTION_NOT_FOUND',
      'not_found',
      '외부 MCP connection을 찾을 수 없습니다.',
      options,
    );
  }
}

export class AgentMcpConnectionAuthKindMismatchError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'AGENT_MCP_CONNECTION_AUTH_KIND_MISMATCH',
      'conflict',
      '외부 MCP connection의 인증 방식과 credential 작업이 일치하지 않습니다.',
      options,
    );
  }
}

export class AgentMcpOauthStateInvalidError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'AGENT_MCP_OAUTH_STATE_INVALID',
      'bad_request',
      '외부 MCP OAuth 요청 상태가 유효하지 않습니다.',
      options,
    );
  }
}

export class AgentMcpConnectionRevisionConflictError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'AGENT_MCP_CONNECTION_REVISION_CONFLICT',
      'conflict',
      '외부 MCP connection이 다른 요청에서 변경되었습니다.',
      options,
    );
  }
}

export class AgentMcpConnectionLimitExceededError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'AGENT_MCP_CONNECTION_LIMIT_EXCEEDED',
      'conflict',
      '외부 MCP connection 허용 개수를 초과했습니다.',
      options,
    );
  }
}

export class AgentMcpConnectionCredentialRequiredError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'AGENT_MCP_CONNECTION_CREDENTIAL_REQUIRED',
      'conflict',
      '외부 MCP connection을 활성화하려면 credential 설정이 필요합니다.',
      options,
    );
  }
}

export class AgentMcpActiveOrganizationRequiredError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'AGENT_MCP_ACTIVE_ORGANIZATION_REQUIRED',
      'bad_request',
      '외부 MCP connection을 관리하려면 활성 조직이 필요합니다.',
      options,
    );
  }
}

export class AgentMcpDiscoveryFailedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'AGENT_MCP_DISCOVERY_FAILED',
      'external_provider',
      '외부 MCP connection의 tool catalog를 확인하지 못했습니다.',
      options,
    );
  }
}

export class AgentMcpOauthCredentialInvalidError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'AGENT_MCP_OAUTH_CREDENTIAL_INVALID',
      'external_provider',
      '외부 MCP OAuth credential을 안전하게 사용할 수 없습니다.',
      options,
    );
  }
}

export class AgentMcpOauthAuthorizationRequiredError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'AGENT_MCP_OAUTH_AUTHORIZATION_REQUIRED',
      'conflict',
      '외부 MCP connection에 OAuth 인증이 필요합니다.',
      options,
    );
  }
}
