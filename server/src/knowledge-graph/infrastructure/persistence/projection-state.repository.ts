import {
  OutboxAggregateEventSchema,
  OutboxAggregateVersionSchema,
} from '@/outbox/outbox-aggregate-event.schema';

import type { z } from 'zod';

export abstract class ProjectionStateRepository {
  abstract parseEvent(raw: unknown): z.infer<typeof OutboxAggregateEventSchema>;
  abstract current(
    organizationId: string,
    kind: z.infer<typeof OutboxAggregateVersionSchema>['aggregateKind'],
    id: string,
  ): Promise<z.infer<typeof OutboxAggregateVersionSchema> | null>;
  abstract listUnapplied(
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
