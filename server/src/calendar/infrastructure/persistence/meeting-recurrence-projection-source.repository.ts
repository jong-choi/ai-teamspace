import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';

export abstract class MeetingRecurrenceProjectionSourceRepository {
  abstract current(
    organizationId: string,
    sourceId: string,
  ): Promise<MeetingRecurrenceSeries | null>;
  abstract listIds(
    organizationId: string,
    afterId: string | null,
    limit: number,
  ): Promise<Pick<MeetingRecurrenceSeries, 'id'>[]>;
}
