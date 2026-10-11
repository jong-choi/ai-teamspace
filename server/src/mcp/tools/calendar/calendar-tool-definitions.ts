import {
  CalendarAvailabilityRequestSchema,
  CalendarAvailabilityResponseSchema,
} from '@/calendar/dto/calendar-availability.dto';
import { CancelMeetingSchema } from '@/calendar/dto/cancel-meeting.dto';
import { CreateMeetingSchema } from '@/calendar/dto/create-meeting.dto';
import {
  MeetingDetailSchema,
  MeetingListSchema,
} from '@/calendar/dto/meeting.dto';
import { MeetingRoomListSchema } from '@/calendar/dto/meeting-room.dto';
import { QueryCalendarMeetingsSchema } from '@/calendar/dto/query-calendar-meetings.dto';
import { RescheduleMeetingSchema } from '@/calendar/dto/reschedule-meeting.dto';
import { RsvpMeetingSchema } from '@/calendar/dto/rsvp-meeting.dto';
import {
  CalendarMeetingMutationReceiptSchema,
  CalendarMeetingRsvpMutationReceiptSchema,
  mutationToolOutputSchema,
} from '@/mcp/contracts/agent-mutation-receipt.dto';
import {
  consequentialWriteAnnotations,
  defineMcpTool,
  destructiveWriteAnnotations,
  readOnlyAnnotations,
  writeAnnotations,
} from '@/mcp/tools/mcp-tool-definition';

import { z } from 'zod';

const organizationIdField = {
  organizationId: MeetingDetailSchema.shape.organizationId,
};

const meetingIdentityFields = {
  ...organizationIdField,
  meetingId: MeetingDetailSchema.shape.id,
};

export const calendarMeetingsListTool = defineMcpTool({
  name: 'calendar_meetings_list',
  title: '캘린더 회의 목록 조회',
  description:
    'from~to 사이에 시작하는 조직 회의를 조회합니다. 필터 인자를 생략하면 그 기간의 모든 회의입니다.',
  inputSchema: QueryCalendarMeetingsSchema.safeExtend({
    ...organizationIdField,
    attendeeUserId: QueryCalendarMeetingsSchema.shape.attendeeUserId.describe(
      '이 사용자가 주최하거나 참석자로 초대된 회의만 조회합니다.',
    ),
    search: QueryCalendarMeetingsSchema.shape.search.describe(
      '제목·장소·회의실 이름에 들어 있는 글자.',
    ),
  }),
  outputSchema: MeetingListSchema,
  requiredScope: 'calendar:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const calendarMeetingGetTool = defineMcpTool({
  name: 'calendar_meeting_get',
  title: '캘린더 회의 조회',
  description: '회의 하나의 상세를 조회합니다.',
  inputSchema: z.object(meetingIdentityFields),
  outputSchema: MeetingDetailSchema,
  requiredScope: 'calendar:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const calendarAvailabilityCheckTool = defineMcpTool({
  name: 'calendar_availability_check',
  title: '캘린더 가용성 확인',
  description: '해당 시간에 참석자와 회의실의 일정이 겹치는지 확인합니다.',
  inputSchema:
    CalendarAvailabilityRequestSchema.safeExtend(organizationIdField),
  outputSchema: CalendarAvailabilityResponseSchema,
  requiredScope: 'calendar:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const calendarMeetingCreateTool = defineMcpTool({
  name: 'calendar_meeting_create',
  title: '캘린더 회의 생성',
  description:
    '회의를 만듭니다. 사용자가 주최자가 되고 참석자에게 알림이 갑니다.',
  inputSchema: CreateMeetingSchema.safeExtend({
    ...organizationIdField,
    category: CreateMeetingSchema.shape.category.describe(
      '회의 성격. 따로 정해지지 않은 회의는 team입니다.',
    ),
    timeZone: CreateMeetingSchema.shape.timeZone.describe(
      'IANA 시간대(예: Asia/Seoul).',
    ),
    locationType: CreateMeetingSchema.shape.locationType.describe(
      'online은 온라인 회의. meeting_room이면 meetingRoomId가, other면 locationText가 필요합니다.',
    ),
    meetingRoomId: CreateMeetingSchema.shape.meetingRoomId.describe(
      'calendar_rooms_list 결과의 회의실 id.',
    ),
    attendeeUserIds: CreateMeetingSchema.shape.attendeeUserIds.describe(
      '주최자를 뺀 참석자 userId 목록.',
    ),
    recurrence:
      CreateMeetingSchema.shape.recurrence.describe(
        '반복 회의일 때만 넣습니다.',
      ),
  }),
  outputSchema: mutationToolOutputSchema(
    MeetingDetailSchema,
    CalendarMeetingMutationReceiptSchema,
  ),
  requiredScope: 'calendar:write',
  classification: 'consequential',
  annotations: consequentialWriteAnnotations,
});

export const calendarMeetingRescheduleTool = defineMcpTool({
  name: 'calendar_meeting_reschedule',
  title: '캘린더 회의 일정 변경',
  description:
    '회의의 시간과 장소를 바꿉니다. 장소를 그대로 두려면 calendar_meeting_get 결과의 locationType, meetingRoomId, locationText를 그대로 넣습니다.',
  inputSchema: RescheduleMeetingSchema.safeExtend({
    ...meetingIdentityFields,
    scope: RescheduleMeetingSchema.shape.scope.describe(
      '반복 회의에서 바꿀 범위. single은 이 회차만, future는 이 회차부터, series는 전체.',
    ),
  }),
  outputSchema: mutationToolOutputSchema(
    MeetingDetailSchema,
    CalendarMeetingMutationReceiptSchema,
  ),
  requiredScope: 'calendar:write',
  classification: 'consequential',
  annotations: consequentialWriteAnnotations,
});

export const calendarMeetingCancelTool = defineMcpTool({
  name: 'calendar_meeting_cancel',
  title: '캘린더 회의 취소',
  description: '회의를 취소합니다. 참석자에게 알림이 갑니다.',
  inputSchema: CancelMeetingSchema.extend({
    ...meetingIdentityFields,
    scope: CancelMeetingSchema.shape.scope.describe(
      '반복 회의에서 취소할 범위. single은 이 회차만, future는 이 회차부터, series는 전체.',
    ),
  }),
  outputSchema: mutationToolOutputSchema(
    MeetingDetailSchema,
    CalendarMeetingMutationReceiptSchema,
  ),
  requiredScope: 'calendar:write',
  classification: 'destructive',
  annotations: destructiveWriteAnnotations,
});

export const calendarMeetingRsvpTool = defineMcpTool({
  name: 'calendar_meeting_rsvp',
  title: '캘린더 회의 RSVP 변경',
  description: '사용자 본인의 회의 참석 여부를 응답합니다.',
  inputSchema: RsvpMeetingSchema.extend({
    ...meetingIdentityFields,
    status: RsvpMeetingSchema.shape.status.describe(
      'accepted는 참석, tentative는 미정, declined는 불참.',
    ),
  }),
  outputSchema: mutationToolOutputSchema(
    MeetingDetailSchema,
    CalendarMeetingRsvpMutationReceiptSchema,
  ),
  requiredScope: 'calendar:write',
  classification: 'write',
  annotations: writeAnnotations,
});

export const calendarRoomsListTool = defineMcpTool({
  name: 'calendar_rooms_list',
  title: '회의실 목록 조회',
  description:
    '조직의 회의실 목록을 조회합니다. 결과의 id를 회의 생성·일정 변경의 meetingRoomId에 씁니다.',
  inputSchema: z.object(organizationIdField),
  outputSchema: MeetingRoomListSchema,
  requiredScope: 'calendar:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const calendarToolDefinitions = [
  calendarMeetingsListTool,
  calendarMeetingGetTool,
  calendarAvailabilityCheckTool,
  calendarMeetingCreateTool,
  calendarMeetingRescheduleTool,
  calendarMeetingCancelTool,
  calendarMeetingRsvpTool,
  calendarRoomsListTool,
] as const;
