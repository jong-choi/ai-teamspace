import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { WikiEditLock } from '#server/wiki/domain/wiki-edit-lock.js';

import { z } from 'zod';

export const WikiEditLockStateSchema = z
  .object({
    locked: z.boolean(),
    ownedByActor: z.boolean(),
    lockedBy: z.string().nullable(),
    acquiredAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime().nullable(),
  })
  .meta({ id: 'WikiEditLockState' });

export type WikiEditLockStateResponse = z.infer<typeof WikiEditLockStateSchema>;

export function toWikiEditLockStateResponse(
  lock: WikiEditLock | null,
  actorUserId: string,
): WikiEditLockStateResponse {
  if (!lock) {
    return {
      locked: false,
      ownedByActor: false,
      lockedBy: null,
      acquiredAt: null,
      expiresAt: null,
    };
  }

  return {
    locked: true,
    ownedByActor: lock.lockedByUserId === actorUserId,
    lockedBy: lock.lockedByUserId,
    acquiredAt: lock.acquiredAt.toISOString(),
    expiresAt: lock.expiresAt.toISOString(),
  };
}

export class WikiEditLockStateDto extends createZodDto(
  WikiEditLockStateSchema,
) {}
