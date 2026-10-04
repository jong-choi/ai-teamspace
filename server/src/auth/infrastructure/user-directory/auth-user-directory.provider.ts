export type AuthUserIdentity = {
  id: string;
  email: string;
  name: string;
  username: string | null;
  image: string | null;
};

export abstract class AuthUserDirectory {
  abstract resolveExactUsername(
    username: string,
  ): Promise<AuthUserIdentity | null>;

  abstract findByIds(userIds: readonly string[]): Promise<AuthUserIdentity[]>;

  abstract findByEmails(emails: readonly string[]): Promise<AuthUserIdentity[]>;
}
