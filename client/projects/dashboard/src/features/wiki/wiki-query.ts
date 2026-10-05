import {
  useOrganizationsControllerGetActiveSuspense,
  useWikiControllerGetDocumentSuspense,
  useWikiControllerGetTreeSuspense,
} from '@repo/client/api-client';
import type {
  OrganizationAccess,
  WikiDocument,
  WikiTree,
} from '@repo/client/api-client/schemas';

export function useActiveOrganization() {
  return useOrganizationsControllerGetActiveSuspense<OrganizationAccess | null>(
    {
      query: {
        select: (response) => response.activeOrganization,
      },
    },
  );
}

export function useWikiTree(organizationId: string) {
  return useWikiControllerGetTreeSuspense<WikiTree>(organizationId);
}

export function useWikiDocument(organizationId: string, documentId: string) {
  return useWikiControllerGetDocumentSuspense<WikiDocument>(
    organizationId,
    documentId,
  );
}
