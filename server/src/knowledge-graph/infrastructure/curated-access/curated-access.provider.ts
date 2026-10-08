import type { CuratedEdge } from '@/knowledge-graph/domain/curated-graph';
export abstract class CuratedAccessProvider {
  abstract lockWriteAccess(
    organizationId: string,
    actorUserId: string,
  ): Promise<boolean>;
  abstract lockEndpoint(
    organizationId: string,
    kind: CuratedEdge['sourceNodeKind'],
    id: string,
  ): Promise<boolean>;
}
