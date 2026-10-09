export abstract class GraphCorrectionWriteRepository {
  abstract runLockedWiki<T>(
    organizationId: string,
    actorUserId: string,
    documentId: string,
    operation: () => Promise<T>,
  ): Promise<{ outcome: 'locked'; value: T } | { outcome: 'not_found' }>;
}
