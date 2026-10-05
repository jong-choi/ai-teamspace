import {
  useOrganizationsControllerGetActiveSuspense,
  useWikiControllerGetDocumentRevisionSuspense,
  useWikiControllerGetDocumentSuspense,
  useWikiControllerGetTreeSuspense,
  useWikiControllerListDocumentHistorySuspense,
} from '@repo/client/api-client';
import type {
  OrganizationAccess,
  WikiDocument,
  WikiDocumentHistory,
  WikiDocumentRevision,
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

export function useWikiDocumentHistory(
  organizationId: string,
  documentId: string,
) {
  return useWikiControllerListDocumentHistorySuspense<WikiDocumentHistory>(
    organizationId,
    documentId,
  );
}

export function useWikiDocumentRevision(
  organizationId: string,
  documentId: string,
  revision: number,
) {
  return useWikiControllerGetDocumentRevisionSuspense<WikiDocumentRevision>(
    organizationId,
    documentId,
    revision,
  );
}
