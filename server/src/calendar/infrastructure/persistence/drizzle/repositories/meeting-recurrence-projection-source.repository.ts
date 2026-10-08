import { Injectable } from '@nestjs/common';

import { toMeetingRecurrenceSeriesDomain } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting-recurrence-series.mapper';
import { meetingRecurrenceSeries } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.schema';
import { MeetingRecurrenceProjectionSourceRepository } from '@/calendar/infrastructure/persistence/meeting-recurrence-projection-source.repository';
import { DatabaseService } from '@/database/database.service';

import { and, asc, eq, gt } from 'drizzle-orm';

@Injectable()
export class MeetingRecurrenceProjectionSourceDrizzleRepository extends MeetingRecurrenceProjectionSourceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }
  async current(organizationId: string, sourceId: string) {
    const [row] = await this.database.db
      .select()
      .from(meetingRecurrenceSeries)
      .where(
        and(
          eq(meetingRecurrenceSeries.organizationId, organizationId),
          eq(meetingRecurrenceSeries.id, sourceId),
        ),
      )
      .limit(1);
    return row ? toMeetingRecurrenceSeriesDomain(row) : null;
  }
  async listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.database.db
      .select({ id: meetingRecurrenceSeries.id })
      .from(meetingRecurrenceSeries)
      .where(
        and(
          eq(meetingRecurrenceSeries.organizationId, organizationId),
          afterId ? gt(meetingRecurrenceSeries.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(meetingRecurrenceSeries.id))
      .limit(limit);
  }
}
