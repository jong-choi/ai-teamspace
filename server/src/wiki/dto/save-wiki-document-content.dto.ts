import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { WikiDocumentSchema } from '#server/wiki/dto/wiki-document.dto.js';
import { wikiDocumentSelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod.js';

import { z } from 'zod';

export const SaveWikiDocumentContentSchema = z
  .object({
    contentMarkdown: wikiDocumentSelectSchema.shape.contentMarkdown,
    baseRevision: wikiDocumentSelectSchema.shape.revision.int().min(1),
  })
  .meta({ id: 'SaveWikiDocumentContent' });

export type SaveWikiDocumentContentInput = z.infer<
  typeof SaveWikiDocumentContentSchema
>;

export const WikiDocumentSaveResultSchema = z
  .object({
    status: z.enum(['saved', 'conflict-copy-created']),
    conflictCopyCreated: z.boolean(),
    document: WikiDocumentSchema,
    conflictCopy: WikiDocumentSchema.nullable(),
  })
  .meta({ id: 'WikiDocumentSaveResult' });

export type WikiDocumentSaveResultResponse = z.infer<
  typeof WikiDocumentSaveResultSchema
>;

export class SaveWikiDocumentContentDto extends createZodDto(
  SaveWikiDocumentContentSchema,
) {}

export class WikiDocumentSaveResultDto extends createZodDto(
  WikiDocumentSaveResultSchema,
) {}
