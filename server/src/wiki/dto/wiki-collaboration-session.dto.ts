import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const WikiCollaborationSessionSchema = z
  .object({
    token: z.string().min(1),
    expiresAt: z.string().datetime(),
    webSocketUrl: z.string().url(),
    documentName: z.string().min(1),
    protocolVersion: z.number().int().positive(),
  })
  .meta({ id: 'WikiCollaborationSession' });

export type WikiCollaborationSessionResponse = z.infer<
  typeof WikiCollaborationSessionSchema
>;

export class WikiCollaborationSessionDto extends createZodDto(
  WikiCollaborationSessionSchema,
) {}
