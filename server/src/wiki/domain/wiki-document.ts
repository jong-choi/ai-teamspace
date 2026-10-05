import { wikiDocumentSelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod.js';
import { wikiEntrySelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.zod.js';

import { z } from 'zod';

export const WikiDocumentSchema = z
  .object({
    id: wikiEntrySelectSchema.shape.id,
    organizationId: wikiEntrySelectSchema.shape.organizationId,
    folderId: wikiEntrySelectSchema.shape.parentFolderId,
    title: wikiEntrySelectSchema.shape.name,
    contentMarkdown: wikiDocumentSelectSchema.shape.contentMarkdown,
    revision: wikiDocumentSelectSchema.shape.revision,
    createdByUserId: wikiEntrySelectSchema.shape.createdByUserId,
    updatedByUserId: wikiDocumentSelectSchema.shape.updatedByUserId,
    createdAt: wikiEntrySelectSchema.shape.createdAt,
    updatedAt: wikiEntrySelectSchema.shape.updatedAt,
  })
  .meta({ id: 'WikiDocumentDomain' });

export type WikiDocument = z.infer<typeof WikiDocumentSchema>;
export type WikiDocumentSummary = Omit<WikiDocument, 'contentMarkdown'>;
