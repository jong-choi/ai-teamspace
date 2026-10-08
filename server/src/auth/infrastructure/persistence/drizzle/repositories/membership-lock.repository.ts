import { Injectable } from '@nestjs/common';

import {
  member,
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { MembershipLockRepository } from '@/auth/infrastructure/persistence/membership-lock.repository';
import { DatabaseService } from '@/database/database.service';

import { and, eq } from 'drizzle-orm';

@Injectable()
export class MembershipLockDrizzleRepository extends MembershipLockRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }
  async lockRole(organizationId: string, userId: string) {
    const transaction = this.database.requireTransaction();
    const [actor] = await transaction
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for('key share');
    if (!actor) return null;
    const [scope] = await transaction
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .for('key share');
    if (!scope) return null;
    const [membership] = await transaction
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, userId),
        ),
      )
      .for('share');
    return membership?.role ?? null;
  }
}
