import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import {
  CALENDAR_REMINDER_JOB,
  CALENDAR_REMINDER_QUEUE,
  calendarReminderJobId,
  CalendarReminderJobSchema,
} from '@/calendar/domain/calendar-reminder';
import type { Meeting } from '@/calendar/domain/meeting';
import { toMeetingDomain } from '@/calendar/infrastructure/persistence/drizzle/mappers/meeting.mapper';
import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import { CalendarReminderScheduler } from '@/calendar/infrastructure/reminder/calendar-reminder-scheduler.provider';
import { DatabaseService } from '@/database/database.service';

import type { Queue } from 'bullmq';
import { and, asc, gt, isNotNull, isNull } from 'drizzle-orm';

const reconciliationBatchSize = 500;

type CalendarReminderJob = Pick<
  NonNullable<Awaited<ReturnType<Queue['getJob']>>>,
  'remove'
>;

type CalendarReminderQueue = {
  getJob: (
    ...args: Parameters<Queue['getJob']>
  ) => Promise<CalendarReminderJob | undefined>;
  add: (...args: Parameters<Queue['add']>) => ReturnType<Queue['add']>;
};

@Injectable()
export class BullMqCalendarReminderScheduler
  extends CalendarReminderScheduler
  implements OnModuleInit
{
  private readonly logger = new Logger(BullMqCalendarReminderScheduler.name);

  constructor(
    @InjectQueue(CALENDAR_REMINDER_QUEUE)
    private readonly queue: CalendarReminderQueue,
    @Inject(DatabaseService)
    private readonly database: DatabaseService | undefined,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.reconcileFutureMeetings();
    } catch (error) {
      this.logger.error(
        '캘린더 reminder startup reconciliation에 실패했습니다.',
        error,
      );
    }
  }

  async sync(meetings: readonly Meeting[]): Promise<void> {
    for (const item of meetings) {
      const jobId = calendarReminderJobId(item.id);
      const existing = await this.queue.getJob(jobId);
      if (existing) await existing.remove();

      if (item.reminderMinutes === null || item.canceledAt !== null) continue;

      const runAt = item.startAt.getTime() - item.reminderMinutes * 60 * 1_000;
      const payload = CalendarReminderJobSchema.parse({
        organizationId: item.organizationId,
        meetingId: item.id,
        startAt: item.startAt.toISOString(),
      });
      await this.queue.add(CALENDAR_REMINDER_JOB, payload, {
        jobId,
        delay: Math.max(0, runAt - Date.now()),
        removeOnComplete: true,
        removeOnFail: 100,
      });
    }
  }

  async cancel(meetingIds: readonly Meeting['id'][]): Promise<void> {
    for (const meetingId of new Set(meetingIds)) {
      const existing = await this.queue.getJob(
        calendarReminderJobId(meetingId),
      );
      if (existing) await existing.remove();
    }
  }

  private async reconcileFutureMeetings(): Promise<void> {
    let offset = 0;
    const now = new Date();
    while (true) {
      const meetings = await this.loadFutureReminderMeetings(now, offset);
      if (meetings.length === 0) break;
      await this.sync(meetings);
      offset += meetings.length;
      if (meetings.length < reconciliationBatchSize) break;
    }
  }

  protected async loadFutureReminderMeetings(
    now: Date,
    offset: number,
  ): Promise<Meeting[]> {
    if (!this.database) {
      throw new Error(
        '캘린더 reminder reconciliation DB가 설정되지 않았습니다.',
      );
    }
    const rows = await this.database.db
      .select()
      .from(meeting)
      .where(
        and(
          gt(meeting.startAt, now),
          isNotNull(meeting.reminderMinutes),
          isNull(meeting.canceledAt),
        ),
      )
      .orderBy(asc(meeting.startAt), asc(meeting.id))
      .limit(reconciliationBatchSize)
      .offset(offset);
    return rows.map(toMeetingDomain);
  }
}
