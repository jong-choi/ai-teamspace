import { ApplicationError } from '@/application.error';

export class McpAccessKeyRateLimitedError extends Error {
  constructor(
    readonly retryAfterMs: number | null,
    options?: ErrorOptions,
  ) {
    super('MCP access key 요청 한도를 초과했습니다.', options);
    this.name = new.target.name;
  }
}

export class McpAccessKeyAuthenticationError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ACCESS_KEY_INVALID',
      'forbidden',
      '유효한 MCP access key가 아닙니다.',
      options,
    );
  }
}

export class McpAccessKeyNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ACCESS_KEY_NOT_FOUND',
      'not_found',
      'MCP access key를 찾을 수 없습니다.',
      options,
    );
  }
}

export class McpAccessKeyGrantInvalidError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ACCESS_KEY_GRANT_INVALID',
      'forbidden',
      '선택한 조직에 대한 현재 멤버십이 필요합니다.',
      options,
    );
  }
}

export class McpAccessKeyExpirationInvalidError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ACCESS_KEY_EXPIRATION_INVALID',
      'bad_request',
      'MCP access key 만료 기간이 허용 범위를 벗어났습니다.',
      options,
    );
  }
}

export class McpAccessKeyQuotaExceededError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ACCESS_KEY_QUOTA_EXCEEDED',
      'conflict',
      '활성 MCP access key 한도를 초과했습니다.',
      options,
    );
  }
}

export class McpAccessKeyIdempotencyConflictError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ACCESS_KEY_IDEMPOTENCY_CONFLICT',
      'conflict',
      '동일한 Idempotency-Key가 다른 요청에 사용되었습니다.',
      options,
    );
  }
}

export class McpAccessKeyOperationPendingError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ACCESS_KEY_OPERATION_PENDING',
      'conflict',
      '동일한 MCP access key 작업이 아직 처리 중입니다.',
      options,
    );
  }
}

export class McpAccessKeySecretAlreadyIssuedError extends ApplicationError {
  constructor(
    readonly resultingKeyId: string | null,
    options?: ErrorOptions,
  ) {
    super(
      'MCP_ACCESS_KEY_SECRET_ALREADY_ISSUED',
      'conflict',
      '이 작업의 MCP access key secret은 이미 한 번 발급되었습니다.',
      options,
    );
  }
}

export class McpAccessKeyOperationFailedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ACCESS_KEY_OPERATION_FAILED',
      'conflict',
      '같은 Idempotency-Key의 이전 작업이 실패했습니다. 새 Idempotency-Key를 사용하세요.',
      options,
    );
  }
}

export class McpAccessKeyCoordinationFailureError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ACCESS_KEY_COORDINATION_FAILURE',
      'internal',
      'MCP access key coordination 상태를 확정하지 못했습니다.',
      options,
    );
  }
}

export class McpAccessKeyProviderFailureError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'MCP_ACCESS_KEY_PROVIDER_FAILURE',
      'external_provider',
      'MCP access key 공급자 처리에 실패했습니다.',
      options,
    );
  }
}
