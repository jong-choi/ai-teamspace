export type WikiRefreshAcceptance =
  | {
      outcome: 'accepted';
      requestId: string;
      manualRequestSeq: number;
      coalesced: boolean;
      acceptedAt: Date;
      sourceUpdatedAt: Date;
    }
  | { outcome: 'not_found' }
  | { outcome: 'forbidden' };

export abstract class WikiRefreshAcceptanceRepository {
  abstract accept(
    organizationId: string,
    documentId: string,
    actorUserId: string,
  ): Promise<WikiRefreshAcceptance>;
}
