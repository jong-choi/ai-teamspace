import {
  CALENDAR_REMINDER_JOB,
  calendarReminderJobId,
} from '@/calendar/domain/calendar-reminder';
import type { Meeting } from '@/calendar/domain/meeting';
import { BullMqCalendarReminderScheduler } from '@/calendar/infrastructure/reminder/bullmq/bullmq-calendar-reminder.scheduler';
import type { DatabaseService } from '@/database/database.service';

import { jest } from '@jest/globals';
import type { Queue } from 'bullmq';

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: 'organization-a',
    projectId: null,
    organizerUserId: 'organizer-user',
    title: '리마인더 회의',
    category: 'team',
    startAt: new Date('2026-10-07T01:00:00.000Z'),
    endAt: new Date('2026-10-07T02:00:00.000Z'),
    timeZone: 'Asia/Seoul',
    locationType: 'online',
    meetingRoomId: null,
    locationText: null,
    agendaMarkdown: '',
    notesMarkdown: '',
    reminderMinutes: 10,
    iCalUid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    iCalSequence: 0,
    recurrenceSeriesId: null,
    recurrenceOriginalStartAt: null,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
    canceledAt: null,
    canceledByUserId: null,
    cancelReason: null,
    ...overrides,
  };
}

type FakeJob = { remove: () => Promise<void> };
type GetJob = (jobId: string) => Promise<FakeJob | undefined>;
type AddJob = (name: string, data: unknown, options: unknown) => Promise<void>;

describe('캘린더 BullMQ reminder scheduler', () => {
  const now = new Date('2026-10-07T00:00:00.000Z').getTime();
  let getJob: jest.MockedFunction<GetJob>;
  let add: jest.MockedFunction<AddJob>;
  let queue: Queue;
  let scheduler: BullMqCalendarReminderScheduler;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    getJob = jest.fn<GetJob>().mockResolvedValue(undefined);
    add = jest.fn<AddJob>().mockResolvedValue(undefined);
    queue = { getJob, add } as unknown as Queue;
    scheduler = new BullMqCalendarReminderScheduler(
      queue,
      {} as DatabaseService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Meeting 시작 전 reminder job을 안정적인 job id로 예약한다', async () => {
    const item = meeting();

    await scheduler.sync([item]);

    expect(getJob).toHaveBeenCalledWith(calendarReminderJobId(item.id));
    expect(add).toHaveBeenCalledWith(
      CALENDAR_REMINDER_JOB,
      {
        organizationId: item.organizationId,
        meetingId: item.id,
        startAt: item.startAt.toISOString(),
      },
      {
        jobId: calendarReminderJobId(item.id),
        delay: 50 * 60 * 1_000,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  });

  test('reschedule 동기화는 기존 reminder를 제거한 뒤 새 job으로 대체한다', async () => {
    const remove = jest.fn<() => Promise<void>>(async () => undefined);
    getJob.mockResolvedValue({ remove });
    const item = meeting({
      startAt: new Date('2026-10-07T03:00:00.000Z'),
    });

    await scheduler.sync([item]);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      CALENDAR_REMINDER_JOB,
      expect.any(Object),
      expect.objectContaining({ delay: 170 * 60 * 1_000 }),
    );
  });

  test('reminder가 없거나 취소된 Meeting은 기존 job만 정리하고 새로 예약하지 않는다', async () => {
    const remove = jest.fn<() => Promise<void>>(async () => undefined);
    getJob.mockResolvedValue({ remove });

    await scheduler.sync([
      meeting({ reminderMinutes: null }),
      meeting({
        id: '22222222-2222-4222-8222-222222222222',
        canceledAt: new Date('2026-10-06T23:00:00.000Z'),
        canceledByUserId: 'organizer-user',
      }),
    ]);

    expect(remove).toHaveBeenCalledTimes(2);
    expect(add).not.toHaveBeenCalled();
  });

  test('cancel은 중복 Meeting id를 dedupe해서 reminder job을 제거한다', async () => {
    const remove = jest.fn<() => Promise<void>>(async () => undefined);
    getJob.mockResolvedValue({ remove });
    const meetingId = meeting().id;

    await scheduler.cancel([meetingId, meetingId]);

    expect(getJob).toHaveBeenCalledTimes(1);
    expect(getJob).toHaveBeenCalledWith(calendarReminderJobId(meetingId));
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
