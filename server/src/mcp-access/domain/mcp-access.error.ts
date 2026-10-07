import { ApplicationError } from '@/application.error';

export class McpOrganizationPolicyForbiddenError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ORGANIZATION_POLICY_FORBIDDEN',
      'forbidden',
      '조직 MCP 정책을 변경할 권한이 없습니다.',
      options,
    );
  }
}

export class McpScopeNotAllowedByOrganizationError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_SCOPE_NOT_ALLOWED_BY_ORGANIZATION',
      'bad_request',
      '조직 정책에서 허용하지 않은 MCP scope를 요청할 수 없습니다.',
      options,
    );
  }
}

export class McpScopeNotAllowedForUserError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_SCOPE_NOT_ALLOWED_FOR_USER',
      'forbidden',
      '현재 사용자 MCP 정책에서 이 작업을 허용하지 않습니다.',
      options,
    );
  }
}

export class McpPolicyRevisionConflictError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_POLICY_REVISION_CONFLICT',
      'conflict',
      'MCP 정책이 다른 요청에서 변경되었습니다. 최신 상태를 다시 불러와 주세요.',
      options,
    );
  }
}

export class McpOrganizationMembershipRequiredError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ORGANIZATION_MEMBERSHIP_REQUIRED',
      'forbidden',
      '이 조직의 현재 멤버십이 필요합니다.',
      options,
    );
  }
}

export class McpPolicyScopeInvalidError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_POLICY_SCOPE_INVALID',
      'bad_request',
      '유효하지 않은 MCP scope입니다.',
      options,
    );
  }
}

export class McpPolicyNotProvisionedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_POLICY_NOT_PROVISIONED',
      'not_found',
      'MCP 정책이 아직 준비되지 않았습니다.',
      options,
    );
  }
}
