import type {
  CalendarMeetingMutationReceiptSchema,
  CalendarMeetingRsvpMutationReceiptSchema,
  ChatMessageMutationReceiptSchema,
  OrganizationInvitationMutationReceiptSchema,
  ProjectTicketMutationReceiptSchema,
  WikiDocumentMutationReceiptSchema,
} from '@/mcp/contracts/agent-mutation-receipt.dto';

import type { z } from 'zod';

/**
 * application service가 돌려준 authoritative 결과에서 변경 영수증을 만든다.
 * resource ID와 시각은 결과에서 가져오고, 결과 DTO에 없는 상위 식별자(조직·프로젝트)만
 * service가 소속을 검증한 입력값을 사용한다.
 */
const base = { version: 1, source: 'workos' } as const;

export function projectTicketReceipt(input: {
  organizationId: string;
  projectId: string;
  ticketId: string;
  updatedAt: string;
  operation: z.infer<typeof ProjectTicketMutationReceiptSchema>['operation'];
}): z.infer<typeof ProjectTicketMutationReceiptSchema> {
  return {
    ...base,
    kind: 'project_ticket',
    operation: input.operation,
    organizationId: input.organizationId,
    resourceId: input.ticketId,
    projectId: input.projectId,
    updatedAt: input.updatedAt,
  };
}

export function wikiDocumentReceipt(
  document: {
    id: string;
    organizationId: string;
    revision: number;
    updatedAt: string;
  },
  operation: z.infer<typeof WikiDocumentMutationReceiptSchema>['operation'],
): z.infer<typeof WikiDocumentMutationReceiptSchema> {
  return {
    ...base,
    kind: 'wiki_document',
    operation,
    organizationId: document.organizationId,
    resourceId: document.id,
    revision: document.revision,
    updatedAt: document.updatedAt,
  };
}

export function calendarMeetingReceipt(
  meeting: { id: string; organizationId: string; updatedAt: string },
  operation: z.infer<typeof CalendarMeetingMutationReceiptSchema>['operation'],
): z.infer<typeof CalendarMeetingMutationReceiptSchema> {
  return {
    ...base,
    kind: 'calendar_meeting',
    operation,
    organizationId: meeting.organizationId,
    resourceId: meeting.id,
    updatedAt: meeting.updatedAt,
  };
}

export function calendarMeetingRsvpReceipt(meeting: {
  id: string;
  organizationId: string;
  updatedAt: string;
}): z.infer<typeof CalendarMeetingRsvpMutationReceiptSchema> {
  return {
    ...base,
    kind: 'calendar_meeting_rsvp',
    operation: 'responded',
    organizationId: meeting.organizationId,
    resourceId: meeting.id,
    updatedAt: meeting.updatedAt,
  };
}

export function organizationInvitationReceipt(
  organizationId: string,
  invitation: { id: string },
): z.infer<typeof OrganizationInvitationMutationReceiptSchema> {
  return {
    ...base,
    kind: 'organization_invitation',
    operation: 'created',
    organizationId,
    resourceId: invitation.id,
  };
}

export function chatMessageReceipt(
  organizationId: string,
  message: { id: string; conversationId: string },
): z.infer<typeof ChatMessageMutationReceiptSchema> {
  return {
    ...base,
    kind: 'chat_message',
    operation: 'created',
    organizationId,
    resourceId: message.id,
    conversationId: message.conversationId,
  };
}
