import { Injectable } from '@nestjs/common';

import type { Auth } from '#server/auth/auth.js';
import {
  AuthUserDirectory,
  type AuthUserIdentity,
} from '#server/auth/infrastructure/user-directory/auth-user-directory.provider.js';

import { AuthService } from '@thallesp/nestjs-better-auth';

const userProjection = ['id', 'email', 'name', 'username', 'image'];

@Injectable()
export class BetterAuthUserDirectory extends AuthUserDirectory {
  constructor(private readonly auth: AuthService<Auth>) {
    super();
  }

  async resolveExactUsername(
    username: string,
  ): Promise<AuthUserIdentity | null> {
    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername) {
      return null;
    }

    const { adapter } = await this.auth.instance.$context;
    return adapter.findOne<AuthUserIdentity>({
      model: 'user',
      where: [{ field: 'username', value: normalizedUsername }],
      select: userProjection,
    });
  }

  async findByIds(userIds: readonly string[]): Promise<AuthUserIdentity[]> {
    if (userIds.length === 0) {
      return [];
    }

    const { adapter } = await this.auth.instance.$context;
    return adapter.findMany<AuthUserIdentity>({
      model: 'user',
      where: [{ field: 'id', operator: 'in', value: [...new Set(userIds)] }],
      select: userProjection,
    });
  }

  async findByEmails(emails: readonly string[]): Promise<AuthUserIdentity[]> {
    if (emails.length === 0) {
      return [];
    }

    const normalizedEmails = [
      ...new Set(emails.map((email) => email.toLowerCase())),
    ];
    const { adapter } = await this.auth.instance.$context;
    return adapter.findMany<AuthUserIdentity>({
      model: 'user',
      where: [{ field: 'email', operator: 'in', value: normalizedEmails }],
      select: userProjection,
    });
  }
}
