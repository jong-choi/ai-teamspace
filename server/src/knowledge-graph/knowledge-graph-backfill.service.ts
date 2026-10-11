import { Injectable } from '@nestjs/common';

import { ProjectionDeliveryRepository } from '@/knowledge-graph/infrastructure/persistence/projection-delivery.repository';
import { TeamspaceSourceProvider } from '@/knowledge-graph/infrastructure/source/teamspace-source.provider';

export type KnowledgeGraphBackfillKind = Parameters<
  TeamspaceSourceProvider['listIds']
>[0];

@Injectable()
export class KnowledgeGraphBackfillService {
  constructor(
    private readonly sources: TeamspaceSourceProvider,
    private readonly delivery: ProjectionDeliveryRepository,
  ) {}

  async enqueueSourceBatch(
    kind: KnowledgeGraphBackfillKind,
    organizationId: string,
    afterId: string | null,
    requestedLimit = 100,
  ) {
    const rows = await this.sources.listIds(
      kind,
      organizationId,
      afterId,
      normalizeLimit(requestedLimit),
    );
    if (!(await this.delivery.initializeBatch(kind, organizationId, rows))) {
      throw new Error('초기 그래프 접수의 소유권을 확인하지 못했습니다.');
    }
    return { count: rows.length, nextCursor: rows.at(-1)?.id ?? null };
  }

  async requeueUnapplied(requestedLimit = 100): Promise<number> {
    return this.delivery.requeuePendingBatch(normalizeLimit(requestedLimit));
  }
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value))
    throw new Error('그래프 배치 크기는 유한한 숫자여야 합니다.');
  return Math.min(Math.max(Math.trunc(value), 1), 500);
}
