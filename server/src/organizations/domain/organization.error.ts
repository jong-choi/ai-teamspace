import { ApplicationError } from '#server/application.error.js';

export class OrganizationNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'ORGANIZATION_NOT_FOUND',
      'not_found',
      '조직을 찾을 수 없습니다.',
      options,
    );
  }
}

export class OrganizationMemberNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'ORGANIZATION_MEMBER_NOT_FOUND',
      'not_found',
      '조직 멤버를 찾을 수 없습니다.',
      options,
    );
  }
}

export class OrganizationAccessDeniedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'ORGANIZATION_ACCESS_DENIED',
      'forbidden',
      '이 조직 작업을 수행할 권한이 없습니다.',
      options,
    );
  }
}

export class OrganizationSlugConflictError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'ORGANIZATION_SLUG_CONFLICT',
      'conflict',
      '이미 사용 중인 조직 slug입니다.',
      options,
    );
  }
}

export class OrganizationCreationDeniedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'ORGANIZATION_CREATION_DENIED',
      'forbidden',
      '조직을 생성할 수 없습니다.',
      options,
    );
  }
}

export class InvalidOrganizationRoleError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'INVALID_ORGANIZATION_ROLE',
      'bad_request',
      '유효하지 않은 조직 역할입니다.',
      options,
    );
  }
}

export class OwnerTransferRequiredError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'OWNER_TRANSFER_REQUIRED',
      'conflict',
      'owner를 변경하거나 제거하려면 ownership transfer가 필요합니다.',
      options,
    );
  }
}

export class SelfRoleChangeNotSupportedError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'SELF_ROLE_CHANGE_NOT_SUPPORTED',
      'conflict',
      '자기 자신의 역할 변경은 이 API에서 지원하지 않습니다.',
      options,
    );
  }
}

export class OrganizationProviderFailureError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'ORGANIZATION_PROVIDER_FAILURE',
      'external_provider',
      '조직 인증 공급자 처리에 실패했습니다.',
      options,
    );
  }
}
