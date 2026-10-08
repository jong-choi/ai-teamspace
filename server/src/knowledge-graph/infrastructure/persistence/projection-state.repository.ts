import {
  OutboxAggregateEventSchema,
  OutboxAggregateVersionSchema,
} from '@/outbox/outbox-aggregate-event.schema';
import type { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';

import type { z } from 'zod';

export abstract class ProjectionStateRepository {
  abstract recoveryStats(): Promise<
    Awaited<ReturnType<OutboxAggregateProjectionState['recoveryStats']>>
  >;
  abstract parseEvent(raw: unknown): z.infer<typeof OutboxAggregateEventSchema>;
  abstract current(
    organizationId: string,
    kind: z.infer<typeof OutboxAggregateVersionSchema>['aggregateKind'],
    id: string,
  ): Promise<z.infer<typeof OutboxAggregateVersionSchema> | null>;
  abstract listMembershipObservationBatch(
    cursor: Pick<
      z.infer<typeof OutboxAggregateVersionSchema>,
      'organizationId' | 'aggregateId'
    > | null,
    limit: number,
  ): Promise<z.infer<typeof OutboxAggregateVersionSchema>[]>;
  abstract listTrackedOrganizationIds(
    afterOrganizationId: string | null,
    limit: number,
  ): Promise<string[]>;
  abstract listLiveSourcesForOrganization(
    organizationId: string,
    cursor: Pick<
      z.infer<typeof OutboxAggregateVersionSchema>,
      'aggregateKind' | 'aggregateId'
    > | null,
    limit: number,
  ): Promise<z.infer<typeof OutboxAggregateVersionSchema>[]>;
  abstract markApplying(
    organizationId: string,
    kind: z.infer<typeof OutboxAggregateVersionSchema>['aggregateKind'],
    id: string,
    version: number,
  ): Promise<void>;
  abstract markApplied(
    organizationId: string,
    kind: z.infer<typeof OutboxAggregateVersionSchema>['aggregateKind'],
    id: string,
    version: number,
    snapshotDigest: NonNullable<
      z.infer<typeof OutboxAggregateVersionSchema>['appliedSnapshotDigest']
    >,
  ): Promise<void>;
  abstract markFailed(
    organizationId: string,
    kind: z.infer<typeof OutboxAggregateVersionSchema>['aggregateKind'],
    id: string,
    version: number,
  ): Promise<void>;
  abstract markTerminalFailed(
    organizationId: string,
    kind: z.infer<typeof OutboxAggregateVersionSchema>['aggregateKind'],
    id: string,
    version: number,
  ): Promise<void>;
}
