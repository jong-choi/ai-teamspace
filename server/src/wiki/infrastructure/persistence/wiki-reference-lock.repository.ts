export abstract class WikiReferenceLockRepository {
  abstract lockDocument(organizationId: string, id: string): Promise<boolean>;
  abstract lockDocumentVersion(
    organizationId: string,
    id: string,
  ): Promise<{ updatedAt: Date } | null>;
}
