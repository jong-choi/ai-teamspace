import { ApplicationError } from '@/application.error';

export class UserAvatarInvalidImageError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'USER_AVATAR_INVALID_IMAGE',
      'bad_request',
      'PNG, JPEG, WebP 이미지 파일만 프로필 사진으로 쓸 수 있습니다.',
      options,
    );
  }
}

export class UserAvatarTooLargeError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'USER_AVATAR_TOO_LARGE',
      'bad_request',
      '프로필 사진은 5MB 이하여야 합니다.',
      options,
    );
  }
}

export class UserAvatarNotFoundError extends ApplicationError {
  constructor(options?: ErrorOptions) {
    super(
      'USER_AVATAR_NOT_FOUND',
      'not_found',
      '프로필 사진을 찾을 수 없습니다.',
      options,
    );
  }
}
