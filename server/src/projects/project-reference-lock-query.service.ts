import { Injectable } from '@nestjs/common';

import { ProjectReferenceLockRepository } from '@/projects/infrastructure/persistence/project-reference-lock.repository';
@Injectable()
export class ProjectReferenceLockQueryService {
  constructor(private readonly repository: ProjectReferenceLockRepository) {}
  lockProject(organizationId: string, id: string) {
    return this.repository.lockProject(organizationId, id);
  }
  lockTicket(organizationId: string, id: string) {
    return this.repository.lockTicket(organizationId, id);
  }
}
