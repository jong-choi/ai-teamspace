import {
  CALENDAR_REMINDER_JOB,
  calendarReminderJobId,
} from '@/calendar/domain/calendar-reminder';
import type { Meeting } from '@/calendar/domain/meeting';
import { BullMqCalendarReminderScheduler } from '@/calendar/infrastructure/reminder/bullmq/bullmq-calendar-reminder.scheduler';

import { jest } from '@jest/globals';

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

type ReminderQueue = ConstructorParameters<
  typeof BullMqCalendarReminderScheduler
>[0];
type ReminderJob = NonNullable<Awaited<ReturnType<ReminderQueue['getJob']>>>;

class ReconciliationTestScheduler extends BullMqCalendarReminderScheduler {
  constructor(
    queue: ReminderQueue,
    private readonly meetings: readonly Meeting[],
  ) {
    super(queue, undefined);
  }

  protected override async loadFutureReminderMeetings(
    _now: Date,
    offset: number,
  ): Promise<Meeting[]> {
    return offset === 0 ? [...this.meetings] : [];
  }
}

describe('캘린더 BullMQ reminder scheduler', () => {
  const now = new Date('2026-10-07T00:00:00.000Z').getTime();
  let getJob: jest.MockedFunction<ReminderQueue['getJob']>;
  let add: jest.MockedFunction<ReminderQueue['add']>;
  let queue: ReminderQueue;
  let scheduler: BullMqCalendarReminderScheduler;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    getJob = jest.fn<ReminderQueue['getJob']>();
    add = jest.fn<ReminderQueue['add']>();
    queue = { getJob, add };
    scheduler = new BullMqCalendarReminderScheduler(queue, undefined);
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

  test('같은 Meeting을 반복 동기화하면 안정적인 job id로 기존 job을 제거하고 하나만 다시 예약한다', async () => {
    const remove = jest
      .fn<ReminderJob['remove']>()
      .mockResolvedValue(undefined);
    getJob.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ remove });
    const item = meeting({
      startAt: new Date('2026-10-07T03:00:00.000Z'),
    });

    await scheduler.sync([item]);
    await scheduler.sync([item]);

    expect(getJob).toHaveBeenNthCalledWith(1, calendarReminderJobId(item.id));
    expect(getJob).toHaveBeenNthCalledWith(2, calendarReminderJobId(item.id));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenLastCalledWith(
      CALENDAR_REMINDER_JOB,
      expect.any(Object),
      expect.objectContaining({
        jobId: calendarReminderJobId(item.id),
        delay: 170 * 60 * 1_000,
      }),
    );
  });

  test('reminder가 없거나 취소된 Meeting은 기존 job만 정리하고 새로 예약하지 않는다', async () => {
    const remove = jest
      .fn<ReminderJob['remove']>()
      .mockResolvedValue(undefined);
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

  test('startup reconciliation은 미래의 활성 reminder를 다시 예약한다', async () => {
    const item = meeting({
      startAt: new Date('2026-10-07T04:00:00.000Z'),
    });
    scheduler = new ReconciliationTestScheduler(queue, [item]);

    await scheduler.onModuleInit();

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      CALENDAR_REMINDER_JOB,
      expect.objectContaining({ meetingId: item.id }),
      expect.objectContaining({ jobId: calendarReminderJobId(item.id) }),
    );
  });

  test('startup reconciliation은 취소되었거나 reminder가 없는 Meeting을 재등록하지 않는다', async () => {
    scheduler = new ReconciliationTestScheduler(queue, [
      meeting({ reminderMinutes: null }),
      meeting({
        id: '22222222-2222-4222-8222-222222222222',
        canceledAt: new Date('2026-10-06T23:00:00.000Z'),
        canceledByUserId: 'organizer-user',
      }),
    ]);

    await scheduler.onModuleInit();

    expect(add).not.toHaveBeenCalled();
  });

  test('cancel은 중복 Meeting id를 dedupe해서 reminder job을 제거한다', async () => {
    const remove = jest
      .fn<ReminderJob['remove']>()
      .mockResolvedValue(undefined);
    getJob.mockResolvedValue({ remove });
    const meetingId = meeting().id;

    await scheduler.cancel([meetingId, meetingId]);

    expect(getJob).toHaveBeenCalledTimes(1);
    expect(getJob).toHaveBeenCalledWith(calendarReminderJobId(meetingId));
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
