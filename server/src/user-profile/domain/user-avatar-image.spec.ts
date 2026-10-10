import {
  encodeUserAvatar,
  USER_AVATAR_MAX_UPLOAD_BYTES,
} from '@/user-profile/domain/user-avatar-image';
import {
  UserAvatarInvalidImageError,
  UserAvatarTooLargeError,
} from '@/user-profile/domain/user-profile.error';

import sharp from 'sharp';

describe('프로필 사진 인코딩', () => {
  it('PNG 원본을 512px 이하 정사각형 WebP로 다시 인코딩한다', async () => {
    const source = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: { r: 120, g: 80, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const encoded = await encodeUserAvatar(source);
    const metadata = await sharp(encoded).metadata();

    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
  });

  it('이미지가 아닌 payload를 거부한다', async () => {
    await expect(
      encodeUserAvatar(Buffer.from('<script>alert(1)</script>')),
    ).rejects.toBeInstanceOf(UserAvatarInvalidImageError);
  });

  it('허용하지 않는 이미지 형식을 거부한다', async () => {
    const gif = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .gif()
      .toBuffer();

    await expect(encodeUserAvatar(gif)).rejects.toBeInstanceOf(
      UserAvatarInvalidImageError,
    );
  });

  it('크기 제한을 넘는 원본을 거부한다', async () => {
    await expect(
      encodeUserAvatar(Buffer.alloc(USER_AVATAR_MAX_UPLOAD_BYTES + 1)),
    ).rejects.toBeInstanceOf(UserAvatarTooLargeError);
  });
});
