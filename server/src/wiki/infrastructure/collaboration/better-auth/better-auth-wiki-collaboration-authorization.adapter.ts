import { Injectable } from '@nestjs/common';

import type { Auth } from '#server/auth/auth.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';
import {
  type WikiCollaborationAuthorization,
  WikiCollaborationAuthorizationProvider,
} from '#server/wiki/infrastructure/collaboration/wiki-collaboration-authorization.provider.js';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';

const memberIdentitySchema = z.object({
  userId: z.string().min(1),
  role: OrganizationRoleSchema,
});
const userIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

type MemberIdentity = z.infer<typeof memberIdentitySchema>;
type UserIdentity = z.infer<typeof userIdentitySchema>;

@Injectable()
export class BetterAuthWikiCollaborationAuthorizationAdapter extends WikiCollaborationAuthorizationProvider {
  constructor(private readonly auth: AuthService<Auth>) {
    super();
  }

  async authorize(
    userId: string,
    organizationId: string,
  ): Promise<WikiCollaborationAuthorization | null> {
    const { adapter } = await this.auth.instance.$context;
    const member = await adapter.findOne<MemberIdentity>({
      model: 'member',
      where: [
        { field: 'userId', value: userId },
        { field: 'organizationId', value: organizationId },
      ],
      select: ['userId', 'role'],
    });
    const parsedMember = memberIdentitySchema.safeParse(member);
    if (!parsedMember.success) {
      return null;
    }

    const user = await adapter.findOne<UserIdentity>({
      model: 'user',
      where: [{ field: 'id', value: userId }],
      select: ['id', 'name'],
    });
    const parsedUser = userIdentitySchema.safeParse(user);
    if (!parsedUser.success) {
      return null;
    }

    return {
      userId: parsedUser.data.id,
      userName: parsedUser.data.name,
      canRead: true,
      canWrite: true,
    };
  }
}
