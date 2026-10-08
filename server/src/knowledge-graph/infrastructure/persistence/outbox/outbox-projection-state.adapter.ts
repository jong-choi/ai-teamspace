import { Injectable } from '@nestjs/common';

import { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import {
  OutboxAggregateEventSchema,
  OutboxAggregateVersionSchema,
} from '@/outbox/outbox-aggregate-event.schema';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
@Injectable()
export class OutboxProjectionStateAdapter extends ProjectionStateRepository {
  constructor(private readonly state: OutboxAggregateProjectionState) {
    super();
  }
  parseEvent(raw: unknown) {
    return OutboxAggregateEventSchema.parse(raw);
  }
  async current(
    organizationId: string,
    kind: Parameters<ProjectionStateRepository['current']>[1],
    id: string,
  ) {
    const row = await this.state.current(organizationId, kind, id);
    return row ? OutboxAggregateVersionSchema.parse(row) : null;
  }
  async listUnapplied(limit: number) {
    return OutboxAggregateVersionSchema.array().parse(
      await this.state.listUnapplied(limit),
    );
  }
  markApplying(
    organizationId: string,
    kind: Parameters<ProjectionStateRepository['current']>[1],
    id: string,
    version: number,
  ) {
    return this.state.markApplying(organizationId, kind, id, version);
  }
  markApplied(
    organizationId: string,
    kind: Parameters<ProjectionStateRepository['current']>[1],
    id: string,
    version: number,
  ) {
    return this.state.markApplied(organizationId, kind, id, version);
  }
  markFailed(
    organizationId: string,
    kind: Parameters<ProjectionStateRepository['current']>[1],
    id: string,
    version: number,
  ) {
    return this.state.markFailed(organizationId, kind, id, version);
  }
  markTerminalFailed(
    organizationId: string,
    kind: Parameters<ProjectionStateRepository['current']>[1],
    id: string,
    version: number,
  ) {
    return this.state.markTerminalFailed(organizationId, kind, id, version);
  }
}
