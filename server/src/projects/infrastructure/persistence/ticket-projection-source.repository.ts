import type { TicketProjectionSource } from '@/projects/domain/ticket-projection-source';

export abstract class TicketProjectionSourceRepository {
  abstract current(
    organizationId: string,
    sourceId: string,
  ): Promise<TicketProjectionSource | null>;
  abstract listIds(
    organizationId: string,
    afterId: string | null,
    limit: number,
  ): Promise<Pick<TicketProjectionSource, 'id'>[]>;
}
