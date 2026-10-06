import { wikiDocumentSelectSchema } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod';

import { z } from 'zod';

export const WikiDocumentCollaborationStateSchema = wikiDocumentSelectSchema
  .pick({
    id: true,
    organizationId: true,
    contentMarkdown: true,
    collaborationState: true,
    collaborationSchemaVersion: true,
    collaborationPersistedAt: true,
  })
  .meta({ id: 'WikiDocumentCollaborationState' });

export type WikiDocumentCollaborationState = z.infer<
  typeof WikiDocumentCollaborationStateSchema
>;
