import { Injectable } from '@nestjs/common';

import { MembershipLockRepository } from '@/auth/infrastructure/persistence/membership-lock.repository';

@Injectable()
export class AuthMembershipLockService {
  constructor(private readonly repository: MembershipLockRepository) {}
  lockRole(organizationId: string, userId: string) {
    return this.repository.lockRole(organizationId, userId);
  }
}
