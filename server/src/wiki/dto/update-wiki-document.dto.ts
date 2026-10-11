import { createZodDto } from '@/common/dto/create-zod-dto';
import { WikiContentEditSchema } from '@/wiki/domain/wiki-content-edit';
import { wikiDocumentUpdateSchema } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod';

import { z } from 'zod';

export const UpdateWikiDocumentSchema = z
  .object({
    parentDocumentId:
      wikiDocumentUpdateSchema.shape.parentDocumentId.optional(),
    title: wikiDocumentUpdateSchema.shape.title.optional(),
    position: wikiDocumentUpdateSchema.shape.position.optional(),
    contentEdit: WikiContentEditSchema.optional(),
  })
  .refine(
    (input) =>
      input.parentDocumentId !== undefined ||
      input.title !== undefined ||
      input.position !== undefined ||
      input.contentEdit !== undefined,
    '수정할 위키 문서 metadata 또는 본문 수정이 필요합니다.',
  )
  .meta({ id: 'UpdateWikiDocument' });

export type UpdateWikiDocumentInput = z.infer<typeof UpdateWikiDocumentSchema>;

export class UpdateWikiDocumentDto extends createZodDto(
  UpdateWikiDocumentSchema,
) {}
