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
import { QueryCalendarMeetingsSchema } from '@/calendar/dto/query-calendar-meetings.dto';
import { RescheduleMeetingSchema } from '@/calendar/dto/reschedule-meeting.dto';
import { RsvpMeetingSchema } from '@/calendar/dto/rsvp-meeting.dto';
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
    '명시한 조직과 시간 범위의 회의를 조회합니다. calendar:read scope와 현재 조직 멤버십을 모두 검증하며 기존 시간 범위 및 검색 필터 규칙을 사용합니다.',
  inputSchema: QueryCalendarMeetingsSchema.safeExtend(organizationIdField),
  outputSchema: MeetingListSchema,
  requiredScope: 'calendar:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const calendarMeetingGetTool = defineMcpTool({
  name: 'calendar_meeting_get',
  title: '캘린더 회의 조회',
  description:
    '명시한 조직의 회의 상세를 조회합니다. meetingId만으로 tenant를 추측하지 않으며 organizationId와 현재 조직 접근을 함께 검증합니다.',
  inputSchema: z.object(meetingIdentityFields),
  outputSchema: MeetingDetailSchema,
  requiredScope: 'calendar:read',
  classification: 'read',
  annotations: readOnlyAnnotations,
});

export const calendarAvailabilityCheckTool = defineMcpTool({
  name: 'calendar_availability_check',
  title: '캘린더 가용성 확인',
  description:
    '명시한 시간대의 참석자 및 회의실 충돌을 미리 확인합니다. 현재 actor와 지정 참석자의 조직 멤버십, 회의실 유효성, 시간 범위를 기존 Calendar policy로 검증합니다.',
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
    '명시한 조직에 회의를 생성합니다. 참석자/회의실/project reference/recurrence/conflict 검증과 reminder 동기화를 기존 scheduling service에서 수행하며 다른 사용자에게 영향을 줄 수 있습니다.',
  inputSchema: CreateMeetingSchema.safeExtend(organizationIdField),
  outputSchema: MeetingDetailSchema,
  requiredScope: 'calendar:write',
  classification: 'consequential',
  annotations: consequentialWriteAnnotations,
});

export const calendarMeetingRescheduleTool = defineMcpTool({
  name: 'calendar_meeting_reschedule',
  title: '캘린더 회의 일정 변경',
  description:
    '기존 회의 또는 recurrence 범위의 일정을 변경합니다. 현재 수정 권한, 시간/장소 규칙, 충돌 검증을 적용하고 참석자 일정에 영향을 줄 수 있습니다.',
  inputSchema: RescheduleMeetingSchema.safeExtend(meetingIdentityFields),
  outputSchema: MeetingDetailSchema,
  requiredScope: 'calendar:write',
  classification: 'consequential',
  annotations: consequentialWriteAnnotations,
});

export const calendarMeetingCancelTool = defineMcpTool({
  name: 'calendar_meeting_cancel',
  title: '캘린더 회의 취소',
  description:
    '기존 회의 또는 recurrence 범위를 취소합니다. 현재 수정 권한을 검증하고 reminder를 정리하며 취소는 destructive/consequential 작업으로 취급합니다.',
  inputSchema: CancelMeetingSchema.extend(meetingIdentityFields),
  outputSchema: MeetingDetailSchema,
  requiredScope: 'calendar:write',
  classification: 'destructive',
  annotations: destructiveWriteAnnotations,
});

export const calendarMeetingRsvpTool = defineMcpTool({
  name: 'calendar_meeting_rsvp',
  title: '캘린더 회의 RSVP 변경',
  description:
    '현재 인증된 사용자의 회의 참석 상태를 변경합니다. 다른 userId를 input으로 받을 수 없으며 현재 조직 접근과 attendee 여부를 호출 시점에 검증합니다.',
  inputSchema: RsvpMeetingSchema.extend(meetingIdentityFields),
  outputSchema: MeetingDetailSchema,
  requiredScope: 'calendar:write',
  classification: 'write',
  annotations: writeAnnotations,
});

export const calendarToolDefinitions = [
  calendarMeetingsListTool,
  calendarMeetingGetTool,
  calendarAvailabilityCheckTool,
  calendarMeetingCreateTool,
  calendarMeetingRescheduleTool,
  calendarMeetingCancelTool,
  calendarMeetingRsvpTool,
] as const;
