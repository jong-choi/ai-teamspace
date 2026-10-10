import {
  UserAvatarInvalidImageError,
  UserAvatarTooLargeError,
} from '@/user-profile/domain/user-profile.error';

import sharp from 'sharp';

export const USER_AVATAR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const USER_AVATAR_CONTENT_TYPE = 'image/webp';

const AVATAR_SIZE_PX = 512;
const AVATAR_WEBP_QUALITY = 82;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

// 올라온 원본을 정사각형 WebP로 다시 인코딩한다. 원본 metadata와 비이미지 payload는 이 과정에서 버려진다.
export async function encodeUserAvatar(source: Uint8Array): Promise<Buffer> {
  if (source.byteLength > USER_AVATAR_MAX_UPLOAD_BYTES) {
    throw new UserAvatarTooLargeError();
  }

  try {
    const image = sharp(source, { failOn: 'error' });
    const { format } = await image.metadata();
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      throw new UserAvatarInvalidImageError();
    }
    return await image
      .rotate()
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, {
        fit: 'cover',
        withoutEnlargement: true,
      })
      .webp({ quality: AVATAR_WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    if (error instanceof UserAvatarInvalidImageError) throw error;
    throw new UserAvatarInvalidImageError({ cause: error });
  }
}
