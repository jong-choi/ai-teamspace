import { Injectable } from '@nestjs/common';

import {
  AuthUserDirectory,
  type AuthUserIdentity,
} from '@/auth/infrastructure/user-directory/auth-user-directory.provider';

export type { AuthUserIdentity } from '@/auth/infrastructure/user-directory/auth-user-directory.provider';

@Injectable()
export class AuthUserDirectoryService {
  constructor(private readonly directory: AuthUserDirectory) {}

  resolveExactUsername(username: string): Promise<AuthUserIdentity | null> {
    return this.directory.resolveExactUsername(username);
  }

  findByIds(userIds: readonly string[]): Promise<AuthUserIdentity[]> {
    return this.directory.findByIds(userIds);
  }

  findByEmails(emails: readonly string[]): Promise<AuthUserIdentity[]> {
    return this.directory.findByEmails(emails);
  }
}
