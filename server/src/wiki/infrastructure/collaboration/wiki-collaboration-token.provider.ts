export const WIKI_COLLABORATION_TOKEN_TYPE = 'wiki-collaboration' as const;

export type WikiCollaborationTokenClaims = {
  userId: string;
  organizationId: string;
  documentId: string;
  tokenId: string;
};

export type WikiCollaborationIssuedToken = {
  token: string;
  expiresAt: Date;
};

export type WikiCollaborationVerifiedToken = WikiCollaborationTokenClaims & {
  expiresAt: Date;
};

export abstract class WikiCollaborationTokenProvider {
  abstract issue(
    claims: WikiCollaborationTokenClaims,
  ): Promise<WikiCollaborationIssuedToken>;

  abstract verify(token: string): Promise<WikiCollaborationVerifiedToken>;
}
