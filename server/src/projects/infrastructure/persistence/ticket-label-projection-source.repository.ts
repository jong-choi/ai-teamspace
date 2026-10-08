import type { TicketLabelProjectionSource } from '@/projects/domain/ticket-label-projection-source';

export abstract class TicketLabelProjectionSourceRepository {
  abstract current(
    organizationId: string,
    sourceId: string,
  ): Promise<TicketLabelProjectionSource | null>;
  abstract listIds(
    organizationId: string,
    afterId: string | null,
    limit: number,
  ): Promise<Pick<TicketLabelProjectionSource, 'id'>[]>;
}
