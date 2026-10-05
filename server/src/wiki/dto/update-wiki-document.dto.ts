import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { wikiDocumentUpdateSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod.js';

import { z } from 'zod';

export const UpdateWikiDocumentSchema = z
  .object({
    parentDocumentId:
      wikiDocumentUpdateSchema.shape.parentDocumentId.optional(),
    title: wikiDocumentUpdateSchema.shape.title.optional(),
    position: wikiDocumentUpdateSchema.shape.position.optional(),
  })
  .refine(
    (input) =>
      input.parentDocumentId !== undefined ||
      input.title !== undefined ||
      input.position !== undefined,
    '수정할 위키 문서 metadata가 필요합니다.',
  )
  .meta({ id: 'UpdateWikiDocument' });

export type UpdateWikiDocumentInput = z.infer<typeof UpdateWikiDocumentSchema>;

export class UpdateWikiDocumentDto extends createZodDto(
  UpdateWikiDocumentSchema,
) {}
