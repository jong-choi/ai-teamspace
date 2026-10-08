export abstract class WikiReferenceLockRepository {
  abstract lockDocument(organizationId: string, id: string): Promise<boolean>;
}
