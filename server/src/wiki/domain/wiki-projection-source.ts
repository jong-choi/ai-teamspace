import { wikiDocumentSelectSchema } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.zod';

import type { z } from 'zod';

export const WikiProjectionSourceSchema = wikiDocumentSelectSchema.pick({
  id: true,
  organizationId: true,
  collectionId: true,
  parentDocumentId: true,
  title: true,
  position: true,
  updatedAt: true,
});
export type WikiProjectionSource = z.infer<typeof WikiProjectionSourceSchema>;
