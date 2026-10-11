import type { CalendarAvailabilityService } from '@/calendar/calendar-availability.service';
import type { CalendarMeetingQueryService } from '@/calendar/calendar-meeting-query.service';
import type { CalendarMeetingRoomService } from '@/calendar/calendar-meeting-room.service';
import type { CalendarParticipationService } from '@/calendar/calendar-participation.service';
import type { CalendarSchedulingService } from '@/calendar/calendar-scheduling.service';
import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { CalendarMcpRegistrar } from '@/mcp/tools/calendar/calendar-mcp.registrar';

const auth: McpAuthContext = {
  authMethod: 'oauth',
  credentialId: null,
  userId: 'user-a',
  clientId: 'client-a',
  scopes: ['calendar:read', 'calendar:write'],
  allowedOrganizationIds: null,
};

const allow = async () => undefined;
const stop = new Error('service 호출까지만 검증');
const meetingId = '11111111-1111-4111-8111-111111111111';
const startAt = '2026-10-07T09:00:00+09:00';
const endAt = '2026-10-07T10:00:00+09:00';

describe('Calendar MCP registrar', () => {
  const listMeetings = jest.fn<
    ReturnType<CalendarMeetingQueryService['listMeetings']>,
    Parameters<CalendarMeetingQueryService['listMeetings']>
  >();
  const getMeeting = jest.fn<
    ReturnType<CalendarMeetingQueryService['getMeeting']>,
    Parameters<CalendarMeetingQueryService['getMeeting']>
  >();
  const previewAvailability = jest.fn<
    ReturnType<CalendarAvailabilityService['previewAvailability']>,
    Parameters<CalendarAvailabilityService['previewAvailability']>
  >();
  const createMeeting = jest.fn<
    ReturnType<CalendarSchedulingService['createMeeting']>,
    Parameters<CalendarSchedulingService['createMeeting']>
  >();
  const rescheduleMeeting = jest.fn<
    ReturnType<CalendarSchedulingService['rescheduleMeeting']>,
    Parameters<CalendarSchedulingService['rescheduleMeeting']>
  >();
  const cancelMeeting = jest.fn<
    ReturnType<CalendarSchedulingService['cancelMeeting']>,
    Parameters<CalendarSchedulingService['cancelMeeting']>
  >();
  const updateRsvp = jest.fn<
    ReturnType<CalendarParticipationService['updateRsvp']>,
    Parameters<CalendarParticipationService['updateRsvp']>
  >();

  const listMeetingRooms = jest.fn<
    ReturnType<CalendarMeetingRoomService['listMeetingRooms']>,
    Parameters<CalendarMeetingRoomService['listMeetingRooms']>
  >();

  const registrar = new CalendarMcpRegistrar(
    { listMeetings, getMeeting },
    { previewAvailability },
    { createMeeting, rescheduleMeeting, cancelMeeting },
    { updateRsvp },
    { listMeetingRooms },
  );

  beforeEach(() => {
    jest.clearAllMocks();
    for (const mock of [
      listMeetings,
      getMeeting,
      previewAvailability,
      createMeeting,
      rescheduleMeeting,
      cancelMeeting,
      updateRsvp,
      listMeetingRooms,
    ]) {
      mock.mockRejectedValue(stop);
    }
  });

  it('회의 목록은 organizationId와 query를 분리한다', async () => {
    await expect(
      registrar
        .tools()[0]!
        .invoke(
          { organizationId: 'org-a', from: startAt, to: endAt },
          auth,
          allow,
        ),
    ).rejects.toBe(stop);

    expect(listMeetings).toHaveBeenCalledWith({ userId: 'user-a' }, 'org-a', {
      from: startAt,
      to: endAt,
    });
  });

  it('회의 조회는 meeting identity를 전달한다', async () => {
    await expect(
      registrar
        .tools()[1]!
        .invoke({ organizationId: 'org-a', meetingId }, auth, allow),
    ).rejects.toBe(stop);

    expect(getMeeting).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      meetingId,
    );
  });

  it('가용성 확인은 organizationId를 body에 섞지 않는다', async () => {
    await expect(
      registrar.tools()[2]!.invoke(
        {
          organizationId: 'org-a',
          startAt,
          endAt,
          timeZone: 'Asia/Seoul',
          meetingRoomId: null,
          attendeeUserIds: ['user-b'],
        },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(previewAvailability).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      {
        startAt,
        endAt,
        timeZone: 'Asia/Seoul',
        meetingRoomId: null,
        attendeeUserIds: ['user-b'],
      },
    );
  });

  it('회의 생성은 identity와 DTO body를 분리한다', async () => {
    await expect(
      registrar.tools()[3]!.invoke(
        {
          organizationId: 'org-a',
          title: '주간 회의',
          category: 'team',
          startAt,
          endAt,
          timeZone: 'Asia/Seoul',
          locationType: 'online',
          locationText: 'https://example.com/meeting',
          attendeeUserIds: [],
        },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(createMeeting).toHaveBeenCalledWith({ userId: 'user-a' }, 'org-a', {
      title: '주간 회의',
      category: 'team',
      startAt,
      endAt,
      timeZone: 'Asia/Seoul',
      locationType: 'online',
      locationText: 'https://example.com/meeting',
      attendeeUserIds: [],
    });
  });

  it('회의 일정 변경은 identity와 DTO body를 분리한다', async () => {
    await expect(
      registrar.tools()[4]!.invoke(
        {
          organizationId: 'org-a',
          meetingId,
          startAt,
          endAt,
          timeZone: 'Asia/Seoul',
          locationType: 'online',
          meetingRoomId: null,
          locationText: null,
          scope: 'single',
        },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(rescheduleMeeting).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      meetingId,
      {
        startAt,
        endAt,
        timeZone: 'Asia/Seoul',
        locationType: 'online',
        meetingRoomId: null,
        locationText: null,
        scope: 'single',
      },
    );
  });

  it('회의 취소는 identity와 DTO body를 분리한다', async () => {
    await expect(
      registrar.tools()[5]!.invoke(
        {
          organizationId: 'org-a',
          meetingId,
          reason: '일정 변경',
          scope: 'single',
        },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(cancelMeeting).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      meetingId,
      { reason: '일정 변경', scope: 'single' },
    );
  });

  it('RSVP는 credential actor의 참석 상태만 변경한다', async () => {
    await expect(
      registrar.tools()[6]!.invoke(
        {
          organizationId: 'org-a',
          meetingId,
          status: 'accepted',
        },
        auth,
        allow,
      ),
    ).rejects.toBe(stop);

    expect(updateRsvp).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      meetingId,
      { status: 'accepted' },
    );
  });

  it('회의실 목록은 조직 identity를 전달한다', async () => {
    await expect(
      registrar.tools()[7]!.invoke({ organizationId: 'org-a' }, auth, allow),
    ).rejects.toBe(stop);

    expect(listMeetingRooms).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
    );
  });
});
