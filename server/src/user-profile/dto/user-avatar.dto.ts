import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const UserAvatarSchema = z
  .object({
    image: z.string().nullable(),
  })
  .meta({ id: 'UserAvatar' });

export type UserAvatar = z.infer<typeof UserAvatarSchema>;

export class UserAvatarDto extends createZodDto(UserAvatarSchema) {}
