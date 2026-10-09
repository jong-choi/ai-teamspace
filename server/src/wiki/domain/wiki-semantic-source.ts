import { wikiDocumentSelectSchema } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod';

import type { z } from 'zod';

export const WikiSemanticSourceSchema = wikiDocumentSelectSchema.pick({
  id: true,
  organizationId: true,
  collectionId: true,
  parentDocumentId: true,
  title: true,
  position: true,
  contentMarkdown: true,
  updatedAt: true,
});
export type WikiSemanticSource = z.infer<typeof WikiSemanticSourceSchema>;
