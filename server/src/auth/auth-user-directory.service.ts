import { Injectable } from '@nestjs/common';

import {
  AuthUserDirectory,
  type AuthUserIdentity,
} from '#server/auth/infrastructure/user-directory/auth-user-directory.provider.js';

export type { AuthUserIdentity } from '#server/auth/infrastructure/user-directory/auth-user-directory.provider.js';

@Injectable()
export class AuthUserDirectoryService {
  constructor(private readonly directory: AuthUserDirectory) {}

  resolveExactUsername(username: string): Promise<AuthUserIdentity | null> {
    return this.directory.resolveExactUsername(username);
  }

  findByIds(userIds: readonly string[]): Promise<AuthUserIdentity[]> {
    return this.directory.findByIds(userIds);
  }
}
