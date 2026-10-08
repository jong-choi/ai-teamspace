import { Injectable } from '@nestjs/common';

import { ProjectionDeliveryRepository } from '@/knowledge-graph/infrastructure/persistence/projection-delivery.repository';
import { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';

export type KnowledgeGraphBackfillKind = Parameters<
  WorkosSourceProvider['listIds']
>[0];

@Injectable()
export class KnowledgeGraphBackfillService {
  constructor(
    private readonly sources: WorkosSourceProvider,
    private readonly delivery: ProjectionDeliveryRepository,
    private readonly projectionState: ProjectionStateRepository,
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
    await this.delivery.initializeBatch(kind, organizationId, rows);
    return { count: rows.length, nextCursor: rows.at(-1)?.id ?? null };
  }

  async requeueUnapplied(requestedLimit = 100): Promise<number> {
    const sources = await this.projectionState.listUnapplied(
      normalizeLimit(requestedLimit),
    );
    for (const source of sources) await this.delivery.requeue(source);
    return sources.length;
  }
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value))
    throw new Error('그래프 배치 크기는 유한한 숫자여야 합니다.');
  return Math.min(Math.max(Math.trunc(value), 1), 500);
}
