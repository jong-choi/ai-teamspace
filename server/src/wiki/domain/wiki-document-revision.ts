import { wikiDocumentRevisionSelectSchema } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.zod.js';

import { z } from 'zod';

export const WikiDocumentRevisionSchema = wikiDocumentRevisionSelectSchema.meta(
  {
    id: 'WikiDocumentRevisionDomain',
  },
);

export type WikiDocumentRevision = z.infer<typeof WikiDocumentRevisionSchema>;
export type WikiDocumentRevisionSummary = Omit<
  WikiDocumentRevision,
  'contentMarkdown'
>;
