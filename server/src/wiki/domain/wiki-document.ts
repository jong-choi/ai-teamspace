import { wikiDocumentSelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod.js';

import { z } from 'zod';

export const WikiDocumentSchema = wikiDocumentSelectSchema
  .omit({
    collaborationState: true,
    collaborationSchemaVersion: true,
    collaborationPersistedAt: true,
  })
  .meta({ id: 'WikiDocumentDomain' });

export const WikiDocumentSummarySchema = WikiDocumentSchema.omit({
  contentMarkdown: true,
});

export type WikiDocument = z.infer<typeof WikiDocumentSchema>;
export type WikiDocumentSummary = z.infer<typeof WikiDocumentSummarySchema>;
