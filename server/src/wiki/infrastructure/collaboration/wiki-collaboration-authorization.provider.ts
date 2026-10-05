export type WikiCollaborationAuthorization = {
  userId: string;
  userName: string;
  canRead: boolean;
  canWrite: boolean;
};

export abstract class WikiCollaborationAuthorizationProvider {
  abstract authorize(
    userId: string,
    organizationId: string,
  ): Promise<WikiCollaborationAuthorization | null>;
}
