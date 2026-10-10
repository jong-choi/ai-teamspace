import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Auth } from '@/auth/auth';
import type { AllConfigType } from '@/config/config.type';
import {
  ObjectStorageProvider,
  type StoredObject,
} from '@/object-storage/object-storage.provider';
import {
  encodeUserAvatar,
  USER_AVATAR_CONTENT_TYPE,
} from '@/user-profile/domain/user-avatar-image';
import { UserAvatarNotFoundError } from '@/user-profile/domain/user-profile.error';
import type { UserAvatar } from '@/user-profile/dto/user-avatar.dto';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';

const AVATAR_KEY_PREFIX = 'avatars/';
const AVATAR_PUBLIC_PATH = '/users/avatars/';
const AVATAR_FILE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,128}\.webp$/;

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);
  private readonly publicBaseUrl: string;

  constructor(
    private readonly authService: AuthService<Auth>,
    private readonly storage: ObjectStorageProvider,
    configService: ConfigService<AllConfigType>,
  ) {
    this.publicBaseUrl = configService
      .getOrThrow('auth.baseUrl', { infer: true })
      .replace(/\/+$/, '');
  }

  async replaceAvatar(
    headers: IncomingHttpHeaders,
    currentImage: string | null | undefined,
    source: Uint8Array,
  ): Promise<UserAvatar> {
    const body = await encodeUserAvatar(source);
    // 파일 이름이 바뀌어야 브라우저가 장기 cache한 이전 사진을 다시 쓰지 않는다.
    const fileName = `${randomUUID()}.webp`;
    await this.storage.put(AVATAR_KEY_PREFIX + fileName, {
      body,
      contentType: USER_AVATAR_CONTENT_TYPE,
    });

    const image = this.publicBaseUrl + AVATAR_PUBLIC_PATH + fileName;
    await this.updateUserImage(headers, image);
    await this.deleteStoredAvatar(currentImage);
    return { image };
  }

  async removeAvatar(
    headers: IncomingHttpHeaders,
    currentImage: string | null | undefined,
  ): Promise<UserAvatar> {
    await this.updateUserImage(headers, null);
    await this.deleteStoredAvatar(currentImage);
    return { image: null };
  }

  async readAvatar(fileName: string): Promise<StoredObject> {
    if (!AVATAR_FILE_NAME_PATTERN.test(fileName)) {
      throw new UserAvatarNotFoundError();
    }
    const stored = await this.storage.get(AVATAR_KEY_PREFIX + fileName);
    if (!stored) throw new UserAvatarNotFoundError();
    return stored;
  }

  private async updateUserImage(
    headers: IncomingHttpHeaders,
    image: string | null,
  ): Promise<void> {
    await this.authService.api.updateUser({
      body: { image },
      headers: fromNodeHeaders(headers),
    });
  }

  // 이전 사진 정리는 실패해도 사용자의 변경을 되돌리지 않는다. 남은 object는 접근 경로가 없다.
  private async deleteStoredAvatar(
    image: string | null | undefined,
  ): Promise<void> {
    const prefix = this.publicBaseUrl + AVATAR_PUBLIC_PATH;
    if (!image?.startsWith(prefix)) return;
    const fileName = image.slice(prefix.length);
    if (!AVATAR_FILE_NAME_PATTERN.test(fileName)) return;
    try {
      await this.storage.delete(AVATAR_KEY_PREFIX + fileName);
    } catch (error) {
      this.logger.warn('이전 프로필 사진을 삭제하지 못했습니다.', error);
    }
  }
}
