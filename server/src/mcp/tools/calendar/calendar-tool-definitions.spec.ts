import { calendarToolDefinitions } from '@/mcp/tools/calendar/calendar-tool-definitions';

describe('Calendar MCP tool 정의', () => {
  it('v1 Calendar tool 여덟 개를 고정한다', () => {
    expect(
      calendarToolDefinitions.map(({ name, requiredScope }) => ({
        name,
        requiredScope,
      })),
    ).toEqual([
      { name: 'calendar_meetings_list', requiredScope: 'calendar:read' },
      { name: 'calendar_meeting_get', requiredScope: 'calendar:read' },
      {
        name: 'calendar_availability_check',
        requiredScope: 'calendar:read',
      },
      { name: 'calendar_meeting_create', requiredScope: 'calendar:write' },
      {
        name: 'calendar_meeting_reschedule',
        requiredScope: 'calendar:write',
      },
      { name: 'calendar_meeting_cancel', requiredScope: 'calendar:write' },
      { name: 'calendar_meeting_rsvp', requiredScope: 'calendar:write' },
      { name: 'calendar_rooms_list', requiredScope: 'calendar:read' },
    ]);
  });

  it('회의 목록은 기존 시간 범위 검증을 유지한다', () => {
    const definition = calendarToolDefinitions[0];

    expect(
      definition.inputSchema.parse({
        organizationId: 'org-a',
        from: '2026-10-07T09:00:00+09:00',
        to: '2026-10-07T10:00:00+09:00',
      }),
    ).toMatchObject({ organizationId: 'org-a' });

    expect(() =>
      definition.inputSchema.parse({
        organizationId: 'org-a',
        from: '2026-10-07T10:00:00+09:00',
        to: '2026-10-07T09:00:00+09:00',
      }),
    ).toThrow();
  });

  it('가용성 확인은 참석자 500명 상한을 재사용한다', () => {
    const definition = calendarToolDefinitions[2];
    const base = {
      organizationId: 'org-a',
      startAt: '2026-10-07T09:00:00+09:00',
      endAt: '2026-10-07T10:00:00+09:00',
      timeZone: 'Asia/Seoul',
      meetingRoomId: null,
    };

    expect(
      definition.inputSchema.parse({
        ...base,
        attendeeUserIds: Array.from(
          { length: 500 },
          (_, index) => `user-${index}`,
        ),
      }).attendeeUserIds,
    ).toHaveLength(500);

    expect(() =>
      definition.inputSchema.parse({
        ...base,
        attendeeUserIds: Array.from(
          { length: 501 },
          (_, index) => `user-${index}`,
        ),
      }),
    ).toThrow();
  });

  it('생성/일정 변경은 consequential이고 취소는 destructive다', () => {
    expect(calendarToolDefinitions[3].classification).toBe('consequential');
    expect(calendarToolDefinitions[4].classification).toBe('consequential');
    expect(calendarToolDefinitions[5]).toMatchObject({
      classification: 'destructive',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    });
  });
});
