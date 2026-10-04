export type ChatDirectoryUser = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
};

export abstract class ChatUserDirectory {
  abstract resolveExactUsername(
    username: string,
  ): Promise<ChatDirectoryUser | null>;

  abstract findByIds(userIds: readonly string[]): Promise<ChatDirectoryUser[]>;
}
