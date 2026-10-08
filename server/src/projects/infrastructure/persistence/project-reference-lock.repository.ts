export abstract class ProjectReferenceLockRepository {
  abstract lockProject(organizationId: string, id: string): Promise<boolean>;
  abstract lockTicket(organizationId: string, id: string): Promise<boolean>;
}
