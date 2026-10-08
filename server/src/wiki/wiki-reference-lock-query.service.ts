import { Injectable } from '@nestjs/common';

import { WikiReferenceLockRepository } from '@/wiki/infrastructure/persistence/wiki-reference-lock.repository';
@Injectable()
export class WikiReferenceLockQueryService {
  constructor(private readonly repository: WikiReferenceLockRepository) {}
  lockDocument(organizationId: string, id: string) {
    return this.repository.lockDocument(organizationId, id);
  }
}
