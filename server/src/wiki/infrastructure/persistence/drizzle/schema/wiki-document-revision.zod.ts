import { wikiDocumentRevision } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.schema';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const wikiDocumentRevisionSelectSchema =
  createSelectSchema(wikiDocumentRevision);
export const wikiDocumentRevisionInsertSchema =
  createInsertSchema(wikiDocumentRevision);
