import { Inject, Injectable } from '@nestjs/common';

import {
  AuthUserDirectoryService,
  type AuthUserIdentity,
} from '@/auth/auth-user-directory.service';

type ProjectUserDirectory = Pick<AuthUserDirectoryService, 'findByIds'>;

@Injectable()
export class ProjectUserResolver {
  constructor(
    @Inject(AuthUserDirectoryService)
    private readonly userDirectory: ProjectUserDirectory,
  ) {}

  async findByIds(
    userIds: readonly string[],
  ): Promise<Map<string, AuthUserIdentity>> {
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) {
      return new Map();
    }
    const users = await this.userDirectory.findByIds(uniqueUserIds);
    return new Map(users.map((user) => [user.id, user]));
  }
}
