import { Injectable } from '@nestjs/common';

import type { Auth } from '#server/auth/auth.js';
import {
  type ChatDirectoryUser,
  ChatUserDirectory,
} from '#server/chat/infrastructure/user-directory/user-directory.provider.js';

import { AuthService } from '@thallesp/nestjs-better-auth';

const userProjection = ['id', 'name', 'username', 'image'];

@Injectable()
export class BetterAuthChatUserDirectory extends ChatUserDirectory {
  constructor(private readonly auth: AuthService<Auth>) {
    super();
  }

  async resolveExactUsername(
    username: string,
  ): Promise<ChatDirectoryUser | null> {
    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername) {
      return null;
    }

    const { adapter } = await this.auth.instance.$context;
    return adapter.findOne<ChatDirectoryUser>({
      model: 'user',
      where: [{ field: 'username', value: normalizedUsername }],
      select: userProjection,
    });
  }

  async findByIds(userIds: readonly string[]): Promise<ChatDirectoryUser[]> {
    if (userIds.length === 0) {
      return [];
    }

    const { adapter } = await this.auth.instance.$context;
    return adapter.findMany<ChatDirectoryUser>({
      model: 'user',
      where: [{ field: 'id', operator: 'in', value: [...userIds] }],
      select: userProjection,
    });
  }
}
