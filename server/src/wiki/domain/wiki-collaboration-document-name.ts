import { WikiCollaborationInvalidDocumentNameError } from '#server/wiki/domain/wiki.error.js';

import { z } from 'zod';

const organizationIdSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('.'));
const documentIdSchema = z.string().uuid();

export type WikiCollaborationDocumentScope = {
  organizationId: string;
  documentId: string;
};

export function buildWikiCollaborationDocumentName(
  scope: WikiCollaborationDocumentScope,
): string {
  return `wiki.${organizationIdSchema.parse(scope.organizationId)}.${documentIdSchema.parse(scope.documentId)}`;
}

export function parseWikiCollaborationDocumentName(
  documentName: string,
): WikiCollaborationDocumentScope {
  const parts = documentName.split('.');
  if (parts.length !== 3 || parts[0] !== 'wiki') {
    throw new WikiCollaborationInvalidDocumentNameError();
  }
  const organizationId = organizationIdSchema.safeParse(parts[1]);
  const documentId = documentIdSchema.safeParse(parts[2]);
  if (!organizationId.success || !documentId.success) {
    throw new WikiCollaborationInvalidDocumentNameError();
  }
  return {
    organizationId: organizationId.data,
    documentId: documentId.data,
  };
}
