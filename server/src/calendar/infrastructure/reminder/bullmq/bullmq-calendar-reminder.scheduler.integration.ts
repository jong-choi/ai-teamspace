import {
  CALENDAR_REMINDER_JOB,
  CALENDAR_REMINDER_QUEUE,
  calendarReminderJobId,
} from '#server-source/calendar/domain/calendar-reminder';
import type { Meeting } from '#server-source/calendar/domain/meeting';
import { BullMqCalendarReminderScheduler } from '#server-source/calendar/infrastructure/reminder/bullmq/bullmq-calendar-reminder.scheduler';
import { parseQueueEnvironment } from '#server-source/config/runtime-environment';
import type { DatabaseService } from '#server-source/database/database.service';
import { createProducerRedisOptions } from '#server-source/queue/queue.config';

import { Queue } from 'bullmq';

const meetingId = '99999999-9999-4999-8999-999999999999';

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: meetingId,
    organizationId: 'organization-a',
    projectId: null,
    organizerUserId: 'organizer-user',
    title: '리마인더 통합 회의',
    category: 'team',
    startAt: new Date(Date.now() + 60 * 60 * 1_000),
    endAt: new Date(Date.now() + 2 * 60 * 60 * 1_000),
    timeZone: 'Asia/Seoul',
    locationType: 'online',
    meetingRoomId: null,
    locationText: null,
    agendaMarkdown: '',
    notesMarkdown: '',
    reminderMinutes: 15,
    iCalUid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    iCalSequence: 0,
    recurrenceSeriesId: null,
    recurrenceOriginalStartAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    canceledAt: null,
    canceledByUserId: null,
    cancelReason: null,
    ...overrides,
  };
}

describe('캘린더 BullMQ reminder scheduler 통합', () => {
  const { BULLMQ_PREFIX, REDIS_QUEUE_URL } = parseQueueEnvironment();
  let queue: Queue;
  let scheduler: BullMqCalendarReminderScheduler;

  beforeAll(async () => {
    queue = new Queue(CALENDAR_REMINDER_QUEUE, {
      connection: createProducerRedisOptions(REDIS_QUEUE_URL),
      prefix: BULLMQ_PREFIX,
    });
    await queue.waitUntilReady();
    scheduler = new BullMqCalendarReminderScheduler(
      queue,
      {} as DatabaseService,
    );
  });

  beforeEach(async () => {
    const existing = await queue.getJob(calendarReminderJobId(meetingId));
    if (existing) await existing.remove();
  });

  afterAll(async () => {
    await scheduler.cancel([meetingId]);
    await queue.close();
  });

  it('실제 Redis에 delayed reminder job을 예약하고 취소한다', async () => {
    const item = meeting();

    await scheduler.sync([item]);

    const scheduled = await queue.getJob(calendarReminderJobId(item.id));
    expect(scheduled).toBeDefined();
    expect(scheduled?.name).toBe(CALENDAR_REMINDER_JOB);
    expect(scheduled?.data).toEqual({
      organizationId: item.organizationId,
      meetingId: item.id,
      startAt: item.startAt.toISOString(),
    });
    expect(await scheduled?.getState()).toBe('delayed');

    await scheduler.cancel([item.id]);
    await expect(
      queue.getJob(calendarReminderJobId(item.id)),
    ).resolves.toBeUndefined();
  });
});
